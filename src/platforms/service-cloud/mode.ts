import { isServiceMobileMode } from '../service-mobile/mode';

type ElectronBridge = {
  isElectron?: boolean;
  deploymentMode?: string;
};

function electronAPI(): ElectronBridge | undefined {
  return (window as unknown as { electronAPI?: ElectronBridge }).electronAPI;
}

/** Cloud Electron shell (or ?desktop=1 during local testing). */
export function isServiceCloudDesktop(): boolean {
  const ea = electronAPI();
  if (ea?.deploymentMode === 'onprem') return false;
  if (ea?.deploymentMode === 'cloud') return true;
  return new URLSearchParams(window.location.search).get('desktop') === '1';
}

/** Online Capacitor (not the offline Service Mobile build). */
export function isServiceCloudMobile(): boolean {
  if (isServiceMobileMode()) return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
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
