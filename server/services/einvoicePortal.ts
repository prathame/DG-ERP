/**
 * Portal (offline) E-Invoice / E-Way Bill — download NIC JSON, import IRN/EWB from government portal.
 * Used when tenant einvoice_mode = 'manual'. API generation uses einvoice_mode = 'auto'.
 */
import type { Pool } from 'pg';
import { parsePortalResponseJson } from '../../shared/parsePortalResponse';
import { validateEwbCompliance } from '../../shared/gstEwbValidation';
import { buildEinvoiceEwbDtls, type GstPortalTransport } from '../../shared/gstPortalTransport';
import { isValidGstin, splitGst } from '../utils/helpers';
import { StandaloneInvoiceGstError } from './standaloneInvoiceGst';

function stateFromGstin(gstin: string): string {
  return gstin?.length >= 2 ? gstin.substring(0, 2) : '00';
}

function pinFromAddress(addr: string): number {
  const m = (addr || '').match(/\b(\d{6})\b/);
  return m ? parseInt(m[1], 10) : 0;
}

function fmtNicDate(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime()) && typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}/.test(iso)) {
    const [y, m, day] = iso.slice(0, 10).split('-').map(Number);
    return `${String(day).padStart(2, '0')}/${String(m).padStart(2, '0')}/${y}`;
  }
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
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
};

function parseItems(raw: unknown) {
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
      hsnSac: row.hsnSac != null ? String(row.hsnSac) : '',
      qty: Number(row.qty) || 1,
      unit: row.unit != null ? String(row.unit) : 'PCS',
      taxable: Number(row.taxable) || 0,
      tax: Number(row.tax) || 0,
      gstPercent: Number(row.gstPercent) || 0,
      total: Number(row.total) || 0,
    };
  });
}

async function loadStandaloneInvoice(pool: Pool, tenantId: string, invoiceId: string): Promise<InvRow> {
  const row = (
    await pool.query(`SELECT * FROM standalone_invoices WHERE id = $1 AND tenant_id = $2`, [invoiceId, tenantId])
  ).rows[0] as InvRow | undefined;
  if (!row) throw new StandaloneInvoiceGstError('Invoice not found', 404);
  if (row.status === 'cancelled') throw new StandaloneInvoiceGstError('Cannot file GST docs for a cancelled invoice');
  const gstOn = row.gst_enabled == null ? Number(row.tax_total) > 0 : !!row.gst_enabled;
  if (!gstOn || !(Number(row.tax_total) > 0)) {
    throw new StandaloneInvoiceGstError('Invoice has no GST — e-invoice applies to tax invoices only.');
  }
  return row;
}

async function loadSellerBuyer(pool: Pool, tenantId: string, inv: InvRow) {
  const tenant = (
    await pool.query('SELECT company_name, phone, address, gst_number, admin_email FROM tenants WHERE id = $1', [
      tenantId,
    ])
  ).rows[0] as Record<string, string>;
  const bs = (await pool.query('SELECT gst_api_gstin FROM bill_settings WHERE tenant_id = $1', [tenantId])).rows[0] as
    { gst_api_gstin?: string } | undefined;
  const sellerGstin = String(bs?.gst_api_gstin || tenant.gst_number || '')
    .toUpperCase()
    .trim();
  const buyerGstin = String(inv.customer_gstin || '')
    .toUpperCase()
    .trim();
  return { tenant, sellerGstin, buyerGstin };
}

