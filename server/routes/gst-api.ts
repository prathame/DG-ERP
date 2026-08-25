/**
 * GST API routes — E-invoice (IRN) + E-way Bill
 */

import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { splitGst, isValidGstin } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { logger } from '../utils/logger';
import { encryptSecret } from '../utils/secret-crypto';
import { resolveGstRate } from '../utils/price-resolve';
import {
  NicApiClient,
  buildIrnPayload,
  buildEwbPayload,
  loadGstCredentials,
  isValidPin,
  resolveSupplyType,
  type GstApiMode,
} from '../services/nic-api';
import {
  generateStandaloneInvoiceEwb,
  generateStandaloneInvoiceEwbByIrn,
  generateStandaloneInvoiceIrn,
  generateStandaloneInvoiceIrnAndEwb,
  StandaloneInvoiceGstError,
} from '../services/standaloneInvoiceGst';
import {
  buildStandaloneEinvoiceNicJson,
  buildStandaloneEwaybillNicJson,
  clearBatchGstFiling,
  clearStandaloneInvoiceGstFiling,
  importBatchEwb,
  importBatchIrn,
  importBatchPortalResponse,
  importStandaloneInvoiceEwb,
  importStandaloneInvoiceIrn,
  importStandaloneInvoicePortalResponse,
} from '../services/einvoicePortal';
import { checkEinvoiceEligibility, lookupTransportDistance } from '../services/gstCompliance';
import type { Response } from 'express';
import { isEinvoiceApiMode, isEinvoicePortalMode, normalizeEinvoiceMode } from '../../shared/gstEinvoiceMode';

const router = Router();

/** Block IRN/EWB when tenant master toggle is off (Settings → GST). */
async function einvoiceDisabledResponse(req: AuthRequest, res: Response, tenantId: string): Promise<boolean> {
  const row = (await pool.query('SELECT einvoice_enabled, einvoice_mode FROM tenants WHERE id = $1', [tenantId]))
    .rows[0] as { einvoice_enabled?: boolean; einvoice_mode?: string } | undefined;
  if (row?.einvoice_enabled) return false;
  res.status(403).json({
    error: 'E-Invoice & E-Way Bill is disabled. Enable it under Settings → GST Settings.',
  });
  return true;
}

async function tenantEinvoiceMode(tenantId: string): Promise<string> {
  const row = (await pool.query('SELECT einvoice_mode FROM tenants WHERE id = $1', [tenantId])).rows[0] as
    { einvoice_mode?: string } | undefined;
  return String(row?.einvoice_mode || 'portal');
}

/** API generation (NIC credentials) — only when mode is automatic (api). */
async function einvoiceApiDisabledResponse(req: AuthRequest, res: Response, tenantId: string): Promise<boolean> {
  if (await einvoiceDisabledResponse(req, res, tenantId)) return true;
  if (isEinvoiceApiMode(await tenantEinvoiceMode(tenantId))) return false;
  res.status(403).json({
    error:
      'API generation is only available in Automatic mode. Switch to Manual mode to download JSON and import IRN/EWB from the government portal.',
  });
  return true;
}

/** Portal JSON / import — only when mode is manual. */
async function einvoicePortalDisabledResponse(req: AuthRequest, res: Response, tenantId: string): Promise<boolean> {
  if (await einvoiceDisabledResponse(req, res, tenantId)) return true;
  if (isEinvoicePortalMode(await tenantEinvoiceMode(tenantId))) return false;
  res.status(403).json({
    error:
      'Portal JSON workflow is only available in Manual mode. Switch to Automatic mode for API generation, or change Generation Mode under GST Settings.',
  });
  return true;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Client-safe GST errors — never leak stack/SQL/paths. Internal details stay in logs. */
function safeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'Internal server error';
  // Allow only short, expected validation/config messages (no DB/stack/path leakage)
  if (
    /^(GST API|IRN|EWB|E-way bill|Invoice|not configured|already has|Batch not|required|Invalid|credentials|crypto|pincode|GSTIN|B2B|Valid|vehicleNo|distance)/i.test(
      msg,
    ) &&
    msg.length < 160 &&
    !/[\\/]\w+\.\w+/.test(msg) &&
    !/select\s|insert\s|update\s|relation\s/i.test(msg)
  ) {
    return msg;
  }
  return 'Internal server error';
}

function resolveSellerGstin(
  mode: GstApiMode,
  fromSettings: string | undefined,
  fromTenant: string | undefined,
  fromCreds: string,
): string | null {
  const g = (fromSettings || fromTenant || fromCreds || '').toUpperCase().trim();
  if (mode === 'mock') return g || '24AAAPZ9999G1ZI';
  if (!g || !isValidGstin(g)) return null;
  return g;
}

