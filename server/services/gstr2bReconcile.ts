/**
 * GSTR-2B upload reconcile — match portal B2B invoices against ops purchases
 * and Books purchase vouchers (Miracle / desk GL).
 */
import type { Pool } from 'pg';

export type Gstr2bBookSource = 'ops' | 'books' | 'both';

export type Gstr2bReconRow = {
  status: 'matched' | 'amount_mismatch' | 'book_only' | 'twob_only';
  supplier: string;
  ctin: string;
  invoiceNumber: string;
  date: string;
  twoBVal: number;
  bookVal: number;
  diff: number;
  itcAvailable: boolean;
  source: Gstr2bBookSource | null;
};

export type Gstr2bReconResult = {
  rows: Gstr2bReconRow[];
  stats: {
    total: number;
    matched: number;
    amount_mismatch: number;
    book_only: number;
    twob_only: number;
  };
};

type BookPurchase = {
  supplierName: string;
  supplierGstin: string;
  invoiceNumber: string;
  date: string;
  bookVal: number;
  source: Gstr2bBookSource;
};

export function normalizeGstr2bKeyPart(s: string): string {
  return String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function dateStr(d: unknown): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10);
}

async function loadOpsPurchases(pool: Pool, tenantId: string): Promise<Map<string, BookPurchase>> {
  const { rows: purchases } = await pool.query(
    `SELECT pp.batch_id, pp.invoice_number, pp.purchase_date, pp.billed_price,
            s.name as supplier_name, s.gst_number as supplier_gstin
     FROM product_purchases pp
     JOIN suppliers s ON pp.supplier_id = s.id AND s.tenant_id = pp.tenant_id
     WHERE pp.tenant_id = $1 AND s.gst_number IS NOT NULL AND TRIM(s.gst_number) <> ''`,
    [tenantId],
  );

  const bookMap = new Map<string, BookPurchase>();
  for (const p of purchases) {
    const gstin = normalizeGstr2bKeyPart(p.supplier_gstin);
    const invNo = normalizeGstr2bKeyPart(p.invoice_number || p.batch_id);
    if (!gstin || !invNo) continue;
    const key = `${gstin}::${invNo}`;
    const existing = bookMap.get(key);
    const billed = Number(p.billed_price) || 0;
    if (existing) {
      existing.bookVal = round2(existing.bookVal + billed);
    } else {
      bookMap.set(key, {
        supplierName: p.supplier_name,
        supplierGstin: p.supplier_gstin,
        invoiceNumber: p.invoice_number || p.batch_id,
        date: dateStr(p.purchase_date),
        bookVal: round2(billed),
        source: 'ops',
      });
    }
  }
  return bookMap;
}

async function mergeBooksPurchases(pool: Pool, tenantId: string, bookMap: Map<string, BookPurchase>): Promise<void> {
  const { rows } = await pool.query(
    `SELECT v.voucher_number, v.voucher_date, v.amount::float AS amount,
            pl.name AS party_name, pl.gstin AS party_gstin
     FROM book_vouchers v
     JOIN book_ledgers pl ON pl.id = v.party_ledger_id AND pl.tenant_id = v.tenant_id
     WHERE v.tenant_id = $1
       AND v.voucher_type = 'purchase'
       AND pl.gstin IS NOT NULL AND TRIM(pl.gstin) <> ''
       AND v.voucher_number IS NOT NULL AND TRIM(v.voucher_number) <> ''`,
    [tenantId],
  );

  for (const v of rows) {
    const gstinRaw = String(v.party_gstin || '');
    const invRaw = String(v.voucher_number || '');
    const gstin = normalizeGstr2bKeyPart(gstinRaw);
    const invNo = normalizeGstr2bKeyPart(invRaw);
    if (!gstin || !invNo) continue;
    const key = `${gstin}::${invNo}`;
    const amount = round2(Number(v.amount) || 0);
    const existing = bookMap.get(key);
    if (existing) {
      // Prefer Books voucher total (invoice value) when dual-written with ops stock.
      existing.bookVal = amount;
      if (existing.source === 'ops' || existing.source === 'both') existing.source = 'both';
      if (!existing.date) existing.date = dateStr(v.voucher_date);
      if (!existing.supplierName && v.party_name) existing.supplierName = v.party_name;
    } else {
      bookMap.set(key, {
        supplierName: v.party_name || gstinRaw,
        supplierGstin: gstinRaw,
        invoiceNumber: invRaw,
        date: dateStr(v.voucher_date),
        bookVal: amount,
        source: 'books',
      });
    }
  }
}

export async function reconcileGstr2b(
  pool: Pool,
  tenantId: string,
  twoBData: Record<string, unknown>,
): Promise<Gstr2bReconResult> {
  const b2b = (twoBData.docdata as Record<string, unknown> | undefined)?.b2b ?? twoBData.b2b;
  if (!Array.isArray(b2b) || !b2b.length) {
    throw Object.assign(new Error('No B2B data found in uploaded JSON'), { status: 400 });
  }

  const bookMap = await loadOpsPurchases(pool, tenantId);
  await mergeBooksPurchases(pool, tenantId, bookMap);

  const matchedKeys = new Set<string>();
  const rows: Gstr2bReconRow[] = [];

  for (const supplier of b2b as { ctin?: string; trdnm?: string; inv?: Record<string, unknown>[] }[]) {
    const ctin = normalizeGstr2bKeyPart(supplier.ctin || '');
    const supplierName = String(supplier.trdnm || supplier.ctin || ctin);
    const invoices = Array.isArray(supplier.inv) ? supplier.inv : [];

    for (const inv of invoices) {
      const invNumRaw = String(inv.inum || '');
      const invNum = normalizeGstr2bKeyPart(invNumRaw);
      const twoBVal = round2(Number(inv.val) || 0);
      const itcAvailable = String(inv.itcavl || 'Y').toUpperCase() === 'Y';
      const key = `${ctin}::${invNum}`;
      const book = bookMap.get(key);

      if (book) {
        matchedKeys.add(key);
        const diff = round2(twoBVal - book.bookVal);
        rows.push({
          status: Math.abs(diff) <= 1 ? 'matched' : 'amount_mismatch',
          supplier: supplierName,
          ctin: String(supplier.ctin || ''),
          invoiceNumber: invNumRaw,
          date: String(inv.dt || book.date || ''),
          twoBVal,
          bookVal: book.bookVal,
          diff,
          itcAvailable,
          source: book.source,
        });
      } else {
        rows.push({
          status: 'twob_only',
          supplier: supplierName,
          ctin: String(supplier.ctin || ''),
          invoiceNumber: invNumRaw,
          date: String(inv.dt || ''),
          twoBVal,
          bookVal: 0,
          diff: twoBVal,
          itcAvailable,
          source: null,
        });
      }
    }
  }

  for (const [key, book] of bookMap) {
    if (matchedKeys.has(key)) continue;
    rows.push({
      status: 'book_only',
      supplier: book.supplierName,
      ctin: book.supplierGstin,
      invoiceNumber: book.invoiceNumber,
      date: book.date,
      twoBVal: 0,
      bookVal: book.bookVal,
      diff: round2(-book.bookVal),
      itcAvailable: false,
      source: book.source,
    });
  }

  const stats = {
    total: rows.length,
    matched: rows.filter(r => r.status === 'matched').length,
    amount_mismatch: rows.filter(r => r.status === 'amount_mismatch').length,
    book_only: rows.filter(r => r.status === 'book_only').length,
    twob_only: rows.filter(r => r.status === 'twob_only').length,
  };

  return { rows, stats };
}
