/**
 * Stable per-install device id for single-device login binding.
 * Shared storage key with service-cloud seats when present.
 */
import { isBakedServiceMobile, isBakedServicePhone } from '../platforms/mobileMode';

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

/**
 * Installed PWA (Add to Home Screen / installed web app) on any OS/browser.
 * Only `display-mode: standalone` / iOS `navigator.standalone` — not fullscreen
 * or minimal-ui (those false-positived normal browser tabs and hid marketing `/`).
 */
export function isPwaStandalone(): boolean {
  try {
    if (typeof window === 'undefined') return false;
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone === true) return true;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches) {
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

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
  // Home-screen / installed PWA counts as mobile for device binding.
  if (isPwaStandalone()) return 'mobile';
  return 'web';
}

/**
 * True when running inside Electron, Capacitor, Cap Vite bake, or installed PWA.
 * Plain Safari/Chrome tabs are also allowed for cloud ERP (iPhone has no App Store build).
 */
export function isErpAppShell(): boolean {
  // Cap Vite bakes — same shells as native WebView (local preview / sideload QA).
  if (isBakedServiceMobile() || isBakedServicePhone()) return true;
  if (isPwaStandalone()) return true;
  return detectClientPlatform() !== 'web';
}

/** Header identifying native/desktop/PWA shells (not set in plain browser tabs). */
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
  if (isPwaStandalone()) return 'pwa';
  return null;
}
