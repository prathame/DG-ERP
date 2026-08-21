/**
 * WhatsApp Web (Baileys) session routes.
 *
 * GET  /api/whatsapp-web/status     → { status, qrDataUrl, phoneNumber }
 * POST /api/whatsapp-web/connect    → initiate / re-initiate connection
 * DELETE /api/whatsapp-web/disconnect → logout
 * POST /api/whatsapp-web/send-pdf   → send PDF buffer to a number (internal)
 */
import { Router } from 'express';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { handleApiError } from '../utils/http-error';
import {
  connectSession,
  disconnectSession,
  getSessionStatus,
  sendPdfViaWeb,
  sendTextViaWeb,
} from '../services/whatsappWebSession';

const router = Router();

router.get('/api/whatsapp-web/status', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    res.json(getSessionStatus(tenantId));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/whatsapp-web/connect', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    // Start connection in background — QR arrives via polling /status
    connectSession(tenantId).catch(() => {});
    res.json({ ok: true, message: 'Connecting — poll /api/whatsapp-web/status for QR' });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/whatsapp-web/disconnect', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    await disconnectSession(tenantId);
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Internal endpoint — called by frontend after generating PDF blob. */
router.post('/api/whatsapp-web/send-pdf', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { phone, filename, caption, pdfBase64 } = req.body as {
      phone: string;
      filename: string;
      caption?: string;
      pdfBase64: string;
    };
    if (!phone || !pdfBase64 || !filename) {
      return res.status(400).json({ error: 'phone, filename and pdfBase64 required' });
    }
    const pdfBuffer = Buffer.from(pdfBase64, 'base64');
    await sendPdfViaWeb(tenantId, phone, pdfBuffer, filename, caption);
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/whatsapp-web/send-text', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { phone, message } = req.body as { phone: string; message: string };
    if (!phone || !message) return res.status(400).json({ error: 'phone and message required' });
    await sendTextViaWeb(tenantId, phone, message);
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
