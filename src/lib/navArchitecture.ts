/**
 * Miracle-shaped information architecture for Dhandho.
 *
 * Thesis: Dhandho is being redesigned as a voucher-first accounting ERP that
 * can replace Miracle for day-to-day work, while Miracle CMP import remains the
 * onboarding bridge. Navigation mirrors Miracle’s mental model:
 *
 *   Masters → Transactions → Books (COA / vouchers / import) → Reports
 *
 * Vertical extras (warranty, hospitality) stay optional sections.
 * Tab ids stay stable — only grouping and labels change. Visibility still
 * comes from shared/tabPresets.ts + SA / device overrides.
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
  /** Sidebar shows a single Books hub when `books` is on; else Miracle Import alone. */
  books: ['books', 'book_import'],
  afterSales: ['warranty', 'replacements', 'rewards'],
  hospitality: ['hosp_floor', 'hosp_waiter', 'hosp_kitchen', 'hosp_queue', 'hosp_parcels', 'hosp_menu', 'hosp_members'],
};

/**
 * Books child tabs (`book_ledgers` etc.) stay in presets / deep links but are
 * not listed in the sidebar — `BooksView` panels own that navigation.
 */
export const BOOKS_SIDEBAR_CHILD_TAB_IDS = ['book_ledgers', 'book_vouchers', 'book_products'] as const;

/** Pick which Books sidebar entries to show given current visibility. */
export function booksSidebarTabIds(visible: (tabId: string) => boolean): string[] {
  if (visible('books')) return ['books'];
  if (visible('book_import')) return ['book_import'];
  return [];
}

const BOOKS_FAMILY_TAB_IDS = new Set<string>(['books', 'book_import', ...BOOKS_SIDEBAR_CHILD_TAB_IDS]);

/** Highlight the Books hub when any Books / Miracle child tab is active. */
export function isNavItemActive(
  itemId: string,
  activeTab: string,
  opts?: { /** Service: masters hub also owns Invoice Finance (collections) */ serviceClientsHub?: boolean },
): boolean {
  if (itemId === activeTab) return true;
  if (itemId === 'books' && BOOKS_FAMILY_TAB_IDS.has(activeTab)) return true;
  if (opts?.serviceClientsHub && itemId === 'masters' && activeTab === 'finance') return true;
  return false;
}
