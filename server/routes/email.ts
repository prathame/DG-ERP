/**
 * Email — SMTP configuration + send invoice via email.
 *
 * GET  /api/email/settings          → { smtpHost, smtpPort, smtpUser, fromName, fromEmail, useSsl, invoiceSubject, invoiceTemplate }
 * PUT  /api/email/settings          → save SMTP config (password encrypted at rest)
 * POST /api/email/send-invoice      → send invoice PDF as email attachment
 * POST /api/email/test              → send test email to verify SMTP works
 * GET  /api/email/log               → last 50 sent emails
 */
import { Router } from 'express';
import nodemailer from 'nodemailer';
import { requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { encryptSecret, decryptSecret } from '../utils/secret-crypto';

const router = Router();

const DEFAULT_SUBJECT = 'Invoice {invoiceNumber} from {businessName}';
const DEFAULT_TEMPLATE = `Dear {customerName},

Please find attached your invoice {invoiceNumber} dated {date} for ₹{amount}.

Thank you for your business!

Regards,
{businessName}`;

function applyTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => data[key] ?? '');
}

function rowToSettings(row: Record<string, unknown>) {
  return {
    smtpHost: (row.smtp_host as string) || 'smtp.gmail.com',
    smtpPort: Number(row.smtp_port) || 587,
    smtpUser: (row.smtp_user as string) || null,
    hasPassword: !!(row.smtp_password as string),
    fromName: (row.from_name as string) || null,
    fromEmail: (row.from_email as string) || null,
    useSsl: row.use_ssl === true,
    invoiceSubject: (row.invoice_subject as string) || DEFAULT_SUBJECT,
    invoiceTemplate: (row.invoice_template as string) || DEFAULT_TEMPLATE,
  };
}

// ── Settings ──────────────────────────────────────────────────────────────────