function resolvePins(
  mode: GstApiMode,
  sellerPinIn: string | undefined,
  buyerPinIn: string | undefined,
  settingsPin: string,
): { sellerPin: string; buyerPin: string } | { error: string } {
  const sellerPin = String(sellerPinIn || settingsPin || '').trim();
  const buyerPin = String(buyerPinIn || sellerPin || '').trim();
  if (mode === 'mock') {
    return {
      sellerPin: isValidPin(sellerPin) ? sellerPin : '380001',
      buyerPin: isValidPin(buyerPin) ? buyerPin : '380001',
    };
  }
  if (!isValidPin(sellerPin)) {
    return { error: 'Valid 6-digit seller pincode required (body.sellerPin or Settings → GST API).' };
  }
  if (!isValidPin(buyerPin)) {
    return { error: 'Valid 6-digit buyer pincode required (body.buyerPin).' };
  }
  return { sellerPin, buyerPin };
}

router.get('/api/gst/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const row = (
      await pool.query(
        'SELECT gst_api_mode, gst_api_gstin, gst_api_username, gst_api_client_id, gst_api_seller_pin FROM bill_settings WHERE tenant_id = $1',
        [tenantId],
      )
    ).rows[0] as Record<string, string> | undefined;
    const tenantRow = (
      await pool.query('SELECT einvoice_enabled, einvoice_mode, ewb_with_einvoice FROM tenants WHERE id = $1', [
        tenantId,
      ])
    ).rows[0] as Record<string, unknown> | undefined;
    res.json({
      mode: row?.gst_api_mode || 'mock',
      gstin: row?.gst_api_gstin || '',
      username: row?.gst_api_username || '',
      clientId: row?.gst_api_client_id || '',
      sellerPin: row?.gst_api_seller_pin || '',
      einvoiceEnabled: !!tenantRow?.einvoice_enabled,
      einvoiceMode: normalizeEinvoiceMode(tenantRow?.einvoice_mode),
      ewbWithEinvoice: !!tenantRow?.ewb_with_einvoice,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/gst/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const {
      mode,
      gstin,
      username,
      password,
      clientId,
      clientSecret,
      sellerPin,
      einvoiceEnabled,
      einvoiceMode,
      ewbWithEinvoice,
    } = req.body;
    // Save einvoice toggle to tenants table
    if (einvoiceEnabled !== undefined || ewbWithEinvoice !== undefined || einvoiceMode !== undefined) {
      await pool.query(
        `UPDATE tenants SET
           einvoice_enabled = COALESCE($1, einvoice_enabled),
           einvoice_mode = COALESCE($2, einvoice_mode),
           ewb_with_einvoice = COALESCE($3, ewb_with_einvoice)
         WHERE id = $4`,
        [
          einvoiceEnabled !== undefined ? !!einvoiceEnabled : null,
          einvoiceMode !== undefined ? normalizeEinvoiceMode(einvoiceMode) : null,
          ewbWithEinvoice !== undefined ? !!ewbWithEinvoice : null,
          tenantId,
        ],
      );
    }
    const validModes: GstApiMode[] = ['mock', 'sandbox', 'production'];
    if (mode && !validModes.includes(mode))
      return res.status(400).json({ error: 'Invalid mode. Use: mock, sandbox, production' });
    if (gstin !== undefined && gstin !== '' && !isValidGstin(String(gstin))) {
      return res.status(400).json({ error: 'Invalid GSTIN' });
    }
    if (sellerPin !== undefined && sellerPin !== '' && !isValidPin(String(sellerPin))) {
      return res.status(400).json({ error: 'sellerPin must be 6 digits' });
    }

    await pool.query('INSERT INTO bill_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING', [
      tenantId,
    ]);

    const updates: string[] = [];
    const params: unknown[] = [tenantId];
    let idx = 2;
    if (mode !== undefined) {
      updates.push(`gst_api_mode=$${idx++}`);
      params.push(mode);
    }
    if (gstin !== undefined) {
      updates.push(`gst_api_gstin=$${idx++}`);
      params.push(String(gstin).toUpperCase().trim());
    }
    if (username !== undefined) {
      updates.push(`gst_api_username=$${idx++}`);
      params.push(username);
    }
    if (password !== undefined && password !== '') {
      updates.push(`gst_api_password=$${idx++}`);
      params.push(encryptSecret(String(password)));
    }
    if (clientId !== undefined) {
      updates.push(`gst_api_client_id=$${idx++}`);
      params.push(clientId);
    }
    if (clientSecret !== undefined && clientSecret !== '') {
      updates.push(`gst_api_client_secret=$${idx++}`);
      params.push(encryptSecret(String(clientSecret)));
    }
    if (sellerPin !== undefined) {
      updates.push(`gst_api_seller_pin=$${idx++}`);
      params.push(String(sellerPin).trim());
    }

    if (updates.length) {
      await pool.query(`UPDATE bill_settings SET ${updates.join(',')} WHERE tenant_id = $1`, params);
    }
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/gst/irn/generate', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  const db = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoiceApiDisabledResponse(req, res, tenantId)) return;
    const { batchId, sellerPin: sellerPinIn, buyerPin: buyerPinIn } = req.body;
    if (!batchId) return res.status(400).json({ error: 'batchId required' });

    const loaded = await loadGstCredentials(pool, tenantId);
    if (!loaded.ok) return res.status(400).json({ error: (loaded as { ok: false; error: string }).error });
    const creds = (loaded as { ok: true; creds: import('../services/nic-api').GstApiCredentials }).creds;

    await db.query('BEGIN');
    const locked = (
      await db.query(
        `SELECT id, irn, vendor_id, distribution_date, net_price, gst_applied, product_id
       FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2 ORDER BY id FOR UPDATE`,
        [batchId, tenantId],
      )
    ).rows as Record<string, unknown>[];
    if (locked.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Batch not found' });
    }
    const existingIrn = locked.find(r => r.irn);
    if (existingIrn?.irn) {
      await db.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: 'Batch already has an IRN. Cancel it before regenerating.', irn: existingIrn.irn });
    }

    // IRN covers GST-applied distribution units only (non-GST BoS half is out of e-invoice scope)
    const gstUnits = locked.filter(r => r.gst_applied === true || r.gst_applied === 1);
    if (gstUnits.length === 0) {
      await db.query('ROLLBACK');
      return res.status(400).json({
        error: 'No GST-applied units in this batch. Generate IRN only for the Tax Invoice (GST) half.',
      });
    }

    const [tenant, bs, products, companyGst] = await Promise.all([
      db.query('SELECT company_name, phone, address, gst_number FROM tenants WHERE id = $1', [tenantId]),
      db.query('SELECT gst_api_gstin, gst_api_seller_pin FROM bill_settings WHERE tenant_id = $1', [tenantId]),
      db.query(
        `SELECT p.id, p.name as product_name, p.hsn_code, p.gst_rate as product_gst_rate, p.price as product_price
         FROM products p WHERE p.tenant_id = $1 AND p.id = ANY($2::text[])`,
        [tenantId, gstUnits.map(r => r.product_id as string)],
      ),
      db.query(
        "SELECT default_gst_rate FROM users WHERE role IN ('Super Admin', 'Admin') AND tenant_id = $1 ORDER BY id LIMIT 1",
        [tenantId],
      ),
    ]);
    const prodMap = new Map(products.rows.map((p: Record<string, unknown>) => [p.id, p]));
    const companyDefaultGst = Number(companyGst.rows[0]?.default_gst_rate);

    const vendorId = locked[0].vendor_id as string;
    const vendor = (
      await db.query('SELECT name, address, gst_number FROM vendors WHERE id = $1 AND tenant_id = $2', [
        vendorId,
        tenantId,
      ])
    ).rows[0] as Record<string, string> | undefined;
    if (!vendor) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Vendor not found for this batch' });
    }

    const t = tenant.rows[0] as Record<string, string>;
    const sellerGstin = resolveSellerGstin(
      creds.mode,
      bs.rows[0]?.gst_api_gstin as string | undefined,
      t?.gst_number,
      creds.gstin,
    );
    if (!sellerGstin) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Valid seller GSTIN required. Configure Settings → GST API.' });
    }

    const pins = resolvePins(creds.mode, sellerPinIn, buyerPinIn, (bs.rows[0]?.gst_api_seller_pin as string) || '');
    if ('error' in pins) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: pins.error });
    }

    const buyerGstin = vendor.gst_number || '';
    const supplyType = resolveSupplyType(buyerGstin);
    if (creds.mode !== 'mock' && supplyType === 'B2B' && !isValidGstin(buyerGstin)) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Valid buyer GSTIN required for B2B e-invoice.' });
    }

    let totalTaxable = 0,
      totalCgst = 0,
      totalSgst = 0,
      totalIgst = 0;
    const lineItems = gstUnits.map(pd => {
      const p = prodMap.get(pd.product_id as string) as Record<string, unknown> | undefined;
      const taxable = Number(pd.net_price || p?.product_price) || 0;
      const rate = resolveGstRate(p?.product_gst_rate != null ? Number(p.product_gst_rate) : null, companyDefaultGst);
      const taxAmt = Math.round(((taxable * rate) / 100) * 100) / 100;
      const { cgst, sgst, igst } = splitGst(taxAmt, sellerGstin, buyerGstin);
      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      return {
        hsnCode: String(p?.hsn_code || '9999'),
        productName: String(p?.product_name || 'Item'),
        qty: 1,
        unitPrice: taxable,
        gstRate: rate,
        taxable,
        cgst,
        sgst,
        igst,
        total: taxable + cgst + sgst + igst,
      };
    });

    const grandTotal = totalTaxable + totalCgst + totalSgst + totalIgst;
    const distDate = String(locked[0].distribution_date).slice(0, 10);
    // Dual-doc: IRN invoice number matches GST Tax Invoice half
    const invoiceNo = `CH/${batchId.replace('D', '')}-GST`;

    const payload = buildIrnPayload({
      sellerGstin,
      sellerName: t.company_name,
      sellerAddr: t.address || '',
      sellerPin: pins.sellerPin,
      buyerGstin,
      buyerName: vendor.name,
      buyerAddr: vendor.address || '',
      buyerPin: pins.buyerPin,
      invoiceNo,
      invoiceDate: fmtDate(distDate),
      supplyType,
      items: lineItems,
      totalTaxable,
      totalCgst,
      totalSgst,
      totalIgst,
      grandTotal,
    });

    const client = new NicApiClient(creds);
    const result = await client.generateIrn(payload);

    // Stamp IRN only on GST-applied units — non-GST BoS print must not present as e-invoice
    await db.query(
      `UPDATE product_distribution SET irn=$1, irn_ack_no=$2, irn_ack_dt=$3, irn_qr=$4,
         ewb_number = COALESCE($7, ewb_number)
       WHERE batch_id=$5 AND tenant_id=$6 AND COALESCE(gst_applied, false) = true`,
      [
        result.irn,
        result.ackNo,
        result.ackDt,
        result.signedQrCode || result.qrCode,
        batchId,
        tenantId,
        result.ewbNo || null,
      ],
    );
    await db.query('COMMIT');
    res.json({ ok: true, ...result, mode: creds.mode });
  } catch (err) {
    await db.query('ROLLBACK').catch(rbErr => {
      logger.warn('IRN generate rollback failed', { error: rbErr instanceof Error ? rbErr.message : String(rbErr) });
    });
    return handleApiError(req, res, err, 'IRN generate failed', { publicMessage: safeError(err) });
  } finally {
    db.release();
  }
});

