import { describe, expect, it } from 'vitest';
import { booksSidebarTabIds, isNavItemActive, NAV_ARCHITECTURE } from '../../src/lib/navArchitecture';

describe('navArchitecture', () => {
  it('keeps Miracle-shaped section order keys', () => {
    expect(Object.keys(NAV_ARCHITECTURE)).toEqual([
      'home',
      'transactions',
      'reports',
      'books',
      'afterSales',
      'hospitality',
    ]);
  });

  it('puts day-to-day ops under transactions and accounts under reports', () => {
    expect(NAV_ARCHITECTURE.transactions).toContain('invoices');
    expect(NAV_ARCHITECTURE.transactions).toContain('finance');
    expect(NAV_ARCHITECTURE.reports).toEqual(['accounts']);
  });

  it('collapses Books sidebar to hub when books is visible', () => {
    expect(booksSidebarTabIds(id => id === 'books' || id === 'book_import')).toEqual(['books']);
  });

  it('falls back to Miracle Import when only import is visible', () => {
    expect(booksSidebarTabIds(id => id === 'book_import')).toEqual(['book_import']);
  });

  it('hides Books section when neither hub nor import is visible', () => {
    expect(booksSidebarTabIds(() => false)).toEqual([]);
  });

  it('treats Books child tabs as active on the Books hub item', () => {
    expect(isNavItemActive('books', 'book_import')).toBe(true);
    expect(isNavItemActive('books', 'book_vouchers')).toBe(true);
    expect(isNavItemActive('invoices', 'book_import')).toBe(false);
  });
});
