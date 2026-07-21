import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Pool } from 'pg';

export function uid(prefix: string): string {
  return `${prefix}${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}

// Indian mobile: 10 digits starting with 6-9, optional +91 prefix
export function isValidPhone(phone: string): boolean {
  const clean = phone.replace(/[\s\-()]/g, '');
  return /^(\+91)?[6-9]\d{9}$/.test(clean);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// GSTIN: 2-digit state + 10-char PAN + 1 entity + 1 Z + 1 checksum = 15 alphanumeric
export function isValidGstin(gstin: string): boolean {
  return /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z\d][A-Z\d]$/.test(gstin.trim().toUpperCase());
}

/** Billable amount per distributed unit (GST-inclusive when billed_price is set). */
export const DISTRIBUTION_BILL_UNIT_SQL = 'COALESCE(pd.billed_price, pd.net_price, p.price)';

/** Taxable value excl. GST for distribution units. */
export const DISTRIBUTION_TAXABLE_SQL = 'COALESCE(pd.net_price, p.price)';

/** GST amount on a distribution unit (0 when gst not applied). */
export const DISTRIBUTION_TAX_SQL = `CASE WHEN COALESCE(pd.gst_applied, false) THEN GREATEST(0, COALESCE(pd.billed_price, pd.net_price, p.price) - COALESCE(pd.net_price, p.price)) ELSE 0 END`;

/** Purchase taxable (excl. GST) = cost_price. */
export const PURCHASE_TAXABLE_SQL = 'COALESCE(pp.cost_price, 0)';

/** Purchase GST = billed - cost when gst applied. */
export const PURCHASE_TAX_SQL = `CASE WHEN COALESCE(pp.gst_applied, false) THEN GREATEST(0, COALESCE(pp.billed_price, pp.cost_price, 0) - COALESCE(pp.cost_price, 0)) ELSE 0 END`;

/**
 * Standalone invoice was created as a GST bill (frozen at create).
 * Legacy NULL → treat tax_total > 0 as GST (backfill-compatible).
 */
export const INVOICE_IS_GST_SQL = `COALESCE(si.gst_enabled, (COALESCE(si.tax_total, 0) > 0))`;

/** Taxable value for GST reports only (non-GST invoices contribute 0). */
export const INVOICE_TAXABLE_GST_SQL = `CASE WHEN ${INVOICE_IS_GST_SQL} THEN COALESCE(si.subtotal, 0) ELSE 0 END`;

/** Output tax for GST reports / balance sheet (non-GST invoices contribute 0). */
export const INVOICE_TAX_GST_SQL = `CASE WHEN ${INVOICE_IS_GST_SQL} THEN COALESCE(si.tax_total, 0) ELSE 0 END`;

/** Split GST into CGST/SGST (intra) or IGST (inter). Returns round amounts that sum to taxAmt. */
export function splitGst(
  taxAmt: number,
  sellerGstin?: string | null,
  buyerGstin?: string | null,
): { cgst: number; sgst: number; igst: number; interstate: boolean } {
  const tax = Math.round(Number(taxAmt) * 100) / 100;
  const sState = String(sellerGstin || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const bState = String(buyerGstin || '')
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const interstate = !!(sState && bState && /^\d{2}$/.test(sState) && /^\d{2}$/.test(bState) && sState !== bState);
  if (interstate) return { cgst: 0, sgst: 0, igst: tax, interstate: true };
  const cgst = Math.round((tax / 2) * 100) / 100;
  return { cgst, sgst: Math.round((tax - cgst) * 100) / 100, igst: 0, interstate: false };
}

/** Place of supply label from GSTIN state code (fallback seller / Gujarat). */
export function placeOfSupplyLabel(buyerGstin?: string | null, sellerGstin?: string | null): string {
  const STATE: Record<string, string> = {
    '01': 'Jammu & Kashmir',
    '02': 'Himachal Pradesh',
    '03': 'Punjab',
    '04': 'Chandigarh',
    '05': 'Uttarakhand',
    '06': 'Haryana',
    '07': 'Delhi',
    '08': 'Rajasthan',
    '09': 'Uttar Pradesh',
    '10': 'Bihar',
    '11': 'Sikkim',
    '12': 'Arunachal Pradesh',
    '13': 'Nagaland',
    '14': 'Manipur',
    '15': 'Mizoram',
    '16': 'Tripura',
    '17': 'Meghalaya',
    '18': 'Assam',
    '19': 'West Bengal',
    '20': 'Jharkhand',
    '21': 'Odisha',
    '22': 'Chhattisgarh',
    '23': 'Madhya Pradesh',
    '24': 'Gujarat',
    '25': 'Daman & Diu',
    '26': 'Dadra & Nagar Haveli',
    '27': 'Maharashtra',
    '29': 'Karnataka',
    '30': 'Goa',
    '32': 'Kerala',
    '33': 'Tamil Nadu',
    '34': 'Puducherry',
    '36': 'Telangana',
    '37': 'Andhra Pradesh',
  };
  const code = String(buyerGstin || sellerGstin || '24')
    .trim()
    .toUpperCase()
    .slice(0, 2);
  const name = STATE[code] || 'Gujarat';
  return `${name} (${code || '24'})`;
}

/** Exclusive GST: taxable base, tax amount, total. */
export function gstFromExclusive(
  taxable: number,
  ratePercent: number,
): { taxable: number; tax: number; total: number } {
  const base = Math.round(Number(taxable) * 100) / 100;
  const rate = Number(ratePercent) || 0;
  const tax = Math.round(base * rate) / 100;
  return { taxable: base, tax, total: Math.round((base + tax) * 100) / 100 };
}

export function parsePagination(query: Record<string, unknown>): { limit: number; offset: number; page: number } {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(query.limit ?? '50'), 10) || 50));
  return { limit, offset: (page - 1) * limit, page };
}

export function applyDateFilter(
  query: Record<string, unknown>,
  dateColumn: string,
  params: unknown[],
  paramOffset?: number,
): string {
  let sql = '';
  let idx = (paramOffset ?? params.length) + 1;
  const { dateFrom, dateTo, dateRange } = query;
  const today = new Date().toISOString().slice(0, 10);
  if (dateRange === 'today') {
    sql += ` AND ${dateColumn} = $${idx}`;
    params.push(today);
    idx++;
  } else if (dateRange === 'week') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    sql += ` AND ${dateColumn} >= $${idx}`;
    params.push(d.toISOString().slice(0, 10));
    idx++;
  } else if (dateRange === 'month') {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    sql += ` AND ${dateColumn} >= $${idx}`;
    params.push(d.toISOString().slice(0, 10));
    idx++;
  } else {
    if (typeof dateFrom === 'string' && dateFrom) {
      sql += ` AND ${dateColumn} >= $${idx}`;
      params.push(dateFrom);
      idx++;
    }
    if (typeof dateTo === 'string' && dateTo) {
      sql += ` AND ${dateColumn} <= $${idx}`;
      params.push(dateTo);
      idx++;
    }
  }
  return sql;
}

export async function logAudit(
  pool: Pool,
  tenantId: string,
  action: string,
  entityType: string,
  entityId?: string,
  details?: string,
  userId?: string,
  userName?: string,
) {
  const { redactPii } = await import('./pii');
  const { requestContext } = await import('./logger');
  const store = requestContext.getStore();
  const impersonatedBy = store?.impersonatedBy;
  let safeDetails = details ? redactPii(details) : null;
  if (impersonatedBy) {
    const tag = `[impersonatedBy=${impersonatedBy}]`;
    safeDetails = safeDetails ? `${safeDetails} ${tag}` : tag;
  }
  let safeName = userName ? redactPii(userName) : null;
  if (impersonatedBy && safeName) {
    safeName = `${safeName} (via SA)`;
  }
  const ctx = {
    tenantId,
    action,
    entityType,
    entityId,
    details: safeDetails,
    userId,
    userName: safeName,
    impersonatedBy,
  };
  try {
    await pool.query(
      'INSERT INTO audit_log (tenant_id, user_id, user_name, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [tenantId, userId ?? null, safeName, action, entityType, entityId ?? null, safeDetails],
    );
    const { logger } = await import('./logger');
    // Logtail gets redacted context only (no raw emails/phones)
    logger.info(`[AUDIT] ${action} ${entityType}`, ctx);
  } catch (err) {
    const { logger } = await import('./logger');
    logger.error('Audit log failed', { tenantId, action, entityType, entityId, error: '[REDACTED]' });
  }
}

export const hashPassword = (p: string) => bcrypt.hashSync(p, 12);

export const mapProduct = (r: Record<string, unknown>) => ({
  id: r.id,
  name: r.name,
  barcode: r.barcode ?? null,
  category: r.category_name ?? r.category ?? null,
  categoryId: null,
  description: r.description ?? null,
  rewardPointsValue: r.reward_points_value ?? 0,
  manufacturingDate: r.manufacturing_date ?? null,
  batchNumber: r.batch_number ?? null,
  status: r.status ?? 'Active',
  warrantyMonths: r.warranty_months ?? 12,
  price: r.price ?? 0,
  hsnCode: r.hsn_code ?? null,
  gstRate: r.gst_rate ?? 18,
  stock: r.stock ?? 0,
  totalInventory: r.totalInventory ?? r.stock ?? 0,
  remainingInventory: r.remainingInventory ?? r.stock ?? 0,
  soldCount: r.soldCount ?? 0,
  withVendors: r.withVendors ?? 0,
  barcodeRange: r.barcodeRange ?? null,
  packSize: Number(r.pack_size) || 1,
  packName: (r.pack_name as string) || 'Piece',
  barcodeUnitType:
    (r.barcodeUnitType as string) ||
    (r.barcode_unit_type as string) ||
    ((Number(r.pack_size) || 1) > 1 ? 'box' : 'piece'),
  priceIncludesGst: !!r.price_includes_gst,
});
