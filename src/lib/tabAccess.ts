import { isHotelRestaurantBusiness } from '../../shared/hotelMasters';

/** Tab RBAC levels used by the app shell nav and route guards. */
export type AccessLevel = 'hidden' | 'view' | 'print' | 'full';

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
        (tabId.startsWith('hosp_') ? map.hospitality : undefined)) as string | undefined;
      if (level === 'full' || level === 'print' || level === 'view' || level === 'hidden') return level;
      return 'hidden';
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
      return 'hidden';
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
  return 'hidden';
}
