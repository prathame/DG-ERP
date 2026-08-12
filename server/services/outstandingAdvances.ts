/**
 * Fold unallocated service advances (vendor_payments) into party outstanding aggregates.
 * Matches invoice-finance /summary so Accounts Outstanding and Collections stay consistent.
 */

export type OutstandingPartyAgg = {
  vendorId: string;
  vendorName: string;
  totalBilled: number;
  totalPaid: number;
  balance: number;
  advanceBalance: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
};

export type VendorAdvanceRow = {
  vendorId: string;
  vendorName: string;
  advance: number;
};

/** Mutates byParty: adds advance into paid/balance; creates advance-only parties when needed. */
export function foldVendorAdvancesIntoOutstanding(
  byParty: Map<string, OutstandingPartyAgg>,
  advances: VendorAdvanceRow[],
): void {
  for (const vp of advances) {
    const advance = Math.round((Number(vp.advance) || 0) * 100) / 100;
    if (!(advance > 0)) continue;
    const partyKey = `vendor:${vp.vendorId}`;
    const existing = byParty.get(partyKey);
    if (existing) {
      existing.totalPaid = Math.round((existing.totalPaid + advance) * 100) / 100;
      existing.advanceBalance = advance;
      existing.balance = Math.round((existing.totalBilled - existing.totalPaid) * 100) / 100;
    } else {
      byParty.set(partyKey, {
        vendorId: partyKey,
        vendorName: vp.vendorName || 'Unknown',
        totalBilled: 0,
        totalPaid: advance,
        balance: Math.round(-advance * 100) / 100,
        advanceBalance: advance,
        d0_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90plus: 0,
      });
    }
  }
}
