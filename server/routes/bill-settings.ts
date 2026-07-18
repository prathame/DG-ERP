import { Router } from 'express';
import { pool } from '../pg-db';
import { logAudit } from '../utils/helpers';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

const DEFAULTS = {
  logoBase64: null,
  primaryColor: '#F27D26',
  tagline: null,
  invoicePrefix: null,
  challanPrefix: null,
  bankAccountName: null,
  bankAccountNumber: null,
  bankName: null,
  bankBranch: null,
  bankIfsc: null,
  bankUpiId: null,
  termsAndConditions: null,
  signatoryName: null,
  signatoryDesignation: null,
  signatureBase64: null,
  showRewards: true,
  showBarcode: true,
  showWarranty: true,
  footerText: 'Powered by Dhandho Management',
  invoiceTemplateStyle: 'modern' as const,
};

function normalizeInvoiceTemplateStyle(v: unknown): 'modern' | 'classic' | 'minimal' {
  return v === 'classic' || v === 'minimal' || v === 'modern' ? v : 'modern';
}

function rowToResponse(row: Record<string, unknown>) {
  return {
    logoBase64: row.logo_base64 ?? null,
    primaryColor: (row.primary_color as string) || '#F27D26',
    tagline: row.tagline ?? null,
    invoicePrefix: row.invoice_prefix ?? null,
    challanPrefix: row.challan_prefix ?? null,
    bankAccountName: row.bank_account_name ?? null,
    bankAccountNumber: row.bank_account_number ?? null,
    bankName: row.bank_name ?? null,
    bankBranch: row.bank_branch ?? null,
    bankIfsc: row.bank_ifsc ?? null,
    bankUpiId: row.bank_upi_id ?? null,
    termsAndConditions: row.terms_and_conditions ?? null,
    signatoryName: row.signatory_name ?? null,
    signatoryDesignation: row.signatory_designation ?? null,
    signatureBase64: row.signature_base64 ?? null,
    showRewards: row.show_rewards !== false,
    showBarcode: row.show_barcode !== false,
    showWarranty: row.show_warranty !== false,
    footerText: (row.footer_text as string) || 'Powered by Dhandho Management',
    invoiceTemplateStyle: normalizeInvoiceTemplateStyle(row.invoice_template_style),
  };
}

router.get('/api/settings/bill', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

    const { rows } = await pool.query('SELECT * FROM bill_settings WHERE tenant_id = $1', [tenantId]);
    res.json(rows[0] ? rowToResponse(rows[0]) : DEFAULTS);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load bill settings' });
  }
});

router.put('/api/settings/bill', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });

    const role = req.user?.role;
    if (!role || !['Admin', 'Super Admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const requestBody = req.body;

    if (requestBody.primaryColor && !/^#[0-9a-fA-F]{6}$/.test(requestBody.primaryColor)) {
      return res.status(400).json({ error: 'Invalid color format. Use hex like #FF6600' });
    }
    if (requestBody.logoBase64) {
      if (
        !/^data:image\/(jpeg|png|webp|gif);base64,/.test(requestBody.logoBase64) ||
        requestBody.logoBase64.length > 700_000
      ) {
        return res.status(400).json({ error: 'Logo must be JPEG, PNG, WebP or GIF under 500KB' });
      }
    }
    if (requestBody.signatureBase64) {
      if (
        !/^data:image\/(jpeg|png|webp|gif);base64,/.test(requestBody.signatureBase64) ||
        requestBody.signatureBase64.length > 700_000
      ) {
        return res.status(400).json({ error: 'Signature must be JPEG, PNG, WebP or GIF under 500KB' });
      }
    }
    if (
      requestBody.signatureBase64 &&
      (!requestBody.signatureBase64.startsWith('data:image/') || requestBody.signatureBase64.length > 700_000)
    ) {
      return res.status(400).json({ error: 'Signature must be a valid image under 500KB' });
    }
    if (requestBody.invoicePrefix && requestBody.invoicePrefix.length > 20) {
      return res.status(400).json({ error: 'Invoice prefix max 20 characters' });
    }
    if (requestBody.termsAndConditions && requestBody.termsAndConditions.length > 2000) {
      return res.status(400).json({ error: 'Terms & Conditions max 2000 characters' });
    }

    const invoiceTemplateStyle = normalizeInvoiceTemplateStyle(requestBody.invoiceTemplateStyle);

    const { rows } = await pool.query(
      `
      INSERT INTO bill_settings (
        tenant_id, logo_base64, primary_color, tagline,
        invoice_prefix, challan_prefix,
        bank_account_name, bank_account_number, bank_name, bank_branch, bank_ifsc, bank_upi_id,
        terms_and_conditions, signatory_name, signatory_designation, signature_base64,
        show_rewards, show_barcode, show_warranty, footer_text, invoice_template_style, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21, NOW())
      ON CONFLICT (tenant_id) DO UPDATE SET
        logo_base64 = $2, primary_color = $3, tagline = $4,
        invoice_prefix = $5, challan_prefix = $6,
        bank_account_name = $7, bank_account_number = $8, bank_name = $9, bank_branch = $10, bank_ifsc = $11, bank_upi_id = $12,
        terms_and_conditions = $13, signatory_name = $14, signatory_designation = $15, signature_base64 = $16,
        show_rewards = $17, show_barcode = $18, show_warranty = $19, footer_text = $20,
        invoice_template_style = $21, updated_at = NOW()
      RETURNING *
    `,
      [
        tenantId,
        requestBody.logoBase64 ?? null,
        requestBody.primaryColor || '#F27D26',
        requestBody.tagline ?? null,
        requestBody.invoicePrefix ?? null,
        requestBody.challanPrefix ?? null,
        requestBody.bankAccountName ?? null,
        requestBody.bankAccountNumber ?? null,
        requestBody.bankName ?? null,
        requestBody.bankBranch ?? null,
        requestBody.bankIfsc ?? null,
        requestBody.bankUpiId ?? null,
        requestBody.termsAndConditions ?? null,
        requestBody.signatoryName ?? null,
        requestBody.signatoryDesignation ?? null,
        requestBody.signatureBase64 ?? null,
        requestBody.showRewards !== false,
        requestBody.showBarcode !== false,
        requestBody.showWarranty !== false,
        requestBody.footerText || 'Powered by Dhandho Management',
        invoiceTemplateStyle,
      ],
    );

    res.json(rowToResponse(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'Failed to save bill settings' });
  }
});

export default router;