/** NIC e-invoice JSON for standalone invoice (upload to einvoice portal). Optional transport → EwbDtls for combined IRN+EWB. */
export async function buildStandaloneEinvoiceNicJson(
  pool: Pool,
  tenantId: string,
  invoiceId: string,
  transport?: GstPortalTransport,
) {
  const inv = await loadStandaloneInvoice(pool, tenantId, invoiceId);
  const { tenant, sellerGstin, buyerGstin } = await loadSellerBuyer(pool, tenantId, inv);
  const items = parseItems(inv.items);
  if (!items.length) throw new StandaloneInvoiceGstError('Invoice has no line items');

  const isB2B = buyerGstin.length >= 15;
  const fromStcd = stateFromGstin(sellerGstin) || '24';
  const toStcd = stateFromGstin(buyerGstin) || fromStcd;
  const fromPin = pinFromAddress(tenant.address || '') || 380001;
  const toPin = pinFromAddress(inv.customer_address || '') || fromPin;
  const isInterState = !!inv.is_interstate || fromStcd !== toStcd;

  let totTaxable = 0;
  let totCgst = 0;
  let totSgst = 0;
  const itemList = items.map((it, i) => {
    const taxable = it.taxable;
    const taxAmt = it.tax || Math.round(((taxable * it.gstPercent) / 100) * 100) / 100;
    const { cgst, sgst, igst } = splitGst(taxAmt, sellerGstin, buyerGstin);
    totTaxable += taxable;
    totCgst += cgst;
    totSgst += sgst;
    return {
      SlNo: String(i + 1),
      IsServc: 'N',
      PrdDesc: it.description,
      HsnCd: it.hsnSac || '9999',
      Qty: it.qty,
      Unit: it.unit || 'PCS',
      UnitPrice: it.qty ? Math.round((taxable / it.qty) * 100) / 100 : taxable,
      GstRt: it.gstPercent,
      CgstAmt: isInterState ? 0 : cgst,
      SgstAmt: isInterState ? 0 : sgst,
      IgstAmt: isInterState ? igst : 0,
      CesAmt: 0,
      TotAmt: taxable,
      TotItemVal: it.total || taxable + taxAmt,
    };
  });
  const totVal = Number(inv.grand_total) || totTaxable + totCgst + totSgst;
  const invoiceDate = fmtNicDate(inv.invoice_date);

  const errors: string[] = [];
  const warnings: string[] = [];
  if (!sellerGstin) errors.push('Seller GSTIN is missing — add in Settings → GST API or Profile');
  else if (!isValidGstin(sellerGstin)) errors.push(`Seller GSTIN "${sellerGstin}" format is invalid`);
  if (isB2B && buyerGstin && !isValidGstin(buyerGstin)) errors.push(`Buyer GSTIN "${buyerGstin}" format is invalid`);

  const eInvoice: Record<string, unknown> = {
    Version: '1.1',
    TranDtls: { TaxSch: 'GST', SupTyp: isB2B ? 'B2B' : 'B2C', RegRev: 'N', IgstOnIntra: isInterState ? 'Y' : 'N' },
    DocDtls: { Typ: 'INV', No: inv.invoice_number, Dt: invoiceDate },
    SellerDtls: {
      Gstin: sellerGstin,
      LglNm: tenant.company_name || 'Seller',
      Addr1: tenant.address || 'N/A',
      Loc:
        String(tenant.address || '')
          .split(',')
          .slice(-2, -1)[0]
          ?.trim() || 'N/A',
      Pin: fromPin,
      Stcd: fromStcd,
      Ph: tenant.phone || '',
      Em: tenant.admin_email || '',
    },
    BuyerDtls: {
      Gstin: buyerGstin || 'URP',
      LglNm: inv.customer_name || 'Buyer',
      Pos: toStcd,
      Addr1: inv.customer_address || 'N/A',
      Loc:
        String(inv.customer_address || '')
          .split(',')
          .slice(-2, -1)[0]
          ?.trim() || 'N/A',
      Pin: toPin,
      Stcd: toStcd,
      Ph: '',
      Em: '',
    },
    ItemList: itemList,
    ValDtls: {
      AssVal: Math.round(totTaxable * 100) / 100,
      CgstVal: isInterState ? 0 : Math.round(totCgst * 100) / 100,
      SgstVal: isInterState ? 0 : Math.round(totSgst * 100) / 100,
      IgstVal: isInterState ? Math.round((totCgst + totSgst) * 100) / 100 : 0,
      CesVal: 0,
      Discount: 0,
      OthChrg: 0,
      RndOffAmt: 0,
      TotInvVal: totVal,
    },
  };

  if (transport?.transporterName?.trim()) {
    const compliance = validateEwbCompliance({
      docDate: inv.invoice_date,
      totInvValue: totVal,
      distance: transport.distance,
      vehicleNo: transport.vehicleNo,
      transportMode: transport.transportMode,
    });
    warnings.push(...compliance.warnings);
    errors.push(...compliance.errors);
    eInvoice.EwbDtls = buildEinvoiceEwbDtls(transport);
    eInvoice._portalHint =
      'Upload on einvoice1.gst.gov.in only — IRN and E-Way Bill are generated together. Then Import response JSON in Dhandho.';
  } else {
    eInvoice._portalHint =
      'Upload on einvoice1.gst.gov.in. For E-Way with goods, download with transport details (combined JSON).';
  }

  return { ...eInvoice, _validation: { valid: errors.length === 0, errors, warnings } };
}

