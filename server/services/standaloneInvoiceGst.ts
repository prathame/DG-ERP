/**
 * E-invoice (IRN) + E-way bill for standalone_invoices (Miracle-imported / ops sales).
 * Mirrors distribution GST flow but reads invoice header + JSON line items.
 */
import type { Pool, PoolClient } from 'pg';
import { splitGst, isValidGstin } from '../utils/helpers';
import {
  NicApiClient,
  buildIrnPayload,
  buildEwbPayload,
  loadGstCredentials,
  isValidPin,
  resolveSupplyType,
  type GstApiCredentials,
  type GstApiMode,
  type IrnResult,
  type EwbResult,
} from './nic-api';

export class StandaloneInvoiceGstError extends Error {
  readonly status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = 'StandaloneInvoiceGstError';
    this.status = status;
  }
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, day] = iso.slice(0, 10).split('-').map(Number);
    return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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
): { sellerPin: string; buyerPin: string } {
  const sellerPin = String(sellerPinIn || settingsPin || '').trim();
  const buyerPin = String(buyerPinIn || sellerPin || '').trim();
  if (mode === 'mock') {
    return {
      sellerPin: isValidPin(sellerPin) ? sellerPin : '380001',
      buyerPin: isValidPin(buyerPin) ? buyerPin : '380001',
    };
  }
  if (!isValidPin(sellerPin)) {
    throw new StandaloneInvoiceGstError(
      'Valid 6-digit seller pincode required (body.sellerPin or Settings → GST API).',
    );
  }
  if (!isValidPin(buyerPin)) {
    throw new StandaloneInvoiceGstError('Valid 6-digit buyer pincode required (body.buyerPin).');
  }
  return { sellerPin, buyerPin };
}

type InvRow = {
  id: string;
  invoice_number: string;
  customer_name: string;
  customer_gstin: string | null;
  customer_address: string | null;
  invoice_date: string | Date;
  items: unknown;
  subtotal: number;
  tax_total: number;
  tax_cgst: number;
  tax_sgst: number;
  tax_igst: number;
  is_interstate: boolean;
  gst_enabled: boolean | null;
  grand_total: number;
  status: string;
  irn: string | null;
  ewb_number: string | null;
};

function parseItems(raw: unknown): Array<{
  description: string;
  hsnSac?: string;
  qty: number;
  rate: number;
  gstPercent: number;
  taxable: number;
  tax: number;
  total: number;
}> {
  let items = raw;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items.map(it => {
    const row = it as Record<string, unknown>;
    return {
      description: String(row.description || 'Item'),
      hsnSac: row.hsnSac != null ? String(row.hsnSac) : undefined,
      qty: Number(row.qty) || 1,
      rate: Number(row.rate) || 0,
      gstPercent: Number(row.gstPercent) || 0,
      taxable: Number(row.taxable) || 0,
      tax: Number(row.tax) || 0,
      total: Number(row.total) || 0,
    };
  });
}

async function loadInvoice(client: PoolClient, tenantId: string, invoiceId: string): Promise<InvRow> {
  const row = (
    await client.query(`SELECT * FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE`, [
      invoiceId,
      tenantId,
    ])
  ).rows[0] as InvRow | undefined;
  if (!row) throw new StandaloneInvoiceGstError('Invoice not found', 404);
  if (row.status === 'cancelled')
    throw new StandaloneInvoiceGstError('Cannot generate GST docs for a cancelled invoice');
  return row;
}

async function loadSellerContext(client: PoolClient, tenantId: string, creds: GstApiCredentials) {
  const [tenant, bs] = await Promise.all([
    client.query('SELECT company_name, phone, address, gst_number FROM tenants WHERE id = $1', [tenantId]),
    client.query('SELECT gst_api_gstin, gst_api_seller_pin FROM bill_settings WHERE tenant_id = $1', [tenantId]),
  ]);
  const t = tenant.rows[0] as Record<string, string> | undefined;
  const sellerGstin = resolveSellerGstin(
    creds.mode,
    bs.rows[0]?.gst_api_gstin as string | undefined,
    t?.gst_number,
    creds.gstin,
  );
  if (!sellerGstin) {
    throw new StandaloneInvoiceGstError('Valid seller GSTIN required. Configure Settings → GST API.');
  }
  return {
    sellerGstin,
    sellerName: t?.company_name || 'Seller',
    sellerAddr: t?.address || 'Address',
    settingsPin: String(bs.rows[0]?.gst_api_seller_pin || ''),
  };
}