router.post('/api/gst/ewb/generate', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  const db = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoiceApiDisabledResponse(req, res, tenantId)) return;
    const {
      batchId,
      vehicleNo,
      distance,
      transportMode,
      transporterName,
      transporterId,
      sellerPin: sellerPinIn,
      buyerPin: buyerPinIn,
    } = req.body;
    if (!batchId) return res.status(400).json({ error: 'batchId required' });
    if (!vehicleNo) return res.status(400).json({ error: 'vehicleNo required' });
    if (distance === undefined || distance === null || distance === '') {
      return res.status(400).json({ error: 'distance (km) required' });
    }
    if (!Number.isFinite(Number(distance)) || Number(distance) < 0) {
      return res.status(400).json({ error: 'distance (km) required' });
    }

    const loaded = await loadGstCredentials(pool, tenantId);
    if (!loaded.ok) return res.status(400).json({ error: (loaded as { ok: false; error: string }).error });
    const creds = (loaded as { ok: true; creds: import('../services/nic-api').GstApiCredentials }).creds;

    await db.query('BEGIN');
    const locked = (
      await db.query(
        `SELECT id, ewb_number, vendor_id, distribution_date, net_price, gst_applied, product_id
       FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2 ORDER BY id FOR UPDATE`,
        [batchId, tenantId],
      )
    ).rows as Record<string, unknown>[];
    if (locked.length === 0) {
      await db.query('ROLLBACK');
      return res.status(404).json({ error: 'Batch not found' });
    }
    const existingEwb = locked.find(r => r.ewb_number);
    if (existingEwb?.ewb_number) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Batch already has an E-way bill.', ewbNo: existingEwb.ewb_number });
    }

    const [tenant, bs, products] = await Promise.all([
      db.query('SELECT company_name, phone, address, gst_number FROM tenants WHERE id = $1', [tenantId]),
      db.query('SELECT gst_api_gstin, gst_api_seller_pin FROM bill_settings WHERE tenant_id = $1', [tenantId]),
      db.query(
        `SELECT p.id, p.name as product_name, p.hsn_code, p.gst_rate as product_gst_rate, p.price as product_price
         FROM products p WHERE p.tenant_id = $1 AND p.id = ANY($2::text[])`,
        [tenantId, locked.map(r => r.product_id as string)],
      ),
    ]);
    const prodMap = new Map(products.rows.map((p: Record<string, unknown>) => [p.id, p]));

    const vendorId = locked[0].vendor_id as string;
    const vendor = (
      await db.query('SELECT name, address, gst_number FROM vendors WHERE id = $1 AND tenant_id = $2', [
        vendorId,
        tenantId,
      ])
    ).rows[0] as Record<string, string> | undefined;
    if (!vendor) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Vendor not found for this batch' });
    }

    const t = tenant.rows[0] as Record<string, string>;
    const sellerGstin = resolveSellerGstin(
      creds.mode,
      bs.rows[0]?.gst_api_gstin as string | undefined,
      t?.gst_number,
      creds.gstin,
    );
    if (!sellerGstin) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: 'Valid seller GSTIN required. Configure Settings → GST API.' });
    }

    const pins = resolvePins(creds.mode, sellerPinIn, buyerPinIn, (bs.rows[0]?.gst_api_seller_pin as string) || '');
    if ('error' in pins) {
      await db.query('ROLLBACK');
      return res.status(400).json({ error: pins.error });
    }

    const buyerGstin = vendor.gst_number && isValidGstin(vendor.gst_number) ? vendor.gst_number : 'URP';
    const distDate = String(locked[0].distribution_date).slice(0, 10);
    const invoiceNo = `CH/${batchId.replace('D', '')}`;

    let totalTaxable = 0,
      totalCgst = 0,
      totalSgst = 0,
      totalIgst = 0;
    const lineItems = locked.map(pd => {
      const p = prodMap.get(pd.product_id as string) as Record<string, unknown> | undefined;
      const taxable = Number(pd.net_price || p?.product_price) || 0;
      const rate = Number(p?.product_gst_rate) || 18;
      const taxAmt = pd.gst_applied ? Math.round(((taxable * rate) / 100) * 100) / 100 : 0;
      const { cgst, sgst, igst } = splitGst(taxAmt, sellerGstin, buyerGstin);
      totalTaxable += taxable;
      totalCgst += cgst;
      totalSgst += sgst;
      totalIgst += igst;
      return {
        productName: String(p?.product_name || 'Item'),
        hsnCode: String(p?.hsn_code || '9999'),
        qty: 1,
        taxable,
        cgst,
        sgst,
        igst,
        total: taxable + cgst + sgst + igst,
      };
    });

    const payload = buildEwbPayload({
      supplyType: 'O',
      subSupplyType: '1',
      docType: 'INV',
      docNo: invoiceNo,
      docDate: fmtDate(distDate),
      sellerGstin,
      sellerName: t.company_name,
      sellerAddr: t.address || '',
      sellerPin: pins.sellerPin,
      buyerGstin,
      buyerName: vendor.name,
      buyerAddr: vendor.address || '',
      buyerPin: pins.buyerPin,
      items: lineItems,
      totalTaxable,
      totalCgst,
      totalSgst,
      totalIgst,
      grandTotal: totalTaxable + totalCgst + totalSgst + totalIgst,
      vehicleNo: String(vehicleNo).toUpperCase(),
      distance: Number(distance),
      transportMode: transportMode ? String(transportMode) : '1',
      transporterName: transporterName ? String(transporterName) : undefined,
      transporterId: transporterId ? String(transporterId) : undefined,
    });

    const client = new NicApiClient(creds);
    const result = await client.generateEwb(payload);

    await db.query('UPDATE product_distribution SET ewb_number=$1 WHERE batch_id=$2 AND tenant_id=$3', [
      result.ewbNo,
      batchId,
      tenantId,
    ]);
    await db.query('COMMIT');
    res.json({ ok: true, ...result, mode: creds.mode });
  } catch (err) {
    await db.query('ROLLBACK').catch(rbErr => {
      logger.warn('EWB generate rollback failed', { error: rbErr instanceof Error ? rbErr.message : String(rbErr) });
    });
    return handleApiError(req, res, err, 'EWB generate failed', { publicMessage: safeError(err) });
  } finally {
    db.release();
  }
});

