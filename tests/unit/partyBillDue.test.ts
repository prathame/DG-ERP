import { describe, expect, it } from 'vitest';
import { partyBillDue } from '../../src/components/ui/PaidBadge';

describe('partyBillDue', () => {
  it('is 0 for Miracle cash with no invoice (advance / negative net balance)', () => {
    expect(partyBillDue(0, -5000)).toBe(0);
    expect(partyBillDue(undefined, -5000)).toBe(0);
  });

  it('is net still-owed when there are bills, not gross bill due', () => {
    expect(partyBillDue(1200, 400)).toBe(400);
    expect(partyBillDue(1200, -800)).toBe(0);
    expect(partyBillDue(undefined, 1200)).toBe(1200);
  });
});
