import { describe, it, expect, beforeEach } from 'vitest';
import { consumeAnalyticsDeepLink, stashAnalyticsDeepLink, tabForActivityType } from '../../src/lib/analyticsDeepLink';

describe('analyticsDeepLink', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('stashes and consumes once', () => {
    stashAnalyticsDeepLink({ kind: 'financeParty', partyKey: 'vendor:V1' });
    expect(consumeAnalyticsDeepLink()).toEqual({ kind: 'financeParty', partyKey: 'vendor:V1' });
    expect(consumeAnalyticsDeepLink()).toBeNull();
  });

  it('maps activity types to tabs', () => {
    expect(tabForActivityType('invoice')).toBe('invoices');
    expect(tabForActivityType('payment')).toBe('finance');
    expect(tabForActivityType('expense')).toBe('purchases');
    expect(tabForActivityType('sale')).toBe('sales');
    expect(tabForActivityType('distribution')).toBe('distribution');
    expect(tabForActivityType('unknown')).toBe('finance');
  });
});
