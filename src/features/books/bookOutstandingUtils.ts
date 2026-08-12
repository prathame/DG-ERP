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
