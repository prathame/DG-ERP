/** Tab RBAC levels used by the app shell nav and route guards. */
export type AccessLevel = 'hidden' | 'view' | 'print' | 'full';

/**
 * Resolve access for a nav tab id from user.permissions + role defaults.
 *
 * - `null` / `undefined` / `[]` / `{}` → role defaults (empty object is the Offline Mobile DB default)
 * - object map → per-tab level; missing key is hidden (deny by default)
 * - string array (legacy) → full if listed
 */
export function resolveTabAccess(
  tabId: string,
  user: { permissions?: unknown; role?: string } | null | undefined,
): AccessLevel {
  if (!user) return 'hidden';
  const perms = user.permissions;

  if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
    const map = perms as Record<string, string>;
    // Offline Mobile schema defaults permissions to '{}'. Treat as unset.
    if (Object.keys(map).length === 0) {
      // fall through to role defaults
    } else {
      const level = (map[tabId] ??
        (tabId === 'analytics' ? map.dashboard : undefined) ??
        (tabId === 'dashboard' ? map.analytics : undefined)) as string | undefined;
      if (level === 'full' || level === 'print' || level === 'view' || level === 'hidden') return level;
      return 'hidden';
    }
  } else if (Array.isArray(perms)) {
    if (perms.includes(tabId)) return 'full';
    if (tabId === 'analytics' && perms.includes('dashboard')) return 'full';
    if (tabId === 'dashboard' && perms.includes('analytics')) return 'full';
    return 'hidden';
  }

  const role = user.role ?? '';
  if (['Super Admin', 'Admin'].includes(role)) return 'full';
  if (role === 'Manager') return tabId === 'settings' ? 'view' : 'full';
  if (role === 'Staff') return 'view';
  if (role === 'Vendor')
    return ['analytics', 'dashboard', 'distribution', 'finance'].includes(tabId) ? 'view' : 'hidden';
  return 'hidden';
}
