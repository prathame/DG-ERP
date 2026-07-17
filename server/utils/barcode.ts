import { Pool } from 'pg';

/** Check if barcode exists anywhere - no overlap across all products (single round-trip) */
export async function barcodeExists(pool: Pool, tenantId: string, barcode: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT 1 WHERE EXISTS (
       SELECT 1 FROM product_inventory WHERE barcode = $1 AND tenant_id = $2
       UNION ALL SELECT 1 FROM product_distribution WHERE barcode = $1 AND tenant_id = $2
       UNION ALL SELECT 1 FROM product_sales WHERE barcode = $1 AND tenant_id = $2
       UNION ALL SELECT 1 FROM warranties WHERE barcode = $1 AND tenant_id = $2
       UNION ALL SELECT 1 FROM products WHERE barcode = $1 AND tenant_id = $2
     ) LIMIT 1`,
    [barcode, tenantId],
  );
  return result.rows.length > 0;
}

/** Expand alphanumeric range (e.g. SP001-SP010 or A1-A10) into array of barcodes */
export function expandBarcodeRange(start: string, end: string): string[] {
  const s = String(start).trim();
  const e = String(end).trim();
  if (!s || !e) return [];
  const matchStart = s.match(/^(.+?)(\d+)$/);
  const matchEnd = e.match(/^(.+?)(\d+)$/);
  if (!matchStart || !matchEnd) return [s];
  const prefixStart = matchStart[1];
  const prefixEnd = matchEnd[1];
  if (prefixStart !== prefixEnd) return [s];
  const numStart = parseInt(matchStart[2], 10);
  const numEnd = parseInt(matchEnd[2], 10);
  if (numStart > numEnd) return [s];
  const padLen = matchEnd[2].length;
  const results: string[] = [];
  for (let i = numStart; i <= numEnd; i++) {
    results.push(prefixStart + i.toString().padStart(padLen, '0'));
  }
  return results;
}

/** Find the highest barcode number for a given prefix across all tables (single query) */
export async function getMaxBarcodeNumber(pool: Pool, tenantId: string, prefix: string): Promise<number> {
  const likePattern = `${prefix}%`;
  const result = await pool.query(
    `SELECT barcode FROM product_inventory WHERE barcode LIKE $1 AND tenant_id = $2
     UNION ALL SELECT barcode FROM product_distribution WHERE barcode LIKE $1 AND tenant_id = $2
     UNION ALL SELECT barcode FROM product_sales WHERE barcode LIKE $1 AND tenant_id = $2
     UNION ALL SELECT barcode FROM warranties WHERE barcode LIKE $1 AND tenant_id = $2
     UNION ALL SELECT barcode FROM products WHERE barcode LIKE $1 AND tenant_id = $2`,
    [likePattern, tenantId],
  );
  let maxNum = 0;
  const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  for (const row of result.rows as { barcode: string }[]) {
    const m = row.barcode.match(regex);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  }
  return maxNum;
}

/** Generate barcodes from prefix + quantity, starting after the highest existing number */
export async function generateBarcodesFromPrefix(
  pool: Pool,
  tenantId: string,
  prefix: string,
  quantity: number,
  padLength?: number,
): Promise<string[]> {
  const startNum = (await getMaxBarcodeNumber(pool, tenantId, prefix)) + 1;
  const pad = padLength ?? Math.max(3, String(startNum + quantity - 1).length);
  const results: string[] = [];
  for (let i = 0; i < quantity; i++) {
    results.push(prefix + String(startNum + i).padStart(pad, '0'));
  }
  return results;
}
