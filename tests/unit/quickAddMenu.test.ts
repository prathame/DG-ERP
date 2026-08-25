import { describe, expect, it } from 'vitest';
import { CREATE_LAUNCH_TABS, visibleCreateLaunches } from '../../src/lib/quickAdd';
import type { Tab } from '../../src/types';

describe('visibleCreateLaunches', () => {
  it('returns invoice, quote, challan, purchase, product when every tab is writable', () => {
    expect(visibleCreateLaunches(() => true)).toEqual(['invoice', 'quote', 'challan', 'purchase', 'product']);
  });

  it('omits items whose tab cannot be created', () => {
    const canCreate = (tab: Tab) => tab === 'invoices' || tab === 'quotations';
    expect(visibleCreateLaunches(canCreate)).toEqual(['invoice', 'quote']);
  });

  it('maps each launch to the tab the create form lives on', () => {
    expect(CREATE_LAUNCH_TABS.invoice).toBe('invoices');
    expect(CREATE_LAUNCH_TABS.quote).toBe('quotations');
    expect(CREATE_LAUNCH_TABS.challan).toBe('distribution');
    expect(CREATE_LAUNCH_TABS.purchase).toBe('purchases');
    expect(CREATE_LAUNCH_TABS.product).toBe('inventory');
  });

  it('is empty when the user has no create access', () => {
    expect(visibleCreateLaunches(() => false)).toEqual([]);
  });
});
