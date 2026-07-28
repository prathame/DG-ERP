import { session } from './session';

/**
 * Per-device/user preference: show/hide a nav tab in the sidebar (layered on top of
 * Super Admin tab_config — see shared/tabPresets.ts). Scoped to tenant+user so each
 * teammate keeps their own device-local nav layout.
 */
const TAB_VISIBLE_PREFIX = 'dg_tab_visible';
/** Predates the generic prefix — kept so existing Accounts prefs keep working. */
const LEGACY_ACCOUNTS_KEY = 'dg_accounts_visible';

/** Fired whenever a tab visibility pref changes, so the nav (App.tsx) can re-render live. */
export const TAB_VISIBLE_PREF_CHANGED_EVENT = 'dg-tab-visible-pref-changed';

function storageScope(): string {
  return `${session.getTenantId() || 't'}:${session.getUser()?.id || 'u'}`;
}

export function tabVisibleStorageKey(tabId: string, scope = storageScope()): string {
  const base = tabId === 'accounts' ? LEGACY_ACCOUNTS_KEY : `${TAB_VISIBLE_PREFIX}:${tabId}`;
  return `${base}:${scope}`;
}

/** Default on — hidden only when explicitly set to `'0'`. */
export function getTabVisiblePref(tabId: string): boolean {
  try {
    return localStorage.getItem(tabVisibleStorageKey(tabId)) !== '0';
  } catch {
    return true;
  }
}

export function setTabVisiblePref(tabId: string, visible: boolean): void {
  try {
    localStorage.setItem(tabVisibleStorageKey(tabId), visible ? '1' : '0');
  } catch {
    // best-effort; ignore storage errors (private mode, quota, etc.)
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TAB_VISIBLE_PREF_CHANGED_EVENT, { detail: { tabId, visible } }));
  }
}