/** Standalone invoice (ops desk / Miracle import) e-invoice — parallel to batch IRN. */
router.post('/api/gst/irn/generate-invoice', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoiceApiDisabledResponse(req, res, tenantId)) return;
    const { invoiceId, sellerPin, buyerPin } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    const result = await generateStandaloneInvoiceIrn(pool, tenantId, String(invoiceId), { sellerPin, buyerPin });
    res.json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Invoice IRN generate failed', {
      status,
      publicMessage: safeError(err),
    });
  }
});

router.post('/api/gst/ewb/generate-invoice', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoiceApiDisabledResponse(req, res, tenantId)) return;
    const { invoiceId, vehicleNo, distance, transportMode, transporterName, transporterId, sellerPin, buyerPin } =
      req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    const result = await generateStandaloneInvoiceEwb(pool, tenantId, {
      invoiceId: String(invoiceId),
      vehicleNo: String(vehicleNo || ''),
      distance: Number(distance),
      transportMode,
      transporterName,
      transporterId,
      sellerPin,
      buyerPin,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Invoice EWB generate failed', {
      status,
      publicMessage: safeError(err),
    });
  }
});

router.get('/api/gst/eligibility', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const gstinQ = String(req.query.gstin || '').trim();
    const loaded = await loadGstCredentials(pool, tenantId);
    const mode = loaded.ok ? loaded.creds.mode : 'mock';
    const tenant = (await pool.query('SELECT company_name, gst_number FROM tenants WHERE id = $1', [tenantId]))
      .rows[0] as { company_name?: string; gst_number?: string } | undefined;
    const bs = (await pool.query('SELECT gst_api_gstin FROM bill_settings WHERE tenant_id = $1', [tenantId]))
      .rows[0] as { gst_api_gstin?: string } | undefined;
    const gstin = gstinQ || bs?.gst_api_gstin || tenant?.gst_number || '';
    const result = await checkEinvoiceEligibility(gstin, tenant?.company_name || '', mode);
    res.json(result);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/gst/distance', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const loaded = await loadGstCredentials(pool, tenantId);
    const mode = loaded.ok ? loaded.creds.mode : 'mock';
    const result = lookupTransportDistance({
      fromPin: String(req.query.fromPin || ''),
      toPin: String(req.query.toPin || ''),
      fromAddress: String(req.query.fromAddress || ''),
      toAddress: String(req.query.toAddress || ''),
      mode,
    });
    if (result.source === 'invalid_pin') {
      return res.status(400).json({ error: 'Valid 6-digit fromPin and toPin required' });
    }
    res.json(result);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/gst/ewb/generate-invoice-by-irn', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoiceApiDisabledResponse(req, res, tenantId)) return;
    const { invoiceId, vehicleNo, distance, transportMode, transporterName, transporterId } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    const result = await generateStandaloneInvoiceEwbByIrn(pool, tenantId, {
      invoiceId: String(invoiceId),
      vehicleNo: String(vehicleNo || ''),
      distance: Number(distance),
      transportMode,
      transporterName,
      transporterId,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Invoice EWB by IRN failed', { status, publicMessage: safeError(err) });
  }
});

