import { describe, expect, it } from 'vitest';
import { booksSidebarTabIds, isNavItemActive, NAV_ARCHITECTURE } from '../../src/lib/navArchitecture';

describe('navArchitecture', () => {
  it('keeps section order keys', () => {
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
    expect(NAV_ARCHITECTURE.books).toEqual([]);
  });

  it('hides Books sidebar (capability lives under Accounts)', () => {
    expect(booksSidebarTabIds(id => id === 'books' || id === 'book_import')).toEqual([]);
    expect(booksSidebarTabIds(id => id === 'book_import')).toEqual([]);
    expect(booksSidebarTabIds(() => false)).toEqual([]);
  });

  it('treats Books child tabs as active on the Books hub item (deep links)', () => {
    expect(isNavItemActive('books', 'book_import')).toBe(true);
    expect(isNavItemActive('books', 'book_vouchers')).toBe(true);
    expect(isNavItemActive('invoices', 'book_import')).toBe(false);
  });

  it('highlights Clients hub when service collections (finance) is active', () => {
    expect(isNavItemActive('masters', 'finance', { serviceClientsHub: true })).toBe(true);
    expect(isNavItemActive('masters', 'finance')).toBe(false);
    expect(isNavItemActive('masters', 'invoices', { serviceClientsHub: true })).toBe(false);
  });
});
