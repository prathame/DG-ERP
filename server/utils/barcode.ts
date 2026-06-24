import { db } from '../db';

/** Check if barcode exists anywhere - no overlap across all products */
export function barcodeExists(barcode: string): boolean {
  if (db.prepare('SELECT 1 FROM product_inventory WHERE barcode = ?').get(barcode)) return true;
  if (db.prepare('SELECT 1 FROM product_distribution WHERE barcode = ?').get(barcode)) return true;
  if (db.prepare('SELECT 1 FROM product_sales WHERE barcode = ?').get(barcode)) return true;
  if (db.prepare('SELECT 1 FROM warranties WHERE barcode = ?').get(barcode)) return true;
  if (db.prepare('SELECT 1 FROM products WHERE barcode = ?').get(barcode)) return true;
  return false;
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

/** Find the highest barcode number for a given prefix across all tables */
export function getMaxBarcodeNumber(prefix: string): number {
  const likePattern = `${prefix}%`;
  const tables = [
    'SELECT barcode FROM product_inventory WHERE barcode LIKE ?',
    'SELECT barcode FROM product_distribution WHERE barcode LIKE ?',
    'SELECT barcode FROM product_sales WHERE barcode LIKE ?',
    'SELECT barcode FROM warranties WHERE barcode LIKE ?',
    'SELECT barcode FROM products WHERE barcode LIKE ?',
  ];
  let maxNum = 0;
  const regex = new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\d+)$`);
  for (const sql of tables) {
    const rows = db.prepare(sql).all(likePattern) as { barcode: string }[];
    for (const row of rows) {
      const m = row.barcode.match(regex);
      if (m) {
        const n = parseInt(m[1], 10);
        if (n > maxNum) maxNum = n;
      }
    }
  }
  return maxNum;
}

/** Generate barcodes from prefix + quantity, starting after the highest existing number */
export function generateBarcodesFromPrefix(prefix: string, quantity: number, padLength?: number): string[] {
  const startNum = getMaxBarcodeNumber(prefix) + 1;
  const pad = padLength ?? Math.max(3, String(startNum + quantity - 1).length);
  const results: string[] = [];
  for (let i = 0; i < quantity; i++) {
    results.push(prefix + String(startNum + i).padStart(pad, '0'));
  }
  return results;
}
