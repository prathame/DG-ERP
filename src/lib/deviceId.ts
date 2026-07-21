/**
 * Stable per-install device id for single-device login binding.
 * Shared storage key with service-cloud seats when present.
 */
const STORAGE_KEY = 'dg_sc_device_id';

function toHex32(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
  } catch {
    /* private mode */
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const id = toHex32(bytes);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

export type ClientPlatform = 'desktop' | 'mobile' | 'web';

/** Best-effort client kind for session metadata. */
export function detectClientPlatform(): ClientPlatform {
  try {
    const ea = (window as unknown as { electronAPI?: { isElectron?: boolean; deploymentMode?: string } }).electronAPI;
    if (ea?.isElectron || ea?.deploymentMode === 'cloud' || ea?.deploymentMode === 'onprem') {
      return 'desktop';
    }
  } catch {
    /* ignore */
  }
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return 'mobile';
  } catch {
    /* ignore */
  }
  try {
    if (new URLSearchParams(window.location.search).get('desktop') === '1') return 'desktop';
  } catch {
    /* ignore */
  }
  return 'web';
}

/** True when running inside Electron or Capacitor (or ?desktop=1 local test). */
export function isErpAppShell(): boolean {
  return detectClientPlatform() !== 'web';
}

/** Header identifying native/desktop shells (not set in plain browser). */
export function appClientHeader(): string | null {
  try {
    const ea = (window as unknown as { electronAPI?: { isElectron?: boolean; deploymentMode?: string } }).electronAPI;
    if (ea?.deploymentMode === 'onprem') return 'electron-onprem';
    if (ea?.isElectron || ea?.deploymentMode === 'cloud') return 'electron-cloud';
  } catch {
    /* ignore */
  }
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return 'capacitor';
  } catch {
    /* ignore */
  }
  if (detectClientPlatform() === 'desktop') return 'electron-cloud';
  return null;
}
