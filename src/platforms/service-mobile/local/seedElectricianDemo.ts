/**
 * One-time Offline Mobile demo seed: electrician clients + catalog price rules.
 */
import { localQuery } from './db';
import { ELECTRICIAN_DEMO_CLIENTS, ELECTRICIAN_DEMO_PRICE_ITEMS } from './electricianDemoData';

const META_KEY = 'demo_electrician_seeded';

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

export async function isElectricianDemoSeeded(): Promise<boolean> {
  const { rows } = await localQuery<{ value: string }>(`SELECT value FROM sm_meta WHERE key = $1`, [META_KEY]);
  return rows[0]?.value === '1';
}

/**
 * Inserts sample clients + catalog products/price rules once per local DB.
 * Safe to call on every boot — no-ops after first seed.
 * @returns true if data was inserted
 */
export async function ensureElectricianDemoSeeded(tenantId: string): Promise<boolean> {
  if (!tenantId) return false;
  if (await isElectricianDemoSeeded()) return false;

  for (const c of ELECTRICIAN_DEMO_CLIENTS) {
    const { rows } = await localQuery<{ id: string }>(
      `SELECT id FROM vendors WHERE tenant_id=$1 AND lower(name)=lower($2) LIMIT 1`,
      [tenantId, c.name],
    );
    if (rows[0]) continue;
    await localQuery(
      `INSERT INTO vendors (id, tenant_id, name, phone, email, address, gstin) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [uid('V'), tenantId, c.name, c.phone, null, c.address, null],
    );
  }

  for (const item of ELECTRICIAN_DEMO_PRICE_ITEMS) {
    const name = item.productName.trim();
    const price = item.price;
    const minQty = item.minQty ?? 1;
    const ruleName = item.ruleName || 'Catalog rate';

    let productId: string;
    const existingProduct = await localQuery<{ id: string }>(
      `SELECT id FROM products WHERE tenant_id=$1 AND lower(name)=lower($2) LIMIT 1`,
      [tenantId, name],
    );
    if (existingProduct.rows[0]) {
      productId = existingProduct.rows[0].id;
    } else {
      productId = uid('P');
      await localQuery(
        `INSERT INTO products
           (id, tenant_id, name, price, gst_percent, gst_rate, stock, warranty_months, price_includes_gst)
         VALUES ($1,$2,$3,$4,18,18,0,0,false)`,
        [productId, tenantId, name, price],
      );
    }

    const existingRule = await localQuery(
      `SELECT id FROM price_lists
       WHERE tenant_id=$1 AND product_id=$2 AND min_qty=$3 AND vendor_id IS NULL LIMIT 1`,
      [tenantId, productId, minQty],
    );
    if (existingRule.rows[0]) {
      await localQuery(`UPDATE price_lists SET name=$1, price=$2, is_active=true WHERE id=$3 AND tenant_id=$4`, [
        ruleName,
        price,
        existingRule.rows[0].id,
        tenantId,
      ]);
    } else {
      await localQuery(
        `INSERT INTO price_lists
           (id, tenant_id, name, product_id, vendor_id, min_qty, max_qty, price, valid_from, valid_to, is_active)
         VALUES ($1,$2,$3,$4,NULL,$5,NULL,$6,NULL,NULL,true)`,
        [uid('PL'), tenantId, ruleName, productId, minQty, price],
      );
    }
  }

  await localQuery(
    `INSERT INTO sm_meta (key, value) VALUES ($1,'1')
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [META_KEY],
  );
  return true;
}
