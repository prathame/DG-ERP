import { describe, expect, it } from 'vitest';
import { foldVendorAdvancesIntoOutstanding, type OutstandingPartyAgg } from '../../server/services/outstandingAdvances';

function party(
  partial: Partial<OutstandingPartyAgg> & Pick<OutstandingPartyAgg, 'vendorId' | 'vendorName'>,
): OutstandingPartyAgg {
  return {
    totalBilled: 0,
    totalPaid: 0,
    balance: 0,
    advanceBalance: 0,
    d0_30: 0,
    d31_60: 0,
    d61_90: 0,
    d90plus: 0,
    ...partial,
  };
}

describe('foldVendorAdvancesIntoOutstanding', () => {
  it('reduces party balance by advance and sets advanceBalance', () => {
    const byParty = new Map<string, OutstandingPartyAgg>([
      [
        'vendor:V1',
        party({
          vendorId: 'vendor:V1',
          vendorName: 'ACME',
          totalBilled: 1000,
          totalPaid: 200,
          balance: 800,
          d0_30: 800,
        }),
      ],
    ]);
    foldVendorAdvancesIntoOutstanding(byParty, [{ vendorId: 'V1', vendorName: 'ACME', advance: 300 }]);
    const row = byParty.get('vendor:V1')!;
    expect(row.totalPaid).toBe(500);
    expect(row.advanceBalance).toBe(300);
    expect(row.balance).toBe(500);
    expect(row.d0_30).toBe(800); // aging stays bill-based
  });

  it('adds advance-only parties with negative balance', () => {
    const byParty = new Map<string, OutstandingPartyAgg>();
    foldVendorAdvancesIntoOutstanding(byParty, [{ vendorId: 'V2', vendorName: 'PREPAID', advance: 150 }]);
    const row = byParty.get('vendor:V2')!;
    expect(row.totalBilled).toBe(0);
    expect(row.advanceBalance).toBe(150);
    expect(row.balance).toBe(-150);
  });

  it('ignores zero/negative advances', () => {
    const byParty = new Map<string, OutstandingPartyAgg>();
    foldVendorAdvancesIntoOutstanding(byParty, [
      { vendorId: 'V3', vendorName: 'X', advance: 0 },
      { vendorId: 'V4', vendorName: 'Y', advance: -10 },
    ]);
    expect(byParty.size).toBe(0);
  });
});
