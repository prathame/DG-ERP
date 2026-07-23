/**
 * Desktop glass UI (Electron + browser desktop) — never Cap / service-phone shells.
 */
import { isMobileAppShell } from './mobileAppShell';
import { isServicePhoneUx } from '../platforms/service-cloud/mode';

export function isDesktopGlassUi(businessType?: string | null): boolean {
  try {
    if (isMobileAppShell()) return false;
    if (isServicePhoneUx(businessType)) return false;
    return true;
  } catch {
    return false;
  }
}