router.get('/api/email/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query('SELECT * FROM email_settings WHERE tenant_id = $1', [tenantId]);
    if (!rows[0])
      return res.json(
        rowToSettings({
          smtp_host: 'smtp.gmail.com',
          smtp_port: 587,
          use_ssl: false,
          invoice_subject: DEFAULT_SUBJECT,
          invoice_template: DEFAULT_TEMPLATE,
        }),
      );
    res.json(rowToSettings(rows[0] as Record<string, unknown>));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/email/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { smtpHost, smtpPort, smtpUser, smtpPassword, fromName, fromEmail, useSsl, invoiceSubject, invoiceTemplate } =
      req.body as Record<string, unknown>;

    // Encrypt password if provided
    const existing = (await pool.query('SELECT smtp_password FROM email_settings WHERE tenant_id = $1', [tenantId]))
      .rows[0] as { smtp_password?: string } | undefined;
    const encryptedPwd = smtpPassword ? encryptSecret(String(smtpPassword)) : existing?.smtp_password || null;

    await pool.query(
      `INSERT INTO email_settings (tenant_id, smtp_host, smtp_port, smtp_user, smtp_password, from_name, from_email, use_ssl, invoice_subject, invoice_template, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         smtp_host = $2, smtp_port = $3, smtp_user = $4,
         smtp_password = COALESCE($5, email_settings.smtp_password),
         from_name = $6, from_email = $7, use_ssl = $8,
         invoice_subject = COALESCE($9, email_settings.invoice_subject),
         invoice_template = COALESCE($10, email_settings.invoice_template),
         updated_at = NOW()`,
      [
        tenantId,
        smtpHost || 'smtp.gmail.com',
        Number(smtpPort) || 587,
        smtpUser || null,
        encryptedPwd,
        fromName || null,
        fromEmail || null,
        !!useSsl,
        invoiceSubject || null,
        invoiceTemplate || null,
      ],
    );
    const { rows } = await pool.query('SELECT * FROM email_settings WHERE tenant_id = $1', [tenantId]);
    res.json(rowToSettings(rows[0] as Record<string, unknown>));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ── Build transporter from saved settings ─────────────────────────────────────

async function getTransporter(tenantId: string) {
  const { rows } = await pool.query('SELECT * FROM email_settings WHERE tenant_id = $1', [tenantId]);
  const row = rows[0] as Record<string, unknown> | undefined;
  if (!row?.smtp_user || !row?.smtp_password)
    throw new Error('Email not configured. Go to Settings → Communication → Email to set up SMTP.');
  const password = decryptSecret(row.smtp_password as string);
  return nodemailer.createTransport({
    host: (row.smtp_host as string) || 'smtp.gmail.com',
    port: Number(row.smtp_port) || 587,
    secure: row.use_ssl === true,
    auth: { user: row.smtp_user as string, pass: password },
  });
}

// ── Send invoice ──────────────────────────────────────────────────────────────

router.post('/api/email/send-invoice', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { toEmail, toName, invoiceId, pdfBase64, filename, subject, body } = req.body as {
      toEmail: string;
      toName?: string;
      invoiceId?: string;
      pdfBase64: string;
      filename: string;
      subject?: string;
      body?: string;
    };

    if (!toEmail || !pdfBase64 || !filename)
      return res.status(400).json({ error: 'toEmail, pdfBase64 and filename required' });

    // Get settings for from address
    const { rows: settingsRows } = await pool.query('SELECT * FROM email_settings WHERE tenant_id = $1', [tenantId]);
    const settings = settingsRows[0] as Record<string, unknown> | undefined;
    const fromEmail = settings?.from_email as string | undefined;
    const fromName = settings?.from_name as string | undefined;
    if (!fromEmail)
      return res.status(400).json({ error: 'Sender email not configured. Go to Settings → Communication → Email.' });

    const transporter = await getTransporter(tenantId);

    const finalSubject = subject || (settings?.invoice_subject as string) || DEFAULT_SUBJECT;
    const finalBody =
      body ||
      applyTemplate((settings?.invoice_template as string) || DEFAULT_TEMPLATE, {
        customerName: toName || toEmail,
        invoiceNumber: filename.replace('.pdf', ''),
        date: new Date().toLocaleDateString('en-IN'),
        amount: '',
        businessName: fromName || '',
      });

    await transporter.sendMail({
      from: fromName ? `"${fromName}" <${fromEmail}>` : fromEmail,
      to: toName ? `"${toName}" <${toEmail}>` : toEmail,
      subject: finalSubject,
      text: finalBody,
      attachments: [{ filename, content: Buffer.from(pdfBase64, 'base64'), contentType: 'application/pdf' }],
    });

    // Log
    await pool
      .query(
        'INSERT INTO email_log (id, tenant_id, to_email, to_name, subject, status, invoice_id) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [uid('EML'), tenantId, toEmail, toName || null, finalSubject, 'sent', invoiceId || null],
      )
      .catch(() => {});

    logger.info('Email invoice sent', { tenantId, toEmail, filename });
    res.json({ ok: true });
  } catch (err) {
    // Log failure
    const tenantId = req.headers['x-tenant-id'] as string;
    if (tenantId) {
      pool
        .query(
          'INSERT INTO email_log (id, tenant_id, to_email, to_name, subject, status, error_message) VALUES ($1,$2,$3,$4,$5,$6,$7)',
          [
            uid('EML'),
            tenantId,
            req.body?.toEmail || '',
            req.body?.toName || null,
            req.body?.subject || '',
            'failed',
            err instanceof Error ? err.message : String(err),
          ],
        )
        .catch(() => {});
    }
    return handleApiError(req, res, err, 'Failed to send email');
  }
});

// ── Test email ────────────────────────────────────────────────────────────────

router.post('/api/email/test', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const transporter = await getTransporter(tenantId);
    const { rows } = await pool.query('SELECT from_email, from_name FROM email_settings WHERE tenant_id = $1', [
      tenantId,
    ]);
    const s = rows[0] as { from_email?: string; from_name?: string } | undefined;
    if (!s?.from_email) return res.status(400).json({ error: 'Sender email not set' });
    await transporter.sendMail({
      from: s.from_name ? `"${s.from_name}" <${s.from_email}>` : s.from_email,
      to: s.from_email,
      subject: 'Dhandho — Email test successful ✅',
      text: 'Your email settings are working correctly. You can now send invoices via email.',
    });
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err, 'Test email failed');
  }
});

// ── Log ───────────────────────────────────────────────────────────────────────

router.get('/api/email/log', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query(
      'SELECT id, to_email, to_name, subject, status, error_message, invoice_id, sent_at FROM email_log WHERE tenant_id = $1 ORDER BY sent_at DESC LIMIT 50',
      [tenantId],
    );
    res.json(rows);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
