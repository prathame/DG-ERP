/**
 * One-time Online/Offline latch for the unified Capacitor phone shell.
 * Stores mode only (no secrets). Once set, cannot be overwritten in-app.
 */

export type PhoneMode = 'offline' | 'online';

/** Mode latch — not a credential. */
export const PHONE_MODE_STORAGE_KEY = 'dhandho.phoneMode';

let cachedMode: PhoneMode | null | undefined;

function readLocalStorage(): PhoneMode | null {
  try {
    const v = localStorage.getItem(PHONE_MODE_STORAGE_KEY);
    if (v === 'offline' || v === 'online') return v;
  } catch {
    /* ignore */
  }
  return null;
}

function writeLocalStorage(mode: PhoneMode): void {
  try {
    localStorage.setItem(PHONE_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/** Sync read (hydrated from localStorage). */
export function getPhoneMode(): PhoneMode | null {
  if (cachedMode !== undefined) return cachedMode;
  cachedMode = readLocalStorage();
  return cachedMode;
}

export function isPhoneModeChosen(): boolean {
  return getPhoneMode() != null;
}

/**
 * Set mode once. Returns false if already set to a different value
 * (or same value — still "already chosen", returns true if matches).
 */
export function setPhoneModeOnce(mode: PhoneMode): { ok: boolean; mode: PhoneMode | null; reason?: string } {
  const existing = getPhoneMode();
  if (existing != null) {
    if (existing === mode) return { ok: true, mode: existing };
    return { ok: false, mode: existing, reason: 'Phone mode already set; reinstall to change' };
  }
  writeLocalStorage(mode);
  cachedMode = mode;
  void persistPreferences(mode);
  return { ok: true, mode };
}

/** Test helper — clears latch. Not exposed in production UI. */
export function __resetPhoneModeForTests(): void {
  cachedMode = undefined;
  try {
    if (typeof localStorage !== 'undefined' && typeof localStorage.removeItem === 'function') {
      localStorage.removeItem(PHONE_MODE_STORAGE_KEY);
    }
  } catch {
    /* ignore */
  }
}

async function persistPreferences(mode: PhoneMode): Promise<void> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    await Preferences.set({ key: PHONE_MODE_STORAGE_KEY, value: mode });
  } catch {
    /* Preferences unavailable (web) */
  }
}

/** Prefer Preferences when present, then localStorage. */
export async function hydratePhoneMode(): Promise<PhoneMode | null> {
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { value } = await Preferences.get({ key: PHONE_MODE_STORAGE_KEY });
    if (value === 'offline' || value === 'online') {
      writeLocalStorage(value);
      cachedMode = value;
      return value;
    }
  } catch {
    /* fall through */
  }
  const fromLs = readLocalStorage();
  cachedMode = fromLs;
  return fromLs;
}

export function isNativeCapacitorShell(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return Boolean(cap?.isNativePlatform?.());
  } catch {
    return false;
  }
}

/** Vite bake: legacy offline-only Cap build. */
export function isBakedServiceMobile(): boolean {
  try {
    return (import.meta.env.VITE_DEPLOYMENT_MODE as string | undefined) === 'service-mobile';
  } catch {
    return false;
  }
}

/** Vite bake: unified phone shell (picker at first launch). */
export function isBakedServicePhone(): boolean {
  try {
    return (import.meta.env.VITE_DEPLOYMENT_MODE as string | undefined) === 'service-phone';
  } catch {
    return false;
  }
}

/**
 * True when Cap (or unified service-phone bake) still needs the one-time picker.
 * Legacy service-mobile bake never shows the picker.
 */
export function needsPhoneModePicker(): boolean {
  if (isBakedServiceMobile()) return false;
  if (!isNativeCapacitorShell() && !isBakedServicePhone()) return false;
  return getPhoneMode() == null;
}
