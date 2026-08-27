import { isHotelRestaurantBusiness } from '../../shared/hotelMasters';

/** Tab RBAC levels used by the app shell nav and route guards. */
export type AccessLevel = 'hidden' | 'view' | 'print' | 'full';

/** Read-only tabs may still print (warehouse / staff). Legacy `print` counts as read. */
export function canPrintAccess(level: AccessLevel | string | undefined): boolean {
  return level === 'view' || level === 'print' || level === 'full';
}

export function canWriteAccess(level: AccessLevel | string | undefined): boolean {
  return level === 'full';
}

/**
 * Hotel floor roles → allowed nav tab ids.
 * Admin/Manager/Staff keep broader defaults; these roles are allowlist-only.
 */
export const HOTEL_ROLE_TABS: Record<string, readonly string[]> = {
  Waiter: ['hosp_waiter', 'hosp_queue'],
  Host: ['hosp_queue'],
  Kitchen: ['hosp_kitchen'],
};

/**
 * Nav tabs with no dedicated permission checkbox in Settings → Users (see `PERMISSION_LABELS` in
 * SettingsView.tsx). They still need *some* permission-map entry to check once a user has an
 * explicit `permissions` object — which every SA-created service-cloud user and every user
 * created/edited via Settings → Users has (see `normalizePermissions`) — otherwise a missing key
 * falls into the deny-by-default branch below and the tab silently disappears from nav for
 * *any* role, including Admin. Mirrors the module that already gates each tab's API server-side
 * (`PATH_MODULE` in server/middleware/permissions.ts).
 */
const UNMAPPED_TAB_FALLBACK: Record<string, string> = {
  masters: 'settings',
  invoices: 'sales',
  chatbot: 'dashboard',
  books: 'books',
  book_ledgers: 'books',
  book_vouchers: 'books',
  book_products: 'books',
  book_import: 'books',
};

/**
 * Resolve access for a nav tab id from user.permissions + role defaults.
 *
 * - `null` / `undefined` / `[]` / `{}` → role defaults (empty object is the Offline Mobile DB default)
 * - object map → per-tab level; missing key is hidden (deny by default)
 * - string array (legacy) → full if listed
 * - Waiter / Host / Kitchen → allowlisted hosp_* tabs only (ignores coarse hospitality unlock)
 * - hosp_members → Admin / Super Admin only (plans + registry); waiters attach via order UI
 * - hotel_restaurant settings → Admin / Super Admin only (hides Manager/Staff/floor even if perms grant view)
 */
export function resolveTabAccess(
  tabId: string,
  user: { permissions?: unknown; role?: string; businessType?: string } | null | undefined,
): AccessLevel {
  if (!user) return 'hidden';

  const role = user.role ?? '';
  const hotelAllow = HOTEL_ROLE_TABS[role];
  if (hotelAllow) {
    return hotelAllow.includes(tabId) ? 'full' : 'hidden';
  }

  // Members tab is Admin-managed even when hospitality module is unlocked for Staff
  if (tabId === 'hosp_members' && !['Super Admin', 'Admin'].includes(role)) {
    return 'hidden';
  }

  // Hotel books / company Settings: owner (Admin) only — not Manager/Staff/floor
  if (
    tabId === 'settings' &&
    isHotelRestaurantBusiness(user.businessType) &&
    !['Super Admin', 'Admin'].includes(role)
  ) {
    return 'hidden';
  }

  const perms = user.permissions;

  if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
    const map = perms as Record<string, string>;
    // Offline Mobile schema defaults permissions to '{}'. Treat as unset.
    if (Object.keys(map).length === 0) {
      // fall through to role defaults
    } else {
      const level = (map[tabId] ??
        (tabId === 'analytics' ? map.dashboard : undefined) ??
        (tabId === 'dashboard' ? map.analytics : undefined) ??
        // API RBAC module key → hospitality nav tabs
        (tabId.startsWith('hosp_') ? map.hospitality : undefined) ??
        (UNMAPPED_TAB_FALLBACK[tabId] ? map[UNMAPPED_TAB_FALLBACK[tabId]] : undefined)) as string | undefined;
      if (level === 'full' || level === 'print' || level === 'view' || level === 'hidden') return level;
      // `verification` has no backend permission module (unmapped in PATH_MODULE) — an explicit
      // permissions map was never meant to gate it, so fall through to the role default instead
      // of denying by default.
      if (tabId !== 'verification') return 'hidden';
    }
  } else if (Array.isArray(perms)) {
    // Empty array is also an unset Offline default — do not deny-all.
    if (perms.length === 0) {
      // fall through to role defaults
    } else {
      if (perms.includes(tabId)) return 'full';
      if (tabId === 'analytics' && perms.includes('dashboard')) return 'full';
      if (tabId === 'dashboard' && perms.includes('analytics')) return 'full';
      if (tabId.startsWith('hosp_') && perms.includes('hospitality')) return 'full';
      if (UNMAPPED_TAB_FALLBACK[tabId] && perms.includes(UNMAPPED_TAB_FALLBACK[tabId])) return 'full';
      if (tabId !== 'verification') return 'hidden';
    }
  }

  if (['Super Admin', 'Admin'].includes(role)) return 'full';
  if (role === 'Manager') return tabId === 'settings' ? 'view' : 'full';
  if (role === 'Staff') {
    // Generic Staff with unset perms can use all hospitality tabs
    if (tabId.startsWith('hosp_')) return 'full';
    return 'view';
  }
  if (role === 'Vendor')
    return ['analytics', 'dashboard', 'distribution', 'finance'].includes(tabId) ? 'view' : 'hidden';
  if (role === 'Accountant') {
    if (tabId === 'settings' || tabId === 'masters') return 'hidden';
    if (
      [
        'books',
        'book_ledgers',
        'book_vouchers',
        'book_products',
        'book_import',
        'accounts',
        'finance',
        'purchases',
      ].includes(tabId)
    )
      return 'full';
    if (['analytics', 'dashboard', 'inventory', 'invoices', 'sales', 'distribution'].includes(tabId)) return 'view';
    return 'hidden';
  }
  return 'hidden';
}
