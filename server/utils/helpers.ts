import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Pool } from 'pg';

export function uid(prefix: string): string {
  return `${prefix}${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
}


/** Billable amount per distributed unit (GST-inclusive when billed_price is set). */
export const DISTRIBUTION_BILL_UNIT_SQL = 'COALESCE(pd.billed_price, pd.net_price, p.price)';

export function parsePagination(query: Record<string, unknown>): { limit: number; offset: number; page: number } {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(String(query.limit ?? '50'), 10) || 50));
  return { limit, offset: (page - 1) * limit, page };
}

export function applyDateFilter(query: Record<string, unknown>, dateColumn: string, params: unknown[], paramOffset?: number): string {
  let sql = '';
  let idx = (paramOffset ?? params.length) + 1;
  const { dateFrom, dateTo, dateRange } = query;
  const today = new Date().toISOString().slice(0, 10);
  if (dateRange === 'today') {
    sql += ` AND ${dateColumn} = $${idx}`;
    params.push(today);
    idx++;
  } else if (dateRange === 'week') {
    const d = new Date(); d.setDate(d.getDate() - 7);
    sql += ` AND ${dateColumn} >= $${idx}`;
    params.push(d.toISOString().slice(0, 10));
    idx++;
  } else if (dateRange === 'month') {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    sql += ` AND ${dateColumn} >= $${idx}`;
    params.push(d.toISOString().slice(0, 10));
    idx++;
  } else {
    if (typeof dateFrom === 'string' && dateFrom) { sql += ` AND ${dateColumn} >= $${idx}`; params.push(dateFrom); idx++; }
    if (typeof dateTo === 'string' && dateTo) { sql += ` AND ${dateColumn} <= $${idx}`; params.push(dateTo); idx++; }
  }
  return sql;
}

export async function logAudit(pool: Pool, tenantId: string, action: string, entityType: string, entityId?: string, details?: string, userId?: string, userName?: string) {
  const ctx = { tenantId, action, entityType, entityId, details, userId, userName };
  try {
    await pool.query(
      'INSERT INTO audit_log (tenant_id, user_id, user_name, action, entity_type, entity_id, details) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [tenantId, userId ?? null, userName ?? null, action, entityType, entityId ?? null, details ?? null]
    );
    const { logger } = await import('./logger');
    logger.info(`[AUDIT] ${action} ${entityType}`, ctx);
  } catch (err) {
    const { logger } = await import('./logger');
    logger.error('Audit log failed', { ...ctx, error: String(err) });
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
  barcodeUnitType: (r.barcodeUnitType as string) || (r.barcode_unit_type as string) || ((Number(r.pack_size) || 1) > 1 ? 'box' : 'piece'),
  priceIncludesGst: !!(r.price_includes_gst),
});