router.post('/api/gst/irn-and-ewb/generate-invoice', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoiceApiDisabledResponse(req, res, tenantId)) return;
    const { invoiceId, vehicleNo, distance, transportMode, transporterName, transporterId, sellerPin, buyerPin } =
      req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    const result = await generateStandaloneInvoiceIrnAndEwb(pool, tenantId, {
      invoiceId: String(invoiceId),
      vehicleNo: String(vehicleNo || ''),
      distance: Number(distance),
      transportMode,
      transporterName,
      transporterId,
      sellerPin,
      buyerPin,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Invoice IRN+EWB failed', { status, publicMessage: safeError(err) });
  }
});

// ── Portal workflow (manual mode): download NIC JSON, import IRN/EWB from government portal ──

router.get('/api/gst/einvoice-json/invoice', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoicePortalDisabledResponse(req, res, tenantId)) return;
    const invoiceId = String(req.query.invoiceId || '');
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    const transporterName = String(req.query.transporterName || '').trim();
    const transport = transporterName
      ? {
          vehicleNo: String(req.query.vehicleNo || ''),
          distance: Number(req.query.distance) || 0,
          transportMode: String(req.query.transportMode || '1'),
          transporterName,
          transporterId: String(req.query.transporterId || ''),
          transDocNo: String(req.query.transDocNo || ''),
          transDocDate: String(req.query.transDocDate || ''),
          vehicleType: String(req.query.vehicleType || 'R'),
        }
      : undefined;
    if (transport) {
      const transportMode = transport.transportMode || '1';
      if (!transport.transDocNo?.trim())
        return res.status(400).json({ error: 'transDocNo required for combined E-Way' });
      if (!transport.transDocDate?.trim())
        return res.status(400).json({ error: 'transDocDate required for combined E-Way' });
      if (transportMode === '1' && !transport.vehicleNo?.trim()) {
        return res.status(400).json({ error: 'vehicleNo required for road transport' });
      }
    }
    const json = await buildStandaloneEinvoiceNicJson(pool, tenantId, invoiceId, transport);
    res.json(json);
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'E-Invoice JSON failed', { status, publicMessage: safeError(err) });
  }
});

