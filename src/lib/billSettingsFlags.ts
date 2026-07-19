import { isServiceMobileMode } from '../platforms/service-mobile/mode';

/**
 * HSN/SAC visibility from bill settings.
 * Offline (service-mobile): opt-in — missing/false → hidden.
 * Cloud / manufacturer: opt-out — missing/true → shown (historical default).
 */
export function isShowHsnSacEnabled(settings?: { showHsnSac?: boolean } | null): boolean {
  if (isServiceMobileMode()) return settings?.showHsnSac === true;
  return settings?.showHsnSac !== false;
}
