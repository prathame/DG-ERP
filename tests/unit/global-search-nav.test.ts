import { describe, it, expect } from 'vitest';
import { navigateForGlobalSearchHit, globalSearchHasHits, emptyGlobalSearchResults } from '../../src/lib/globalSearch';

describe('navigateForGlobalSearchHit', () => {
  it('never targets verification / verify', () => {
    const kinds = ['product', 'customer', 'vendor', 'barcode', 'challan', 'staff'] as const;
    for (const kind of kinds) {
      const nav = navigateForGlobalSearchHit(kind, { id: 'x', name: 'x' });
      expect(nav.tab).not.toBe('verification');
    }
  });

  it('maps vendor → masters vendor deep-link', () => {
    expect(navigateForGlobalSearchHit('vendor', { id: 'V1', name: 'Acme' })).toEqual({
      tab: 'masters',
      master: 'vendor',
      vendorId: 'V1',
    });
  });

  it('maps product to inventory when visible; service phone UX → priceList', () => {
    expect(navigateForGlobalSearchHit('product', { id: 'P1' }, { inventoryVisible: true })).toEqual({
      tab: 'inventory',
    });
    // Preferred flag (Service Cloud Capacitor service + Offline Mobile)
    expect(navigateForGlobalSearchHit('product', { id: 'P1' }, { servicePhoneUx: true })).toEqual({
      tab: 'masters',
      master: 'priceList',
    });
    // Deprecated alias still works
    expect(navigateForGlobalSearchHit('product', { id: 'P1' }, { serviceMobile: true })).toEqual({
      tab: 'masters',
      master: 'priceList',
    });
  });

  it('maps barcode to inventory (not verify); servicePhoneUx → priceList', () => {
    expect(navigateForGlobalSearchHit('barcode', { productId: 'P1' }, { inventoryVisible: true })).toEqual({
      tab: 'inventory',
    });
    expect(navigateForGlobalSearchHit('barcode', { productId: 'P1' }, { servicePhoneUx: true })).toEqual({
      tab: 'masters',
      master: 'priceList',
    });
  });

  it('maps staff by name to masters', () => {
    expect(navigateForGlobalSearchHit('staff', { name: 'Ravi' })).toEqual({
      tab: 'masters',
      master: 'staff',
      staffName: 'Ravi',
    });
  });
});

describe('globalSearchHasHits', () => {
  it('is false for empty buckets', () => {
    expect(globalSearchHasHits(emptyGlobalSearchResults())).toBe(false);
    expect(globalSearchHasHits(null)).toBe(false);
  });

  it('is true when any bucket has rows', () => {
    const r = emptyGlobalSearchResults();
    r.vendors.push({ id: '1', name: 'A', contact: '', phone: '' });
    expect(globalSearchHasHits(r)).toBe(true);
  });
});