function buildLines(inv: InvRow, sellerGstin: string, buyerGstin: string) {
  const gstEnabled = inv.gst_enabled == null ? Number(inv.tax_total) > 0 : !!inv.gst_enabled;
  if (!gstEnabled || !(Number(inv.tax_total) > 0)) {
    throw new StandaloneInvoiceGstError('Invoice has no GST — e-invoice applies to tax invoices only.');
  }
  const items = parseItems(inv.items);
  if (!items.length) throw new StandaloneInvoiceGstError('Invoice has no line items');

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  const lineItems = items.map(it => {
    const taxable = Number(it.taxable) || 0;
    const rate = Number(it.gstPercent) || 0;
    const taxAmt = Number(it.tax) || Math.round(((taxable * rate) / 100) * 100) / 100;
    const { cgst, sgst, igst } = splitGst(taxAmt, sellerGstin, buyerGstin);
    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    return {
      hsnCode: it.hsnSac || '9999',
      productName: it.description,
      qty: it.qty,
      unitPrice: it.qty ? taxable / it.qty : taxable,
      gstRate: rate,
      taxable,
      cgst,
      sgst,
      igst,
      total: taxable + cgst + sgst + igst,
    };
  });
  return {
    lineItems,
    totalTaxable: Math.round(totalTaxable * 100) / 100,
    totalCgst: Math.round(totalCgst * 100) / 100,
    totalSgst: Math.round(totalSgst * 100) / 100,
    totalIgst: Math.round(totalIgst * 100) / 100,
  };
}

export async function generateStandaloneInvoiceIrn(
  pool: Pool,
  tenantId: string,
  invoiceId: string,
  opts?: { sellerPin?: string; buyerPin?: string },
): Promise<IrnResult & { mode: string; invoiceId: string }> {
  const loaded = await loadGstCredentials(pool, tenantId);
  if (loaded.ok === false) throw new StandaloneInvoiceGstError(loaded.error);
  const creds = loaded.creds;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = await loadInvoice(client, tenantId, invoiceId);
    if (inv.irn) {
      throw new StandaloneInvoiceGstError(`Invoice already has an IRN. Cancel it before regenerating.`);
    }
    const seller = await loadSellerContext(client, tenantId, creds);
    const pins = resolvePins(creds.mode, opts?.sellerPin, opts?.buyerPin, seller.settingsPin);
    const buyerGstin = inv.customer_gstin || '';
    const supplyType = resolveSupplyType(buyerGstin);
    if (creds.mode !== 'mock' && supplyType === 'B2B' && !isValidGstin(buyerGstin)) {
      throw new StandaloneInvoiceGstError('Valid buyer GSTIN required for B2B e-invoice.');
    }
    const lines = buildLines(inv, seller.sellerGstin, buyerGstin);
    const invoiceDate =
      typeof inv.invoice_date === 'string'
        ? inv.invoice_date.slice(0, 10)
        : inv.invoice_date.toISOString().slice(0, 10);
    const payload = buildIrnPayload({
      sellerGstin: seller.sellerGstin,
      sellerName: seller.sellerName,
      sellerAddr: seller.sellerAddr,
      sellerPin: pins.sellerPin,
      buyerGstin: buyerGstin || undefined,
      buyerName: inv.customer_name || 'Buyer',
      buyerAddr: inv.customer_address || seller.sellerAddr,
      buyerPin: pins.buyerPin,
      invoiceNo: inv.invoice_number,
      invoiceDate: fmtDate(invoiceDate),
      items: lines.lineItems,
      totalTaxable: lines.totalTaxable,
      totalCgst: lines.totalCgst,
      totalSgst: lines.totalSgst,
      totalIgst: lines.totalIgst,
      grandTotal: Number(inv.grand_total) || 0,
      supplyType,
    });
    const nic = new NicApiClient(creds);
    const result = await nic.generateIrn(payload);
    await client.query(
      `UPDATE standalone_invoices
       SET irn = $1, irn_ack_no = $2, irn_ack_dt = $3, irn_qr = $4
       WHERE id = $5 AND tenant_id = $6`,
      [result.irn, result.ackNo, result.ackDt, result.signedQrCode || result.qrCode, invoiceId, tenantId],
    );
    await client.query('COMMIT');
    return { ...result, mode: creds.mode, invoiceId };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}

