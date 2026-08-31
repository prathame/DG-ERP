import { isServiceMobileMode } from '../service-mobile/mode';
import { getPhoneMode, isBakedServiceMobile, isNativeCapacitorShell } from '../mobileMode';

type ElectronBridge = {
  isElectron?: boolean;
  deploymentMode?: string;
};

function electronAPI(): ElectronBridge | undefined {
  return (window as unknown as { electronAPI?: ElectronBridge }).electronAPI;
}

/** Cloud Electron shell (requires preload bridge — not a browser query flag). */
export function isServiceCloudDesktop(): boolean {
  const ea = electronAPI();
  if (ea?.deploymentMode === 'onprem') return false;
  return ea?.deploymentMode === 'cloud' || ea?.isElectron === true;
}

/**
 * Online Capacitor stack is active.
 * Requires native Cap + one-time latch === online.
 * Never true for baked offline-only builds or when Offline mode is latched.
 */
export function isServiceCloudMobile(): boolean {
  if (isBakedServiceMobile()) return false;
  if (isServiceMobileMode()) return false;
  if (!isNativeCapacitorShell()) return false;
  return getPhoneMode() === 'online';
}

/** Plain browser (Chrome/Safari/PWA tab) — not Electron, Cap, or Offline Mobile. */
export function isServiceCloudBrowser(): boolean {
  if (typeof window === 'undefined') return false;
  if (isServiceCloudDesktop() || isServiceCloudMobile()) return false;
  if (isBakedServiceMobile() || isServiceMobileMode()) return false;
  if (isNativeCapacitorShell()) return false;
  const ea = electronAPI();
  if (ea?.deploymentMode === 'onprem' || ea?.isElectron) return false;
  return true;
}

/** True when this client participates in service cloud device seats + session lock. */
export function isServiceCloudClient(): boolean {
  return isServiceCloudDesktop() || isServiceCloudMobile() || isServiceCloudBrowser();
}

export function serviceCloudClientKind(): 'desktop' | 'mobile' | 'web' | null {
  if (isServiceCloudDesktop()) return 'desktop';
  if (isServiceCloudMobile()) return 'mobile';
  if (isServiceCloudBrowser()) return 'web';
  return null;
}

/** Header value for API calls from enrolled clients. */
export function serviceCloudClientHeader(): string | null {
  if (isServiceCloudDesktop()) return 'electron-cloud';
  if (isServiceCloudMobile()) return 'capacitor-cloud';
  if (isServiceCloudBrowser()) return 'browser';
  return null;
}

/**
 * Shared service phone presentation (Emergent shell, bottom nav, Cap glass).
 * True for Offline Mobile OR online Service Cloud Capacitor with businessType=service.
 * Never use for PGlite / Sync / license / demo seed — those stay Offline-only.
 * Never use for product IA that must match on desktop/browser — use isServiceProductUx.
 */
export function isServicePhoneUx(businessType?: string | null): boolean {
  if (isServiceMobileMode()) return true;
  if (businessType !== 'service') return false;
  return isServiceCloudMobile();
}

/**
 * Service business product UX — Cap + desktop Electron + browser.
 * Catalog via Prices, GST opt-in, invoice/quote labels, analytics net-in, search → Price List.
 * Manufacturer / dealer / hotel: always false. Does not change phone shell chrome.
 */
export function isServiceProductUx(businessType?: string | null): boolean {
  return businessType === 'service';
}