router.get('/api/gst/ewaybill-json/invoice', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoicePortalDisabledResponse(req, res, tenantId)) return;
    const invoiceId = String(req.query.invoiceId || '');
    const vehicleNo = String(req.query.vehicleNo || '');
    const distance = Number(req.query.distance);
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    if (!String(req.query.transporterName || '').trim())
      return res.status(400).json({ error: 'transporterName required' });
    if (!String(req.query.transDocNo || '').trim()) return res.status(400).json({ error: 'transDocNo required' });
    if (!String(req.query.transDocDate || '').trim()) return res.status(400).json({ error: 'transDocDate required' });
    const transportMode = String(req.query.transportMode || '1');
    if (transportMode === '1' && !vehicleNo)
      return res.status(400).json({ error: 'vehicleNo required for road transport' });
    const json = await buildStandaloneEwaybillNicJson(pool, tenantId, invoiceId, {
      vehicleNo,
      distance: Number.isFinite(distance) ? distance : 0,
      transportMode,
      transporterName: String(req.query.transporterName || ''),
      transporterId: String(req.query.transporterId || ''),
      transDocNo: String(req.query.transDocNo || ''),
      transDocDate: String(req.query.transDocDate || ''),
      subSupplyType: String(req.query.subSupplyType || 'Supply'),
      docType: String(req.query.docType || 'INV'),
      vehicleType: String(req.query.vehicleType || 'R'),
      dispatchMasterRequired: req.query.dispatchMasterRequired === 'true',
      dispatchFromState: String(req.query.dispatchFromState || ''),
    });
    res.json(json);
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'E-Way Bill JSON failed', { status, publicMessage: safeError(err) });
  }
});

