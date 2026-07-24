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

/** True when this client participates in service cloud device seats + session lock. */
export function isServiceCloudClient(): boolean {
  return isServiceCloudDesktop() || isServiceCloudMobile();
}

export function serviceCloudClientKind(): 'desktop' | 'mobile' | null {
  if (isServiceCloudDesktop()) return 'desktop';
  if (isServiceCloudMobile()) return 'mobile';
  return null;
}

/** Header value for API calls from enrolled clients. */
export function serviceCloudClientHeader(): string | null {
  if (isServiceCloudDesktop()) return 'electron-cloud';
  if (isServiceCloudMobile()) return 'capacitor-cloud';
  return null;
}

/**
 * Shared service phone presentation (Emergent shell, Price List as catalog, etc.).
 * True for Offline Mobile OR online Service Cloud Capacitor with businessType=service.
 * Never use for PGlite / Sync / license / demo seed — those stay Offline-only.
 */
export function isServicePhoneUx(businessType?: string | null): boolean {
  if (isServiceMobileMode()) return true;
  if (businessType !== 'service') return false;
  return isServiceCloudMobile();
}