export async function buildStandaloneEwaybillNicJson(
  pool: Pool,
  tenantId: string,
  invoiceId: string,
  transport: {
    vehicleNo: string;
    distance: number;
    transportMode?: string;
    transporterName?: string;
    transporterId?: string;
    transDocNo?: string;
    transDocDate?: string;
    subSupplyType?: string;
    docType?: string;
    vehicleType?: string;
    dispatchMasterRequired?: boolean;
    dispatchFromState?: string;
  },
) {
  const inv = await loadStandaloneInvoice(pool, tenantId, invoiceId);
  const { tenant, sellerGstin, buyerGstin } = await loadSellerBuyer(pool, tenantId, inv);
  const items = parseItems(inv.items);
  const fromStateCode = parseInt(stateFromGstin(sellerGstin), 10) || 24;
  const toStateCode = parseInt(stateFromGstin(buyerGstin), 10) || fromStateCode;
  const fromPincode = pinFromAddress(tenant.address || '') || 380001;
  const toPincode = pinFromAddress(inv.customer_address || '') || fromPincode;
  const isInterState = !!inv.is_interstate || fromStateCode !== toStateCode;
  const modeMap: Record<string, string> = {
    Road: '1',
    Rail: '2',
    Air: '3',
    Ship: '4',
    '1': '1',
    '2': '2',
    '3': '3',
    '4': '4',
  };
  const transMode = modeMap[transport.transportMode || 'Road'] || '1';
  const actFromState = transport.dispatchMasterRequired
    ? parseInt(String(transport.dispatchFromState || fromStateCode), 10) || fromStateCode
    : fromStateCode;

  let totTaxable = 0;
  let totCgst = 0;
  let totSgst = 0;
  const itemList = items.map((it, i) => {
    const taxable = it.taxable;
    const taxAmt = it.tax || 0;
    const half = Math.round((taxAmt / 2) * 100) / 100;
    totTaxable += taxable;
    totCgst += isInterState ? 0 : half;
    totSgst += isInterState ? 0 : taxAmt - half;
    return {
      SlNo: String(i + 1),
      PrdDesc: it.description,
      HsnCd: it.hsnSac || '9999',
      Qty: it.qty,
      Unit: it.unit || 'PCS',
      UnitPrice: it.qty ? Math.round((taxable / it.qty) * 100) / 100 : taxable,
      TotAmt: taxable,
      GstRt: it.gstPercent,
      CgstAmt: isInterState ? 0 : half,
      SgstAmt: isInterState ? 0 : taxAmt - half,
      IgstAmt: isInterState ? taxAmt : 0,
      CesAmt: 0,
      TotItemVal: it.total || taxable + taxAmt,
    };
  });
  const totVal = Number(inv.grand_total) || totTaxable + totCgst + totSgst;
  const invoiceDate = fmtNicDate(inv.invoice_date);
  const rawDocDate = typeof inv.invoice_date === 'string' ? inv.invoice_date : inv.invoice_date.toISOString();

  const compliance = validateEwbCompliance({
    docDate: rawDocDate,
    totInvValue: totVal,
    distance: transport.distance,
    vehicleNo: transport.vehicleNo,
    transportMode: transMode,
  });

  const ewbJson = {
    Version: '1.01',
    SupTyp: buyerGstin ? 'B2B' : 'B2C',
    SubSupTyp: transport.subSupplyType || 'Supply',
    DocTyp: transport.docType || 'INV',
    DocNo: inv.invoice_number,
    DocDt: invoiceDate,
    FromGstin: sellerGstin,
    FromTrdName: tenant.company_name || 'Seller',
    FromAddr1: tenant.address || 'N/A',
    FromPincode: fromPincode,
    FromStateCode: fromStateCode,
    ActFromStateCode: actFromState,
    ToGstin: buyerGstin || 'URP',
    ToTrdName: inv.customer_name || 'Buyer',
    ToAddr1: inv.customer_address || 'N/A',
    ToPincode: toPincode,
    ToStateCode: toStateCode,
    TotalValue: Math.round(totTaxable * 100) / 100,
    CgstValue: Math.round(totCgst * 100) / 100,
    SgstValue: Math.round(totSgst * 100) / 100,
    IgstValue: isInterState ? Math.round((Number(inv.tax_total) || 0) * 100) / 100 : 0,
    CesValue: 0,
    TotInvValue: totVal,
    TransMode: transMode,
    TransDistance: transport.distance,
    TransporterName: transport.transporterName || '',
    TransporterId: transport.transporterId || '',
    TransDocNo: transport.transDocNo || '',
    TransDocDate: transport.transDocDate || invoiceDate,
    VehicleNo: transport.vehicleNo,
    VehicleType: transport.vehicleType || (transMode === '4' ? 'O' : 'R'),
    ItemList: itemList,
    _portalHint: 'Upload at ewaybillgst.gov.in → E-Waybill → Generate Bulk → Upload JSON',
  };

  return {
    ...ewbJson,
    _validation: { valid: compliance.valid, errors: compliance.errors, warnings: compliance.warnings },
  };
}