export async function generateStandaloneInvoiceEwb(
  pool: Pool,
  tenantId: string,
  input: {
    invoiceId: string;
    vehicleNo: string;
    distance: number;
    transportMode?: string;
    transporterName?: string;
    transporterId?: string;
    sellerPin?: string;
    buyerPin?: string;
  },
): Promise<EwbResult & { mode: string; invoiceId: string }> {
  if (!input.vehicleNo?.trim()) throw new StandaloneInvoiceGstError('vehicleNo required');
  if (!(Number(input.distance) > 0)) throw new StandaloneInvoiceGstError('distance (km) required');

  const loaded = await loadGstCredentials(pool, tenantId);
  if (loaded.ok === false) throw new StandaloneInvoiceGstError(loaded.error);
  const creds = loaded.creds;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const inv = await loadInvoice(client, tenantId, input.invoiceId);
    if (inv.ewb_number) {
      throw new StandaloneInvoiceGstError(`Invoice already has an E-way bill.`);
    }
    const seller = await loadSellerContext(client, tenantId, creds);
    const pins = resolvePins(creds.mode, input.sellerPin, input.buyerPin, seller.settingsPin);
    const buyerGstin = inv.customer_gstin && isValidGstin(inv.customer_gstin) ? inv.customer_gstin : 'URP';
    const lines = buildLines(inv, seller.sellerGstin, buyerGstin);
    const invoiceDate =
      typeof inv.invoice_date === 'string'
        ? inv.invoice_date.slice(0, 10)
        : inv.invoice_date.toISOString().slice(0, 10);
    const payload = buildEwbPayload({
      supplyType: 'O',
      subSupplyType: '1',
      docType: 'INV',
      docNo: inv.invoice_number,
      docDate: fmtDate(invoiceDate),
      sellerGstin: seller.sellerGstin,
      sellerName: seller.sellerName,
      sellerAddr: seller.sellerAddr,
      sellerPin: pins.sellerPin,
      buyerGstin,
      buyerName: inv.customer_name || 'Buyer',
      buyerAddr: inv.customer_address || seller.sellerAddr,
      buyerPin: pins.buyerPin,
      vehicleNo: input.vehicleNo.trim().toUpperCase(),
      distance: Number(input.distance),
      transportMode: String(input.transportMode || '1'),
      transporterName: input.transporterName || '',
      transporterId: input.transporterId || '',
      items: lines.lineItems.map(it => ({
        productName: it.productName,
        hsnCode: it.hsnCode,
        qty: it.qty,
        taxable: it.taxable,
        cgst: it.cgst,
        sgst: it.sgst,
        igst: it.igst,
        total: it.total,
      })),
      totalTaxable: lines.totalTaxable,
      totalCgst: lines.totalCgst,
      totalSgst: lines.totalSgst,
      totalIgst: lines.totalIgst,
      grandTotal: Number(inv.grand_total) || 0,
    });
    const nic = new NicApiClient(creds);
    const result = await nic.generateEwb(payload);
    await client.query(`UPDATE standalone_invoices SET ewb_number = $1 WHERE id = $2 AND tenant_id = $3`, [
      result.ewbNo,
      input.invoiceId,
      tenantId,
    ]);
    await client.query('COMMIT');
    return { ...result, mode: creds.mode, invoiceId: input.invoiceId };
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    client.release();
  }
}
