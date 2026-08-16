/** Pure helpers for Books bill-wise outstanding panel. */

export type OutstandingPartyRow = {
  partyKey: string;
  clientName: string;
  balance: number;
  advanceBalance?: number;
  invoiceCount: number;
};

export type OutstandingBillRow = {
  partyKey: string;
  clientName: string;
  invoiceId: string;
  invoiceNumber: string;
  invoiceDate: string;
  balance: number;
  grandTotal: number;
  paid: number;
};

export type AgeBucket = '0-30' | '31-60' | '61-90' | '90+';

export type AgingTotals = {
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
  total: number;
};

/** Days between bill date and asOf (calendar days, floored). */
export function daysPastDue(invoiceDate: string, asOf = new Date()): number {
  const raw = String(invoiceDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return 0;
  const [y, m, d] = raw.split('-').map(Number);
  const start = new Date(y, m - 1, d);
  const end = new Date(asOf.getFullYear(), asOf.getMonth(), asOf.getDate());
  return Math.max(0, Math.floor((end.getTime() - start.getTime()) / 86400000));
}

export function outstandingAgeBucket(days: number): AgeBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/** Sum open bill balances into AR aging buckets (QuickBooks-style). */
export function summarizeArAging(
  bills: Array<{ invoiceDate: string; balance: number }>,
  asOf = new Date(),
): AgingTotals {
  const totals: AgingTotals = { d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0, total: 0 };
  for (const b of bills) {
    const bal = Number(b.balance) || 0;
    if (bal <= 0.005) continue;
    totals.total += bal;
    const bucket = outstandingAgeBucket(daysPastDue(b.invoiceDate, asOf));
    if (bucket === '0-30') totals.d0_30 += bal;
    else if (bucket === '31-60') totals.d31_60 += bal;
    else if (bucket === '61-90') totals.d61_90 += bal;
    else totals.d90plus += bal;
  }
  return totals;
}

/** Parties with open dues (balance > 0), sorted by balance desc. */
export function partiesWithOpenDues<T extends OutstandingPartyRow>(rows: T[]): T[] {
  return rows
    .filter(r => Number(r.balance) > 0.005)
    .slice()
    .sort((a, b) => Number(b.balance) - Number(a.balance) || a.clientName.localeCompare(b.clientName));
}

/** Filter open bills by search (party or invoice no). */
export function filterOpenBills<T extends OutstandingBillRow>(rows: T[], search: string): T[] {
  const q = search.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    r =>
      r.clientName.toLowerCase().includes(q) ||
      r.invoiceNumber.toLowerCase().includes(q) ||
      r.partyKey.toLowerCase().includes(q),
  );
}

/** Bills for one partyKey. */
export function billsForParty<T extends OutstandingBillRow>(rows: T[], partyKey: string): T[] {
  return rows.filter(r => r.partyKey === partyKey);
}
