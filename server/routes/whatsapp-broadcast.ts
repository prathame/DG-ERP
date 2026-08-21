/**
 * WhatsApp Broadcast — send message + optional image/PDF to all or selected recipients.
 *
 * POST /api/whatsapp/broadcast        → start a broadcast job (returns broadcastId)
 * GET  /api/whatsapp/broadcast/:id    → poll status (sent/failed/total)
 * GET  /api/whatsapp/broadcast        → list recent broadcasts
 */
import { Router } from 'express';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { sendImageViaWeb, sendTextViaWeb, isConnected } from '../services/whatsappWebSession';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

/** Replace {placeholders} with recipient data. */
function applyTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] ?? '');
}

/** Fetch recipient list from DB. */
async function fetchRecipients(
  tenantId: string,
  recipientType: string,
  recipientIds: string[],
): Promise<{ id: string; name: string; phone: string }[]> {
  if (recipientType === 'selected_customers' && recipientIds.length > 0) {
    const { rows } = await pool.query(
      `SELECT id, name, COALESCE(phone, '') as phone FROM customers WHERE tenant_id = $1 AND id = ANY($2) AND phone IS NOT NULL AND phone != ''`,
      [tenantId, recipientIds],
    );
    return rows as { id: string; name: string; phone: string }[];
  }
  if (recipientType === 'all_vendors') {
    const { rows } = await pool.query(
      `SELECT id, name, COALESCE(phone, '') as phone FROM vendors WHERE tenant_id = $1 AND phone IS NOT NULL AND phone != '' AND id != 'OWNER'`,
      [tenantId],
    );
    return rows as { id: string; name: string; phone: string }[];
  }
  if (recipientType === 'selected_vendors' && recipientIds.length > 0) {
    const { rows } = await pool.query(
      `SELECT id, name, COALESCE(phone, '') as phone FROM vendors WHERE tenant_id = $1 AND id = ANY($2) AND phone IS NOT NULL AND phone != ''`,
      [tenantId, recipientIds],
    );
    return rows as { id: string; name: string; phone: string }[];
  }
  // Default: all_customers
  const { rows } = await pool.query(
    `SELECT id, name, COALESCE(phone, '') as phone FROM customers WHERE tenant_id = $1 AND phone IS NOT NULL AND phone != ''`,
    [tenantId],
  );
  return rows as { id: string; name: string; phone: string }[];
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get('/api/whatsapp/broadcast', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query(
      `SELECT id, message, recipient_type, total_recipients, sent_count, failed_count, status, created_at, completed_at
       FROM whatsapp_broadcasts WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 20`,
      [tenantId],
    );
    res.json(rows);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/whatsapp/broadcast/:id', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query(
      `SELECT id, message, recipient_type, total_recipients, sent_count, failed_count, status, created_at, completed_at
       FROM whatsapp_broadcasts WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Broadcast not found' });
    res.json(rows[0]);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/whatsapp/broadcast', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    if (!isConnected(tenantId)) {
      return res.status(400).json({ error: 'WhatsApp not connected. Go to Settings → Data Management to connect.' });
    }

    const {
      message,
      imageBase64,
      imageMimetype,
      recipientType = 'all_customers',
      recipientIds = [],
    } = req.body as {
      message: string;
      imageBase64?: string;
      imageMimetype?: string;
      recipientType?: string;
      recipientIds?: string[];
    };

    if (!message?.trim()) return res.status(400).json({ error: 'message is required' });
    if (message.length > 4096) return res.status(400).json({ error: 'message too long (max 4096 chars)' });

    const validTypes = ['all_customers', 'selected_customers', 'all_vendors', 'selected_vendors'];
    if (!validTypes.includes(recipientType)) {
      return res.status(400).json({ error: `recipientType must be one of: ${validTypes.join(', ')}` });
    }

    const recipients = await fetchRecipients(tenantId, recipientType, recipientIds);
    if (recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients with phone numbers found' });
    }

    const broadcastId = uid('WB');
    await pool.query(
      `INSERT INTO whatsapp_broadcasts (id, tenant_id, message, image_base64, image_mimetype, recipient_type, recipient_ids, status, total_recipients)
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, 'running', $8)`,
      [
        broadcastId,
        tenantId,
        message,
        imageBase64 || null,
        imageMimetype || null,
        recipientType,
        JSON.stringify(recipientIds),
        recipients.length,
      ],
    );

    // Run broadcast in background — don't block the HTTP response
    res.json({ ok: true, broadcastId, totalRecipients: recipients.length });

    // ── Background send loop ──────────────────────────────────────────────────
    (async () => {
      let sent = 0;
      let failed = 0;
      const imageBuffer = imageBase64 ? Buffer.from(imageBase64, 'base64') : null;
      const mime = (imageMimetype || 'image/jpeg') as 'image/jpeg' | 'image/png' | 'image/webp';

      for (const recipient of recipients) {
        if (!isConnected(tenantId)) {
          logger.warn('WA broadcast aborted — session disconnected', { tenantId, broadcastId });
          break;
        }
        let success = false;
        let errorMessage: string | null = null;
        try {
          const personalised = applyTemplate(message, {
            customerName: recipient.name,
            name: recipient.name,
            phone: recipient.phone,
            businessName: '',
          });

          if (imageBuffer) {
            await sendImageViaWeb(tenantId, recipient.phone, imageBuffer, mime, personalised);
          } else {
            await sendTextViaWeb(tenantId, recipient.phone, personalised);
          }
          sent++;
          success = true;
        } catch (err) {
          failed++;
          errorMessage = err instanceof Error ? err.message : String(err);
          logger.warn('WA broadcast send failed', {
            tenantId,
            broadcastId,
            phone: recipient.phone,
            error: errorMessage,
          });
        }

        await pool.query(
          `INSERT INTO whatsapp_broadcast_recipients (id, broadcast_id, tenant_id, name, phone, status, error_message, sent_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            uid('WBR'),
            broadcastId,
            tenantId,
            recipient.name,
            recipient.phone,
            success ? 'sent' : 'failed',
            errorMessage,
            success ? new Date().toISOString() : null,
          ],
        );

        await pool.query(
          `UPDATE whatsapp_broadcasts SET sent_count = $1, failed_count = $2 WHERE id = $3 AND tenant_id = $4`,
          [sent, failed, broadcastId, tenantId],
        );

        // Rate limit: 2.5s between messages to avoid ban
        await sleep(2500);
      }

      await pool.query(
        `UPDATE whatsapp_broadcasts SET status = 'completed', sent_count = $1, failed_count = $2, completed_at = NOW() WHERE id = $3 AND tenant_id = $4`,
        [sent, failed, broadcastId, tenantId],
      );
      logger.info('WA broadcast completed', { tenantId, broadcastId, sent, failed, total: recipients.length });
    })().catch(err => {
      logger.error('WA broadcast loop crashed', { tenantId, broadcastId, error: String(err) });
      pool
        .query(
          `UPDATE whatsapp_broadcasts SET status = 'failed', completed_at = NOW() WHERE id = $1 AND tenant_id = $2`,
          [broadcastId, tenantId],
        )
        .catch(() => {});
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/whatsapp/broadcast/:id/recipients', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query(
      `SELECT id, name, phone, status, error_message, sent_at
       FROM whatsapp_broadcast_recipients WHERE broadcast_id = $1 AND tenant_id = $2 ORDER BY sent_at ASC NULLS LAST`,
      [req.params.id, tenantId],
    );
    res.json(rows);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