export async function clearStandaloneInvoiceGstFiling(
  pool: Pool,
  tenantId: string,
  invoiceId: string,
  scope: 'irn' | 'ewb' | 'all',
) {
  if (scope === 'ewb' || scope === 'all') {
    await pool.query(
      `UPDATE standalone_invoices SET ewb_number = NULL WHERE id = $1 AND tenant_id = $2 AND status <> 'cancelled'`,
      [invoiceId, tenantId],
    );
  }
  if (scope === 'irn' || scope === 'all') {
    const { rowCount } = await pool.query(
      `UPDATE standalone_invoices
       SET irn = NULL, irn_ack_no = NULL, irn_ack_dt = NULL, irn_qr = NULL
       WHERE id = $1 AND tenant_id = $2 AND status <> 'cancelled'`,
      [invoiceId, tenantId],
    );
    if (!rowCount) throw new StandaloneInvoiceGstError('Invoice not found', 404);
  } else {
    const row = await pool.query(`SELECT id FROM standalone_invoices WHERE id = $1 AND tenant_id = $2`, [
      invoiceId,
      tenantId,
    ]);
    if (!row.rowCount) throw new StandaloneInvoiceGstError('Invoice not found', 404);
  }
  return { ok: true, scope };
}

export async function clearBatchGstFiling(pool: Pool, tenantId: string, batchId: string, scope: 'irn' | 'ewb' | 'all') {
  if (scope === 'ewb' || scope === 'all') {
    await pool.query(`UPDATE product_distribution SET ewb_number = NULL WHERE batch_id = $1 AND tenant_id = $2`, [
      batchId,
      tenantId,
    ]);
  }
  if (scope === 'irn' || scope === 'all') {
    const { rowCount } = await pool.query(
      `UPDATE product_distribution
       SET irn = NULL, irn_ack_no = NULL, irn_ack_dt = NULL, irn_qr = NULL
       WHERE batch_id = $1 AND tenant_id = $2`,
      [batchId, tenantId],
    );
    if (!rowCount) throw new StandaloneInvoiceGstError('Batch not found', 404);
  } else {
    const row = await pool.query(`SELECT id FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2 LIMIT 1`, [
      batchId,
      tenantId,
    ]);
    if (!row.rowCount) throw new StandaloneInvoiceGstError('Batch not found', 404);
  }
  return { ok: true, scope };
}

export async function importStandaloneInvoiceIrn(
  pool: Pool,
  tenantId: string,
  input: { invoiceId: string; irn: string; ackNo?: string; ackDt?: string; irnQr?: string },
) {
  const irn = String(input.irn || '').trim();
  if (!irn) throw new StandaloneInvoiceGstError('IRN is required');
  const { rowCount } = await pool.query(
    `UPDATE standalone_invoices
     SET irn = $1, irn_ack_no = $2, irn_ack_dt = $3, irn_qr = COALESCE($4, irn_qr)
     WHERE id = $5 AND tenant_id = $6 AND status <> 'cancelled'`,
    [irn, input.ackNo || null, input.ackDt || null, input.irnQr || null, input.invoiceId, tenantId],
  );
  if (!rowCount) throw new StandaloneInvoiceGstError('Invoice not found', 404);
  return { ok: true, irn, ackNo: input.ackNo, ackDt: input.ackDt, irnQr: input.irnQr };
}

export async function importStandaloneInvoiceEwb(
  pool: Pool,
  tenantId: string,
  input: { invoiceId: string; ewbNumber: string },
) {
  const ewbNumber = String(input.ewbNumber || '').trim();
  if (!ewbNumber) throw new StandaloneInvoiceGstError('E-Way Bill number is required');
  const { rowCount } = await pool.query(
    `UPDATE standalone_invoices SET ewb_number = $1 WHERE id = $2 AND tenant_id = $3 AND status <> 'cancelled'`,
    [ewbNumber, input.invoiceId, tenantId],
  );
  if (!rowCount) throw new StandaloneInvoiceGstError('Invoice not found', 404);
  return { ok: true, ewbNumber };
}

