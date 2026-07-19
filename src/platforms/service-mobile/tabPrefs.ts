import { session } from '../../lib/session';

/** Per-device/user preference: show Accounts in nav (Offline Mobile Settings). */
const ACCOUNTS_VISIBLE_KEY = 'dg_accounts_visible';

function storageScope(): string {
  return `${session.getTenantId() || 't'}:${session.getUser()?.id || 'u'}`;
}

export function accountsVisibleStorageKey(scope = storageScope()): string {
  return `${ACCOUNTS_VISIBLE_KEY}:${scope}`;
}

/** Default on — hidden only when explicitly set to `'0'`. */
export function getAccountsTabVisiblePref(): boolean {
  try {
    return localStorage.getItem(accountsVisibleStorageKey()) !== '0';
  } catch {
    return true;
  }
}

export function setAccountsTabVisiblePref(visible: boolean): void {
  localStorage.setItem(accountsVisibleStorageKey(), visible ? '1' : '0');
}
