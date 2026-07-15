import { pool } from '../pg-db';

type Resource = 'products' | 'vendors' | 'users' | 'barcodes';

const RESOURCE_TABLE: Record<Resource, string> = {
  products: 'products',
  vendors: 'vendors',
  users: 'users',
  barcodes: 'product_inventory',
};

const PLAN_COL: Record<Resource, string> = {
  products: 'max_products',
  vendors: 'max_vendors',
  users: 'max_users',
  barcodes: 'max_barcodes',
};

/** Returns 403 JSON error string if limit exceeded, null if allowed. */
export async function checkPlanLimit(
  tenantId: string,
  resource: Resource
): Promise<{ error: string } | null> {
  try {
    const planRow = await pool.query(
      `SELECT p.${PLAN_COL[resource]} AS lim
       FROM plans p JOIN tenants t ON t.plan_id = p.id
       WHERE t.id = $1`,
      [tenantId]
    );
    const limit: number = planRow.rows[0]?.lim ?? -1;
    if (limit === -1) return null; // -1 = unlimited

    // Vendors: exclude the built-in OWNER row
    const whereExtra = resource === 'vendors' ? " AND id != 'OWNER'" : '';
    const countRow = await pool.query(
      `SELECT COUNT(*) AS c FROM ${RESOURCE_TABLE[resource]} WHERE tenant_id = $1${whereExtra}`,
      [tenantId]
    );
    const current = Number(countRow.rows[0]?.c ?? 0);

    if (current >= limit) {
      return {
        error: `Plan limit reached: your plan allows ${limit} ${resource}. Upgrade to add more.`,
      };
    }
    return null;
  } catch {
    // Fail closed — do not allow creates past plan caps when limits cannot be checked
    return { error: 'Unable to verify plan limits. Please try again.' };
  }
}
