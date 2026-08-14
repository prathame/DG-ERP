/**
 * App information architecture for Dhandho.
 *
 *   Masters → Transactions → Reports (Accounts includes ledgers / vouchers / import)
 *
 * Books tab ids remain for SA toggles + deep links; they redirect into Accounts.
 * Visibility still comes from shared/tabPresets.ts + SA / device overrides.
 */

export type NavArchitectureSectionId = 'home' | 'transactions' | 'reports' | 'books' | 'afterSales' | 'hospitality';

/** Ordered tab ids inside each sidebar section (settings stays footer-pinned). */
export const NAV_ARCHITECTURE: Record<NavArchitectureSectionId, readonly string[]> = {
  home: ['analytics', 'masters'],
  transactions: [
    'invoices',
    'quotations',
    'purchases',
    'sales',
    'distribution',
    'inventory',
    'finance',
    'verification',
  ],
  reports: ['accounts'],
  /** No separate Books sidebar — capability lives under Accounts. */
  books: [],
  afterSales: ['warranty', 'replacements', 'rewards'],
  hospitality: ['hosp_floor', 'hosp_waiter', 'hosp_kitchen', 'hosp_queue', 'hosp_parcels', 'hosp_menu', 'hosp_members'],
};

/**
 * Books child tabs (`book_ledgers` etc.) stay in presets / deep links but are
 * not listed in the sidebar — `BooksView` panels own that navigation.
 */
export const BOOKS_SIDEBAR_CHILD_TAB_IDS = ['book_ledgers', 'book_vouchers', 'book_products'] as const;

/** @deprecated Books sidebar removed — always empty. Kept for callers. */
export function booksSidebarTabIds(_visible: (tabId: string) => boolean): string[] {
  return [];
}

const BOOKS_FAMILY_TAB_IDS = new Set<string>(['books', 'book_import', ...BOOKS_SIDEBAR_CHILD_TAB_IDS]);

/** Highlight the Books hub when any Books / Miracle child tab is active. */
export function isNavItemActive(
  itemId: string,
  activeTab: string,
  opts?: {
    /** @deprecated Service Collections is its own Transactions nav item; keep for old callers. */
    serviceClientsHub?: boolean;
  },
): boolean {
  if (itemId === activeTab) return true;
  if (itemId === 'books' && BOOKS_FAMILY_TAB_IDS.has(activeTab)) return true;
  if (opts?.serviceClientsHub && itemId === 'masters' && activeTab === 'finance') return true;
  return false;
}
