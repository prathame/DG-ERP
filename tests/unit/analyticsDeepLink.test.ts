import { describe, it, expect, beforeEach } from 'vitest';
import { consumeAnalyticsDeepLink, stashAnalyticsDeepLink, tabForActivityType } from '../../src/lib/analyticsDeepLink';

/** Vitest node env has no sessionStorage — stub a minimal one for these helpers. */
function installMemorySessionStorage() {
  const map = new Map<string, string>();
  const store = {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    key: (i: number) => [...map.keys()][i] ?? null,
    get length() {
      return map.size;
    },
  };
  Object.defineProperty(globalThis, 'sessionStorage', { value: store, configurable: true });
}

describe('analyticsDeepLink', () => {
  beforeEach(() => {
    installMemorySessionStorage();
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
