import crypto from 'crypto';
import { db } from '../db';

/** Billable amount per distributed unit (GST-inclusive when billed_price is set). */
export const DISTRIBUTION_BILL_UNIT_SQL = 'COALESCE(pd.billed_price, pd.net_price, p.price)';

export function parsePagination(query: Record<string, unknown>): { limit: number; offset: number; page: number } {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(query.limit ?? '50'), 10) || 50));
  return { limit, offset: (page - 1) * limit, page };
}

export function applyDateFilter(query: Record<string, unknown>, dateColumn: string, params: unknown[]): string {
  let sql = '';
  const { dateFrom, dateTo, dateRange } = query;
  const today = new Date().toISOString().slice(0, 10);
  if (dateRange === 'today') {
    sql += ` AND ${dateColumn} = ?`;
    params.push(today);
  } else if (dateRange === 'week') {
    const d = new Date(); d.setDate(d.getDate() - 7);
    sql += ` AND ${dateColumn} >= ?`;
    params.push(d.toISOString().slice(0, 10));
  } else if (dateRange === 'month') {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    sql += ` AND ${dateColumn} >= ?`;
    params.push(d.toISOString().slice(0, 10));
  } else {
    if (typeof dateFrom === 'string' && dateFrom) { sql += ` AND ${dateColumn} >= ?`; params.push(dateFrom); }
    if (typeof dateTo === 'string' && dateTo) { sql += ` AND ${dateColumn} <= ?`; params.push(dateTo); }
  }
  return sql;
}

export function logAudit(action: string, entityType: string, entityId?: string, details?: string, userId?: string, userName?: string) {
  try {
    db.prepare('INSERT INTO audit_log (user_id, user_name, action, entity_type, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)').run(userId ?? null, userName ?? null, action, entityType, entityId ?? null, details ?? null);
  } catch (_) {}
}

export const hashPassword = (p: string) => crypto.createHash('sha256').update(p).digest('hex');

export const mapProduct = (r: Record<string, unknown>) => ({
  id: r.id,
  name: r.name,
  barcode: r.barcode ?? null,
  category: r.category_name ?? r.category ?? null,
  categoryId: r.category_id ?? null,
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
  warrantyApplicable: r.warranty_applicable !== 0,
  barcodeRange: r.barcodeRange ?? null,
});
