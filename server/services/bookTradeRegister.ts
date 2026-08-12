/**
 * Miracle-style Sales / Purchase registers on Books vouchers.
 * One row per sales|purchase voucher; GST split when dual-write posted tax lines.
 */
import type { Pool } from 'pg';
import { round2 } from './bookReports';

export type TradeRegisterKind = 'sales' | 'purchase';

export type TradeRegisterRow = {
  voucherId: string;
  date: string | Date;
  voucherNumber: string | null;
  voucherType: string;
  partyName: string | null;
  contraName: string | null;
  amount: number;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  narration: string | null;
  externalRef: string | null;
};

export function classifyGst(externalRef: string | null, name: string): 'cgst' | 'sgst' | 'igst' | null {
  const ref = String(externalRef || '').toUpperCase();
  const n = String(name || '').toLowerCase();
  if (ref.includes('CGST') || /\bcgst\b/.test(n)) return 'cgst';
  if (ref.includes('SGST') || /\bsgst\b/.test(n)) return 'sgst';
  if (ref.includes('IGST') || /\bigst\b/.test(n)) return 'igst';
  return null;
}

export async function getTradeRegister(
  pool: Pool,
  tenantId: string,
  kind: TradeRegisterKind,
  from: string | null,
  to: string | null,
) {
  const params: unknown[] = [tenantId];
  let sql = `
    SELECT v.id, v.voucher_date, v.voucher_number, v.amount::float AS amount,
           v.narration, v.external_ref, v.voucher_type,
           pl.name AS party_name, cl.name AS contra_name
    FROM book_vouchers v
    LEFT JOIN book_ledgers pl ON pl.id = v.party_ledger_id AND pl.tenant_id = v.tenant_id
    LEFT JOIN book_ledgers cl ON cl.id = v.contra_ledger_id AND cl.tenant_id = v.tenant_id
    WHERE v.tenant_id = $1 AND (
      ($2::text = 'sales' AND v.voucher_type = 'sales')
      OR ($2::text = 'purchase' AND v.voucher_type IN ('purchase','purchase_return'))
    )`;
  params.push(kind);
  if (from) {
    params.push(from);
    sql += ` AND v.voucher_date >= $${params.length}`;
  }
  if (to) {
    params.push(to);
    sql += ` AND v.voucher_date <= $${params.length}`;
  }
  sql += ` ORDER BY v.voucher_date, v.voucher_number NULLS LAST, v.id LIMIT 5000`;

  const { rows: vouchers } = await pool.query(sql, params);
  if (!vouchers.length) {
    return {
      kind,
      from,
      to,
      rows: [] as TradeRegisterRow[],
      totals: { count: 0, amount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 },
    };
  }

  const ids = vouchers.map(v => String(v.id));
  const { rows: entryRows } = await pool.query(
    `SELECT e.voucher_id, e.debit::float AS debit, e.credit::float AS credit,
            l.name AS ledger_name, l.external_ref
     FROM book_voucher_entries e
     JOIN book_ledgers l ON l.id = e.ledger_id AND l.tenant_id = e.tenant_id
     WHERE e.tenant_id = $1 AND e.voucher_id = ANY($2::text[])`,
    [tenantId, ids],
  );

  const gstByVoucher = new Map<string, { cgst: number; sgst: number; igst: number }>();
  for (const e of entryRows) {
    const gstKind = classifyGst(e.external_ref, e.ledger_name);
    if (!gstKind) continue;
    // Sales: GST on credit (output). Purchase: GST on debit (input).
    const taxAmt = kind === 'sales' ? Number(e.credit || 0) : Number(e.debit || 0);
    if (!(taxAmt > 0)) continue;
    const cur = gstByVoucher.get(e.voucher_id) || { cgst: 0, sgst: 0, igst: 0 };
    cur[gstKind] = round2(cur[gstKind] + taxAmt);
    gstByVoucher.set(e.voucher_id, cur);
  }

  const rows: TradeRegisterRow[] = vouchers.map(v => {
    const rawAmount = round2(Number(v.amount || 0));
    const isReturn = String(v.voucher_type) === 'purchase_return';
    const amount = isReturn ? round2(-rawAmount) : rawAmount;
    const gst = gstByVoucher.get(v.id) || { cgst: 0, sgst: 0, igst: 0 };
    // Purchase returns credit input GST back — flip sign with the bill
    const sign = isReturn ? -1 : 1;
    const cgst = round2(gst.cgst * sign);
    const sgst = round2(gst.sgst * sign);
    const igst = round2(gst.igst * sign);
    const tax = round2(Math.abs(cgst) + Math.abs(sgst) + Math.abs(igst));
    const taxable = round2(Math.max(0, rawAmount - tax) * sign);
    return {
      voucherId: String(v.id),
      date: typeof v.voucher_date === 'string' ? v.voucher_date.slice(0, 10) : v.voucher_date,
      voucherNumber: v.voucher_number,
      voucherType: String(v.voucher_type || kind),
      partyName: v.party_name,
      contraName: v.contra_name,
      amount,
      taxable,
      cgst,
      sgst,
      igst,
      narration: v.narration,
      externalRef: v.external_ref,
    };
  });

  const totals = rows.reduce(
    (acc, r) => {
      acc.count += 1;
      acc.amount = round2(acc.amount + r.amount);
      acc.taxable = round2(acc.taxable + r.taxable);
      acc.cgst = round2(acc.cgst + r.cgst);
      acc.sgst = round2(acc.sgst + r.sgst);
      acc.igst = round2(acc.igst + r.igst);
      return acc;
    },
    { count: 0, amount: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 },
  );

  return { kind, from, to, rows, totals };
}
