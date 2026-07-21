/**
 * True for phone Capacitor shells: Offline Service Mobile OR Online Service Cloud Cap,
 * or the unified shell before/after the one-time mode picker.
 */
import { isServiceMobileMode } from '../platforms/service-mobile/mode';
import { isServiceCloudDesktop, isServiceCloudMobile } from '../platforms/service-cloud/mode';
import { isBakedServicePhone, isNativeCapacitorShell } from '../platforms/mobileMode';

export function isMobileAppShell(): boolean {
  try {
    if (isNativeCapacitorShell() || isBakedServicePhone()) return true;
    return isServiceMobileMode() || isServiceCloudMobile();
  } catch {
    return false;
  }
}

/** Cloud or Offline Electron (includes `?desktop=1` local testing). */
export function isElectronAppShell(): boolean {
  try {
    const ea = (window as unknown as { electronAPI?: { isElectron?: boolean } }).electronAPI;
    if (ea?.isElectron) return true;
    return isServiceCloudDesktop();
  } catch {
    return false;
  }
}

/** Cap phone shells + Electron — show Share bug report (browser web stays without it). */
export function offersBugReportShare(): boolean {
  return isMobileAppShell() || isElectronAppShell();
}