router.post('/api/gst/irn/import-invoice', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoicePortalDisabledResponse(req, res, tenantId)) return;
    const { invoiceId, irn, ackNo, ackDt, irnQr } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    const result = await importStandaloneInvoiceIrn(pool, tenantId, { invoiceId, irn, ackNo, ackDt, irnQr });
    res.json(result);
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Import IRN failed', { status, publicMessage: safeError(err) });
  }
});

router.post('/api/gst/ewb/import-invoice', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoicePortalDisabledResponse(req, res, tenantId)) return;
    const { invoiceId, ewbNumber } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    const result = await importStandaloneInvoiceEwb(pool, tenantId, { invoiceId, ewbNumber });
    res.json(result);
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Import EWB failed', { status, publicMessage: safeError(err) });
  }
});

router.post('/api/gst/irn/import-batch', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoicePortalDisabledResponse(req, res, tenantId)) return;
    const { batchId, irn, ackNo, ackDt, irnQr } = req.body || {};
    if (!batchId) return res.status(400).json({ error: 'batchId required' });
    const result = await importBatchIrn(pool, tenantId, { batchId, irn, ackNo, ackDt, irnQr });
    res.json(result);
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Import batch IRN failed', { status, publicMessage: safeError(err) });
  }
});

router.post('/api/gst/ewb/import-batch', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoicePortalDisabledResponse(req, res, tenantId)) return;
    const { batchId, ewbNumber } = req.body || {};
    if (!batchId) return res.status(400).json({ error: 'batchId required' });
    const result = await importBatchEwb(pool, tenantId, { batchId, ewbNumber });
    res.json(result);
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Import batch EWB failed', { status, publicMessage: safeError(err) });
  }
});

router.post('/api/gst/portal-response/import-invoice', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoicePortalDisabledResponse(req, res, tenantId)) return;
    const { invoiceId, response } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    if (!response) return res.status(400).json({ error: 'response JSON required' });
    const result = await importStandaloneInvoicePortalResponse(pool, tenantId, { invoiceId, response });
    res.json(result);
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Import portal response failed', { status, publicMessage: safeError(err) });
  }
});

router.post('/api/gst/portal-response/import-batch', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoicePortalDisabledResponse(req, res, tenantId)) return;
    const { batchId, response } = req.body || {};
    if (!batchId) return res.status(400).json({ error: 'batchId required' });
    if (!response) return res.status(400).json({ error: 'response JSON required' });
    const result = await importBatchPortalResponse(pool, tenantId, { batchId, response });
    res.json(result);
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Import portal response failed', { status, publicMessage: safeError(err) });
  }
});

