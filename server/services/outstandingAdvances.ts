/**
 * Fold unallocated service advances (vendor_payments) into party outstanding aggregates.
 * Matches invoice-finance /summary so Accounts Outstanding and Collections stay consistent.
 */

export type OutstandingPartyAgg = {
  vendorId: string;
  vendorName: string;
  totalBilled: number;
  totalPaid: number;
  /** Sum of open bill balances (bill-wise due, before advances). */
  billDue: number;
  /** Net party balance after unallocated advances (vendor_payments). */
  balance: number;
  advanceBalance: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90plus: number;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export type VendorAdvanceRow = {
  vendorId: string;
  vendorName: string;
  advance: number;
};

/** Mutates byParty: records advance and net balance; billDue stays bill-wise. */
export function foldVendorAdvancesIntoOutstanding(
  byParty: Map<string, OutstandingPartyAgg>,
  advances: VendorAdvanceRow[],
): void {
  for (const vp of advances) {
    const advance = roundMoney(Number(vp.advance) || 0);
    if (!(advance > 0)) continue;
    const partyKey = `vendor:${vp.vendorId}`;
    const existing = byParty.get(partyKey);
    if (existing) {
      const billDue = roundMoney(existing.billDue || existing.balance);
      existing.billDue = billDue;
      existing.advanceBalance = advance;
      existing.totalPaid = roundMoney(existing.totalPaid + advance);
      existing.balance = roundMoney(billDue - advance);
    } else {
      byParty.set(partyKey, {
        vendorId: partyKey,
        vendorName: vp.vendorName || 'Unknown',
        totalBilled: 0,
        totalPaid: advance,
        billDue: 0,
        balance: roundMoney(-advance),
        advanceBalance: advance,
        d0_30: 0,
        d31_60: 0,
        d61_90: 0,
        d90plus: 0,
      });
    }
  }
}
