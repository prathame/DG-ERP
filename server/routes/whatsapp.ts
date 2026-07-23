/**
 * Meta WhatsApp Cloud API send — text (+ link in body) for cloud tenants with Business ON.
 * Credentials resolved server-side by tenant mode; never returned to the client.
 */
import { Router } from 'express';
import { pool } from '../pg-db';
import { AuthRequest } from '../middleware/auth';
import { handleApiError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { decryptSecret } from '../utils/secret-crypto';
import { normalizeWhatsAppTo, resolveWhatsAppCreds } from '../utils/whatsappBusiness';

const router = Router();

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION || 'v21.0';

async function callMetaSendText(opts: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
}): Promise<{ ok: true; messageId?: string } | { ok: false; status: number; error: string }> {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(opts.phoneNumberId)}/messages`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: opts.to,
        type: 'text',
        text: { preview_url: true, body: opts.body },
      }),
    });
  } catch (err) {
    return { ok: false, status: 502, error: err instanceof Error ? err.message : 'Meta request failed' };
  }

  const raw = (await res.json().catch(() => ({}))) as {
    messages?: { id?: string }[];
    error?: { message?: string; error_user_msg?: string };
  };
  if (!res.ok) {
    const msg = raw.error?.error_user_msg || raw.error?.message || `Meta API ${res.status}`;
    return { ok: false, status: res.status >= 400 && res.status < 600 ? res.status : 502, error: msg };
  }
  return { ok: true, messageId: raw.messages?.[0]?.id };
}

router.post('/api/whatsapp/send', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId || (req.headers['x-tenant-id'] as string | undefined);
    const userId = req.user?.userId;
    if (!tenantId || !userId) {
      return res.status(401).json({ error: 'Authentication required', code: 'WHATSAPP_API_UNAVAILABLE' });
    }

    const toRaw = String(req.body?.to ?? req.body?.phone ?? '').trim();
    const message = String(req.body?.message ?? req.body?.text ?? '').trim();
    if (!toRaw || !message) {
      return res.status(400).json({ error: 'to and message are required', code: 'WHATSAPP_API_UNAVAILABLE' });
    }
    if (message.length > 4096) {
      return res.status(400).json({ error: 'message too long (max 4096)', code: 'WHATSAPP_API_UNAVAILABLE' });
    }

    const to = normalizeWhatsAppTo(toRaw);
    if (!to) {
      return res.status(400).json({ error: 'Invalid phone number', code: 'WHATSAPP_API_UNAVAILABLE' });
    }

    const row = (
      await pool.query(
        `SELECT t.whatsapp_business_enabled, t.whatsapp_send_mode,
                t.whatsapp_phone_number_id, t.whatsapp_access_token,
                u.whatsapp_api_allowed, u.whatsapp_phone_number_id AS user_phone_number_id,
                u.whatsapp_access_token AS user_access_token
         FROM tenants t
         JOIN users u ON u.tenant_id = t.id AND u.id = $2
         WHERE t.id = $1`,
        [tenantId, userId],
      )
    ).rows[0] as
      | {
          whatsapp_business_enabled: boolean;
          whatsapp_send_mode: string | null;
          whatsapp_phone_number_id: string | null;
          whatsapp_access_token: string | null;
          whatsapp_api_allowed: boolean;
          user_phone_number_id: string | null;
          user_access_token: string | null;
        }
      | undefined;

    if (!row) {
      return res.status(404).json({ error: 'User not found', code: 'WHATSAPP_API_UNAVAILABLE' });
    }

    let companyToken = '';
    let userToken = '';
    try {
      companyToken = row.whatsapp_access_token ? decryptSecret(row.whatsapp_access_token) : '';
      userToken = row.user_access_token ? decryptSecret(row.user_access_token) : '';
    } catch (err) {
      logger.warn('WhatsApp token decrypt failed', {
        tenantId,
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
      return res.status(500).json({ error: 'WhatsApp credentials unavailable', code: 'WHATSAPP_API_UNAVAILABLE' });
    }

    const creds = resolveWhatsAppCreds({
      enabled: !!row.whatsapp_business_enabled,
      mode: row.whatsapp_send_mode,
      companyPhoneNumberId: row.whatsapp_phone_number_id,
      companyAccessToken: companyToken,
      userAllowed: !!row.whatsapp_api_allowed,
      userPhoneNumberId: row.user_phone_number_id,
      userAccessToken: userToken,
    });

    if (!creds) {
      return res.status(403).json({
        error: 'WhatsApp Business API not available for this user',
        code: 'WHATSAPP_API_UNAVAILABLE',
      });
    }

    const result = await callMetaSendText({
      phoneNumberId: creds.phoneNumberId,
      accessToken: creds.accessToken,
      to,
      body: message,
    });

    if (result.ok === false) {
      logger.warn('WhatsApp Cloud API send failed', {
        tenantId,
        userId,
        status: result.status,
        error: result.error,
      });
      return res.status(502).json({
        error: result.error || 'WhatsApp send failed',
        code: 'WHATSAPP_API_FAILED',
      });
    }

    res.json({ ok: true, messageId: result.messageId ?? null });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
