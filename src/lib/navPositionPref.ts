import { session } from './session';

/** Where the desktop menu sits. Phones keep a left/right drawer + bottom bar. */
export type NavPosition = 'left' | 'right' | 'top' | 'bottom';

export const NAV_POSITIONS: NavPosition[] = ['left', 'right', 'top', 'bottom'];

const PREFIX = 'dg_nav_position';

export const NAV_POSITION_PREF_CHANGED_EVENT = 'dg-nav-position-pref-changed';

function storageScope(): string {
  return `${session.getTenantId() || 't'}:${session.getUser()?.id || 'u'}`;
}

export function navPositionStorageKey(scope = storageScope()): string {
  return `${PREFIX}:${scope}`;
}

export function isNavPosition(v: string | null | undefined): v is NavPosition {
  return v === 'left' || v === 'right' || v === 'top' || v === 'bottom';
}

export function isNavHorizontal(pos: NavPosition): boolean {
  return pos === 'top' || pos === 'bottom';
}

/** Default left — same as the current sidebar. */
export function getNavPositionPref(): NavPosition {
  try {
    const v = localStorage.getItem(navPositionStorageKey());
    return isNavPosition(v) ? v : 'left';
  } catch {
    return 'left';
  }
}

export function setNavPositionPref(position: NavPosition): void {
  try {
    localStorage.setItem(navPositionStorageKey(), position);
  } catch {
    // best-effort
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(NAV_POSITION_PREF_CHANGED_EVENT, { detail: { position } }));
  }
}

/**
 * Tell portaled chrome (chat, toasts, full-screen overlays) how much room the
 * desktop menu is using. Phone CSS ignores these — the drawer already overlays.
 */
export function applyNavChrome(pos: NavPosition, collapsed: boolean): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  html.dataset.navPos = pos;
  html.dataset.navCollapsed = collapsed ? '1' : '0';
  html.style.setProperty('--dg-nav-side', collapsed ? '4rem' : '16rem');
  const bar = isNavHorizontal(pos) ? (collapsed ? '3.5rem' : '4rem') : '4rem';
  html.style.setProperty('--dg-nav-bar', bar);
}