export async function importBatchIrn(
  pool: Pool,
  tenantId: string,
  input: { batchId: string; irn: string; ackNo?: string; ackDt?: string; irnQr?: string },
) {
  const irn = String(input.irn || '').trim();
  if (!irn) throw new StandaloneInvoiceGstError('IRN is required');
  const { rowCount } = await pool.query(
    `UPDATE product_distribution
     SET irn = $1, irn_ack_no = $2, irn_ack_dt = $3, irn_qr = COALESCE($4, irn_qr)
     WHERE batch_id = $5 AND tenant_id = $6 AND COALESCE(gst_applied, false) = true`,
    [irn, input.ackNo || null, input.ackDt || null, input.irnQr || null, input.batchId, tenantId],
  );
  if (!rowCount) throw new StandaloneInvoiceGstError('No GST distribution units found for this batch', 404);
  return { ok: true, irn };
}

export async function importBatchEwb(pool: Pool, tenantId: string, input: { batchId: string; ewbNumber: string }) {
  const ewbNumber = String(input.ewbNumber || '').trim();
  if (!ewbNumber) throw new StandaloneInvoiceGstError('E-Way Bill number is required');
  const { rowCount } = await pool.query(
    `UPDATE product_distribution SET ewb_number = $1 WHERE batch_id = $2 AND tenant_id = $3`,
    [ewbNumber, input.batchId, tenantId],
  );
  if (!rowCount) throw new StandaloneInvoiceGstError('Batch not found', 404);
  return { ok: true, ewbNumber };
}

async function batchDocNo(pool: Pool, tenantId: string, batchId: string): Promise<string | undefined> {
  const docNo = batchId?.trim();
  return docNo || undefined;
}

/** Import IRN / Signed QR / EWB from portal response JSON (after bulk upload on govt site). */
export async function importStandaloneInvoicePortalResponse(
  pool: Pool,
  tenantId: string,
  input: { invoiceId: string; response: unknown },
) {
  const inv = await loadStandaloneInvoice(pool, tenantId, input.invoiceId);
  const parsed = parsePortalResponseJson(input.response, inv.invoice_number);
  let result: { ok: boolean; irn?: string; ackNo?: string; ackDt?: string; irnQr?: string; ewbNumber?: string } = {
    ok: true,
  };
  if (parsed.irn) {
    const irnResult = await importStandaloneInvoiceIrn(pool, tenantId, {
      invoiceId: input.invoiceId,
      irn: parsed.irn,
      ackNo: parsed.ackNo,
      ackDt: parsed.ackDt,
      irnQr: parsed.irnQr,
    });
    result = { ...result, ...irnResult, irnQr: parsed.irnQr || irnResult.irnQr };
  }
  if (parsed.ewbNumber) {
    const ewb = await importStandaloneInvoiceEwb(pool, tenantId, {
      invoiceId: input.invoiceId,
      ewbNumber: parsed.ewbNumber,
    });
    result.ewbNumber = ewb.ewbNumber;
  }
  if (!parsed.irn && !parsed.ewbNumber) {
    throw new StandaloneInvoiceGstError('Response JSON has no IRN or E-Way Bill number');
  }
  return result;
}

export async function importBatchPortalResponse(
  pool: Pool,
  tenantId: string,
  input: { batchId: string; response: unknown },
) {
  const docNo = await batchDocNo(pool, tenantId, input.batchId);
  const parsed = parsePortalResponseJson(input.response, docNo);
  let result: { ok: boolean; irn?: string; ewbNumber?: string } = { ok: true };
  if (parsed.irn) {
    result = {
      ...result,
      ...(await importBatchIrn(pool, tenantId, { batchId: input.batchId, ...parsed, irn: parsed.irn })),
    };
  }
  if (parsed.ewbNumber) {
    const ewb = await importBatchEwb(pool, tenantId, { batchId: input.batchId, ewbNumber: parsed.ewbNumber });
    result.ewbNumber = ewb.ewbNumber;
  }
  if (!parsed.irn && !parsed.ewbNumber) {
    throw new StandaloneInvoiceGstError('Response JSON has no IRN or E-Way Bill number');
  }
  return result;
}
