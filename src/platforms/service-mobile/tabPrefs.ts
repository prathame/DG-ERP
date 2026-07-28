import { getTabVisiblePref, setTabVisiblePref, tabVisibleStorageKey } from '../../lib/tabVisibilityPrefs';

/** Per-device/user preference: show Accounts in nav (Offline Mobile Settings). */
export function accountsVisibleStorageKey(scope?: string): string {
  return tabVisibleStorageKey('accounts', scope);
}

/** Default on — hidden only when explicitly set to `'0'`. */
export function getAccountsTabVisiblePref(): boolean {
  return getTabVisiblePref('accounts');
}

export function setAccountsTabVisiblePref(visible: boolean): void {
  setTabVisiblePref('accounts', visible);
}
