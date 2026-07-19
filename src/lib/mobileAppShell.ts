/**
 * True for phone Capacitor shells: Offline Service Mobile OR Online Service Cloud Cap.
 * Use for UX that should appear on any installed mobile app (e.g. bug report).
 */
import { isServiceMobileMode } from '../platforms/service-mobile/mode';
import { isServiceCloudMobile } from '../platforms/service-cloud/mode';

export function isMobileAppShell(): boolean {
  try {
    return isServiceMobileMode() || isServiceCloudMobile();
  } catch {
    return false;
  }
}
