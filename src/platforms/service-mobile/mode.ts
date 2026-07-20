import { getPhoneMode, isBakedServiceMobile, isNativeCapacitorShell } from '../mobileMode';

/**
 * Offline Service Mobile stack is active.
 * - Legacy Cap/Vite bake: VITE_DEPLOYMENT_MODE=service-mobile
 * - Unified Cap shell: native + one-time latch === offline
 */
export function isServiceMobileMode(): boolean {
  if (isBakedServiceMobile()) return true;
  if (!isNativeCapacitorShell()) return false;
  return getPhoneMode() === 'offline';
}

export function serviceMobileAppVersion(): string {
  return (import.meta.env.VITE_APP_VERSION as string | undefined) || '0.1.0';
}
