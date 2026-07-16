export { initCapacitorApp } from './bootstrap';
export { MobileOnboarding } from './MobileOnboarding';
export { isMobileClient } from './isMobileClient';
export {
  getSavedCompanySlug,
  saveCompanySlug,
  clearSavedCompanySlug,
} from './companyStorage';
export {
  startMobileHeartbeat,
  mobileHeartbeat,
  getMobileDeviceId,
} from './mobileSync';