router.post('/api/gst/irn/cancel', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoiceApiDisabledResponse(req, res, tenantId)) return;
    const { irn, reason, remark } = req.body;
    if (!irn) return res.status(400).json({ error: 'irn required' });
    if (!reason)
      return res
        .status(400)
        .json({ error: 'reason required (1=Duplicate, 2=Data mistake, 3=Order cancelled, 4=Other)' });

    const loaded = await loadGstCredentials(pool, tenantId);
    if (!loaded.ok) return res.status(400).json({ error: (loaded as { ok: false; error: string }).error });

    const client = new NicApiClient(loaded.creds);
    await client.cancelIrn(irn, Number(reason) as 1 | 2 | 3 | 4, remark || 'Cancelled');

    await pool.query(
      'UPDATE product_distribution SET irn=NULL, irn_ack_no=NULL, irn_ack_dt=NULL, irn_qr=NULL, ewb_number=NULL WHERE irn=$1 AND tenant_id=$2',
      [irn, tenantId],
    );
    await pool.query(
      'UPDATE standalone_invoices SET irn=NULL, irn_ack_no=NULL, irn_ack_dt=NULL, irn_qr=NULL, ewb_number=NULL WHERE irn=$1 AND tenant_id=$2',
      [irn, tenantId],
    );

    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err, 'IRN cancel failed', { publicMessage: safeError(err) });
  }
});

router.post('/api/gst/ewb/cancel', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoiceApiDisabledResponse(req, res, tenantId)) return;
    const { ewbNumber, reason, remark, invoiceId, batchId } = req.body || {};
    if (!ewbNumber) return res.status(400).json({ error: 'ewbNumber required' });
    if (!reason)
      return res
        .status(400)
        .json({ error: 'reason required (1=Duplicate, 2=Order cancelled, 3=Data mistake, 4=Other)' });

    const loaded = await loadGstCredentials(pool, tenantId);
    if (!loaded.ok) return res.status(400).json({ error: (loaded as { ok: false; error: string }).error });

    const client = new NicApiClient(loaded.creds);
    await client.cancelEwb(String(ewbNumber), Number(reason) as 1 | 2 | 3 | 4, remark || 'Cancelled');

    if (invoiceId) {
      await pool.query(
        `UPDATE standalone_invoices SET ewb_number = NULL WHERE id = $1 AND tenant_id = $2 AND ewb_number = $3`,
        [invoiceId, tenantId, String(ewbNumber)],
      );
    } else if (batchId) {
      await pool.query(
        `UPDATE product_distribution SET ewb_number = NULL WHERE batch_id = $1 AND tenant_id = $2 AND ewb_number = $3`,
        [batchId, tenantId, String(ewbNumber)],
      );
    } else {
      await pool.query(`UPDATE standalone_invoices SET ewb_number = NULL WHERE tenant_id = $1 AND ewb_number = $2`, [
        tenantId,
        String(ewbNumber),
      ]);
      await pool.query(`UPDATE product_distribution SET ewb_number = NULL WHERE tenant_id = $1 AND ewb_number = $2`, [
        tenantId,
        String(ewbNumber),
      ]);
    }

    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err, 'EWB cancel failed', { publicMessage: safeError(err) });
  }
});

router.post('/api/gst/filing/clear-invoice', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoicePortalDisabledResponse(req, res, tenantId)) return;
    const { invoiceId, scope } = req.body || {};
    if (!invoiceId) return res.status(400).json({ error: 'invoiceId required' });
    const s = scope === 'ewb' || scope === 'irn' ? scope : 'all';
    const result = await clearStandaloneInvoiceGstFiling(pool, tenantId, invoiceId, s);
    res.json(result);
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Clear filing failed', { status, publicMessage: safeError(err) });
  }
});

router.post('/api/gst/filing/clear-batch', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    if (await einvoicePortalDisabledResponse(req, res, tenantId)) return;
    const { batchId, scope } = req.body || {};
    if (!batchId) return res.status(400).json({ error: 'batchId required' });
    const s = scope === 'ewb' || scope === 'irn' ? scope : 'all';
    const result = await clearBatchGstFiling(pool, tenantId, batchId, s);
    res.json(result);
  } catch (err) {
    const status = err instanceof StandaloneInvoiceGstError ? err.status : 500;
    return handleApiError(req, res, err, 'Clear filing failed', { status, publicMessage: safeError(err) });
  }
});

export default router;
