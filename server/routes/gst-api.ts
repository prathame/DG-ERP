/**
 * GST API routes — E-invoice (IRN) + E-way Bill
 */

import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { splitGst, isValidGstin } from '../utils/helpers';
import { encryptSecret } from '../utils/secret-crypto';
import {
  NicApiClient,
  buildIrnPayload,
  buildEwbPayload,
  loadGstCredentials,
  isValidPin,
  resolveSupplyType,
  type GstApiMode,
} from '../services/nic-api';

const router = Router();

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

/** Client-safe GST errors — never leak stack/SQL/paths. Internal details stay in logs. */
function safeError(err: unknown): string {
  const msg = err instanceof Error ? err.message : 'Internal server error';
  // Allow only short, expected validation/config messages (no DB/stack/path leakage)
  if (
    /^(GST API|IRN|EWB|E-way bill|not configured|already has|Batch not|required|Invalid|credentials|crypto|pincode|GSTIN|B2B)/i.test(
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
    res.json({
      mode: row?.gst_api_mode || 'mock',
      gstin: row?.gst_api_gstin || '',
      username: row?.gst_api_username || '',
      clientId: row?.gst_api_client_id || '',
      sellerPin: row?.gst_api_seller_pin || '',
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/gst/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { mode, gstin, username, password, clientId, clientSecret, sellerPin } = req.body;
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
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/gst/irn/generate', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  const db = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
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
    const invoiceNo = `CH/${batchId.replace('D', '')}`;

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

    await db.query(
      'UPDATE product_distribution SET irn=$1, irn_ack_no=$2, irn_ack_dt=$3, irn_qr=$4 WHERE batch_id=$5 AND tenant_id=$6',
      [result.irn, result.ackNo, result.ackDt, result.signedQrCode || result.qrCode, batchId, tenantId],
    );
    await db.query('COMMIT');
    res.json({ ok: true, ...result, mode: creds.mode });
  } catch (err) {
    await db.query('ROLLBACK').catch(() => {});
    console.error(`💥 IRN generate failed:`, (err as Error).message);
    res.status(500).json({ error: safeError(err) });
  } finally {
    db.release();
  }
});

router.post('/api/gst/ewb/generate', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  const db = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
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
    if (!distance) return res.status(400).json({ error: 'distance (km) required' });

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
    await db.query('ROLLBACK').catch(() => {});
    console.error(`💥 EWB generate failed:`, (err as Error).message);
    res.status(500).json({ error: safeError(err) });
  } finally {
    db.release();
  }
});

router.post('/api/gst/irn/cancel', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { irn, reason, remark } = req.body;
    if (!irn) return res.status(400).json({ error: 'irn required' });
    if (!reason)
      return res.status(400).json({ error: 'reason required (1=Duplicate, 2=OrderCancelled, 3=DataError, 4=Other)' });

    const loaded = await loadGstCredentials(pool, tenantId);
    if (!loaded.ok) return res.status(400).json({ error: (loaded as { ok: false; error: string }).error });

    const client = new NicApiClient(loaded.creds);
    await client.cancelIrn(irn, Number(reason) as 1 | 2 | 3 | 4, remark || 'Cancelled');

    await pool.query(
      'UPDATE product_distribution SET irn=NULL, irn_ack_no=NULL, irn_ack_dt=NULL, irn_qr=NULL WHERE irn=$1 AND tenant_id=$2',
      [irn, tenantId],
    );

    res.json({ ok: true });
  } catch (err) {
    console.error(`💥 IRN cancel failed:`, (err as Error).message);
    res.status(500).json({ error: safeError(err) });
  }
});

export default router;
