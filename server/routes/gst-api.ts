/**
 * GST API routes — E-invoice (IRN) + E-way Bill
 *
 * POST /api/gst/irn/generate      — generate IRN for a distribution batch
 * POST /api/gst/ewb/generate      — generate E-way bill for a distribution batch
 * POST /api/gst/irn/cancel        — cancel an IRN
 * GET  /api/gst/settings          — get tenant GST API settings (masked)
 * PUT  /api/gst/settings          — save tenant GST API credentials
 */

import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { splitGst } from '../utils/helpers';
import { NicApiClient, buildIrnPayload, buildEwbPayload, loadGstCredentials, type GstApiMode } from '../services/nic-api';

const router = Router();

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

// ── GST API Settings (store + retrieve per tenant) ────────────────────────────
router.get('/api/gst/settings', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const row = (await pool.query(
      'SELECT gst_api_mode, gst_api_gstin, gst_api_username, gst_api_client_id FROM bill_settings WHERE tenant_id = $1',
      [tenantId]
    )).rows[0] as Record<string, string> | undefined;
    res.json({
      mode: row?.gst_api_mode || 'mock',
      gstin: row?.gst_api_gstin || '',
      username: row?.gst_api_username || '',
      clientId: row?.gst_api_client_id || '',
      // Password and client_secret are write-only — never returned
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
    const { mode, gstin, username, password, clientId, clientSecret } = req.body;
    const validModes: GstApiMode[] = ['mock', 'sandbox', 'production'];
    if (mode && !validModes.includes(mode)) return res.status(400).json({ error: 'Invalid mode. Use: mock, sandbox, production' });

    // Ensure bill_settings row exists
    await pool.query('INSERT INTO bill_settings (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING', [tenantId]);

    const updates: string[] = [];
    const params: unknown[] = [tenantId];
    let idx = 2;
    if (mode        !== undefined) { updates.push(`gst_api_mode=$${idx++}`);          params.push(mode); }
    if (gstin       !== undefined) { updates.push(`gst_api_gstin=$${idx++}`);         params.push(gstin.toUpperCase().trim()); }
    if (username    !== undefined) { updates.push(`gst_api_username=$${idx++}`);      params.push(username); }
    if (password    !== undefined) { updates.push(`gst_api_password=$${idx++}`);      params.push(password); }
    if (clientId    !== undefined) { updates.push(`gst_api_client_id=$${idx++}`);     params.push(clientId); }
    if (clientSecret !== undefined){ updates.push(`gst_api_client_secret=$${idx++}`); params.push(clientSecret); }

    if (updates.length) {
      await pool.query(`UPDATE bill_settings SET ${updates.join(',')} WHERE tenant_id = $1`, params);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Generate IRN for a distribution batch ─────────────────────────────────────
router.post('/api/gst/irn/generate', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { batchId } = req.body;
    if (!batchId) return res.status(400).json({ error: 'batchId required' });

    // Load credentials (falls back to mock if not configured)
    const creds = await loadGstCredentials(pool, tenantId) || {
      mode: 'mock' as GstApiMode, gstin: '', username: '', password: '', clientId: '', clientSecret: '',
    };

    // Fetch distribution items + vendor + tenant
    const [items, tenant, bs] = await Promise.all([
      pool.query(`
        SELECT pd.*, p.name as product_name, p.hsn_code, p.gst_rate as product_gst_rate, p.price as product_price
        FROM product_distribution pd
        JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
        WHERE pd.batch_id = $2 AND pd.tenant_id = $1
      `, [tenantId, batchId]),
      pool.query('SELECT company_name, phone, address, gst_number FROM tenants WHERE id = $1', [tenantId]),
      pool.query('SELECT gst_api_gstin FROM bill_settings WHERE tenant_id = $1', [tenantId]),
    ]);

    if (items.rows.length === 0) return res.status(404).json({ error: 'Batch not found' });

    const vendorId  = items.rows[0].vendor_id as string;
    const vendor    = (await pool.query('SELECT name, address, gst_number FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as Record<string, string>;
    const t         = tenant.rows[0] as Record<string, string>;
    const sellerGstin = bs.rows[0]?.gst_api_gstin || (t as Record<string, string>)?.gst_number || creds.gstin || '24AAAPZ9999G1ZI';
    const buyerGstin  = vendor?.gst_number || '';

    // Build line items with GST split
    let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const lineItems = (items.rows as Record<string, unknown>[]).map(pd => {
      const taxable = Number(pd.net_price || pd.product_price) || 0;
      const rate    = Number(pd.product_gst_rate) || 18;
      const taxAmt  = pd.gst_applied ? Math.round(taxable * rate / 100 * 100) / 100 : 0;
      const { cgst, sgst, igst } = splitGst(taxAmt, sellerGstin, buyerGstin);
      totalTaxable += taxable; totalCgst += cgst; totalSgst += sgst; totalIgst += igst;
      return {
        hsnCode: String(pd.hsn_code || '9999'), productName: String(pd.product_name),
        qty: 1, unitPrice: taxable, gstRate: rate,
        taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst,
      };
    });

    const grandTotal = totalTaxable + totalCgst + totalSgst + totalIgst;
    const distDate   = String(items.rows[0].distribution_date).slice(0, 10);

    // Use existing invoice number or generate one from batchId
    const invoiceNo = `CH/${batchId.replace('D', '')}`;

    const payload = buildIrnPayload({
      sellerGstin, sellerName: t.company_name, sellerAddr: t.address || '',
      buyerGstin, buyerName: vendor.name, buyerAddr: vendor.address || '',
      invoiceNo, invoiceDate: fmtDate(distDate),
      items: lineItems,
      totalTaxable, totalCgst, totalSgst, totalIgst, grandTotal,
    });

    const client = new NicApiClient(creds);
    const result = await client.generateIrn(payload);

    // Store IRN on the batch
    await pool.query(
      'UPDATE product_distribution SET irn=$1, irn_ack_no=$2, irn_ack_dt=$3, irn_qr=$4 WHERE batch_id=$5 AND tenant_id=$6',
      [result.irn, result.ackNo, result.ackDt, result.signedQrCode || result.qrCode, batchId, tenantId]
    );

    res.json({ ok: true, ...result, mode: creds.mode });
  } catch (err) {
    console.error(`💥 IRN generate failed:`, (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Generate E-way bill for a distribution batch ───────────────────────────────
router.post('/api/gst/ewb/generate', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { batchId, vehicleNo, distance, transportMode, transporterName, transporterId } = req.body;
    if (!batchId)   return res.status(400).json({ error: 'batchId required' });
    if (!vehicleNo) return res.status(400).json({ error: 'vehicleNo required' });
    if (!distance)  return res.status(400).json({ error: 'distance (km) required' });

    const creds = await loadGstCredentials(pool, tenantId) || {
      mode: 'mock' as GstApiMode, gstin: '', username: '', password: '', clientId: '', clientSecret: '',
    };

    const [items, tenant, bs] = await Promise.all([
      pool.query(`
        SELECT pd.*, p.name as product_name, p.hsn_code, p.gst_rate as product_gst_rate, p.price as product_price
        FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
        WHERE pd.batch_id = $2 AND pd.tenant_id = $1
      `, [tenantId, batchId]),
      pool.query('SELECT company_name, phone, address, gst_number FROM tenants WHERE id = $1', [tenantId]),
      pool.query('SELECT gst_api_gstin FROM bill_settings WHERE tenant_id = $1', [tenantId]),
    ]);

    if (items.rows.length === 0) return res.status(404).json({ error: 'Batch not found' });

    const vendorId   = items.rows[0].vendor_id as string;
    const vendor     = (await pool.query('SELECT name, address, gst_number FROM vendors WHERE id = $1 AND tenant_id = $2', [vendorId, tenantId])).rows[0] as Record<string, string>;
    const t          = tenant.rows[0] as Record<string, string>;
    const sellerGstin = bs.rows[0]?.gst_api_gstin || (t as Record<string, string>)?.gst_number || creds.gstin || '24AAAPZ9999G1ZI';
    const buyerGstin  = vendor?.gst_number || 'URP';
    const distDate    = String(items.rows[0].distribution_date).slice(0, 10);
    const invoiceNo   = `CH/${batchId.replace('D', '')}`;

    let totalTaxable = 0, totalCgst = 0, totalSgst = 0, totalIgst = 0;
    const lineItems = (items.rows as Record<string, unknown>[]).map(pd => {
      const taxable = Number(pd.net_price || pd.product_price) || 0;
      const rate    = Number(pd.product_gst_rate) || 18;
      const taxAmt  = pd.gst_applied ? Math.round(taxable * rate / 100 * 100) / 100 : 0;
      const { cgst, sgst, igst } = splitGst(taxAmt, sellerGstin, buyerGstin);
      totalTaxable += taxable; totalCgst += cgst; totalSgst += sgst; totalIgst += igst;
      return { productName: String(pd.product_name), hsnCode: String(pd.hsn_code || '9999'), qty: 1, taxable, cgst, sgst, igst, total: taxable + cgst + sgst + igst };
    });

    const payload = buildEwbPayload({
      supplyType: 'O', subSupplyType: '1', docType: 'INV', docNo: invoiceNo, docDate: fmtDate(distDate),
      sellerGstin, sellerName: t.company_name, sellerAddr: t.address || '', sellerPin: '380001',
      buyerGstin,  buyerName: vendor.name,     buyerAddr: vendor.address || '',  buyerPin: '380001',
      items: lineItems,
      totalTaxable, totalCgst, totalSgst, totalIgst, grandTotal: totalTaxable + totalCgst + totalSgst + totalIgst,
      vehicleNo: String(vehicleNo).toUpperCase(), distance: Number(distance),
      transportMode: transportMode ? String(transportMode) : '1',
      transporterName: transporterName ? String(transporterName) : undefined,
      transporterId: transporterId ? String(transporterId) : undefined,
    });

    const client = new NicApiClient(creds);
    const result = await client.generateEwb(payload);

    // Store EWB number on the batch
    await pool.query(
      'UPDATE product_distribution SET ewb_number=$1 WHERE batch_id=$2 AND tenant_id=$3',
      [result.ewbNo, batchId, tenantId]
    );

    res.json({ ok: true, ...result, mode: creds.mode });
  } catch (err) {
    console.error(`💥 EWB generate failed:`, (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ── Cancel IRN ────────────────────────────────────────────────────────────────
router.post('/api/gst/irn/cancel', requireAdmin, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { irn, reason, remark } = req.body;
    if (!irn)    return res.status(400).json({ error: 'irn required' });
    if (!reason) return res.status(400).json({ error: 'reason required (1=Duplicate, 2=OrderCancelled, 3=DataError, 4=Other)' });

    const creds = await loadGstCredentials(pool, tenantId);
    if (!creds) return res.status(400).json({ error: 'GST API not configured. Go to Settings → GST API.' });

    const client = new NicApiClient(creds);
    await client.cancelIrn(irn, Number(reason) as 1 | 2 | 3 | 4, remark || 'Cancelled');

    // Clear IRN from distribution
    await pool.query('UPDATE product_distribution SET irn=NULL, irn_ack_no=NULL, irn_ack_dt=NULL, irn_qr=NULL WHERE irn=$1 AND tenant_id=$2', [irn, tenantId]);

    res.json({ ok: true });
  } catch (err) {
    console.error(`💥 IRN cancel failed:`, (err as Error).message);
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
