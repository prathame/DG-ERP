/**
 * True for phone Capacitor shells: Offline Service Mobile OR Online Service Cloud Cap,
 * or the unified shell before/after the one-time mode picker.
 */
import { isServiceMobileMode } from '../platforms/service-mobile/mode';
import { isServiceCloudMobile } from '../platforms/service-cloud/mode';
import { isBakedServicePhone, isNativeCapacitorShell } from '../platforms/mobileMode';

export function isMobileAppShell(): boolean {
  try {
    if (isNativeCapacitorShell() || isBakedServicePhone()) return true;
    return isServiceMobileMode() || isServiceCloudMobile();
  } catch {
    return false;
  }
}
