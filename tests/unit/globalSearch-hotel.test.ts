import { describe, expect, it } from 'vitest';
import { navigateForGlobalSearchHit } from '../../src/lib/globalSearch';

describe('navigateForGlobalSearchHit hotel_restaurant', () => {
  const hotel = { businessType: 'hotel_restaurant' as const, mastersVisible: false };

  it('routes catalog hits to Menu, parties to Invoices', () => {
    expect(navigateForGlobalSearchHit('product', { id: 'p1' }, hotel)).toEqual({ tab: 'hosp_menu' });
    expect(navigateForGlobalSearchHit('barcode', { id: 'b1', productId: 'p1' }, hotel)).toEqual({
      tab: 'hosp_menu',
    });
    expect(navigateForGlobalSearchHit('vendor', { id: 'v1' }, hotel)).toEqual({ tab: 'invoices' });
    expect(navigateForGlobalSearchHit('customer', { id: 'c1' }, hotel)).toEqual({ tab: 'invoices' });
  });

  it('routes staff to Settings when Masters is hidden', () => {
    expect(navigateForGlobalSearchHit('staff', { name: 'Ram' }, hotel)).toEqual({ tab: 'settings' });
  });

  it('routes staff to allowlisted Masters when Masters is visible', () => {
    expect(navigateForGlobalSearchHit('staff', { name: 'Ram' }, { ...hotel, mastersVisible: true })).toEqual({
      tab: 'masters',
      master: 'staff',
      staffName: 'Ram',
    });
  });

  it('does not change manufacturer product → inventory path', () => {
    expect(navigateForGlobalSearchHit('product', { id: 'p1' }, { inventoryVisible: true })).toEqual({
      tab: 'inventory',
    });
  });
});
