export { isServiceMobileMode, serviceMobileAppVersion } from './mode';
export { getAccountsTabVisiblePref, setAccountsTabVisiblePref } from './tabPrefs';
export { getOrCreateDeviceId } from './deviceId';
export { loadLicense, saveLicense, clearLicense, type ServiceMobileLicense } from './licenseStore';
export {
  activateLicense,
  heartbeat,
  markApplied,
  markNotificationsDelivered,
  type ServiceMobileActivateResult,
} from './cloud';
export { ServiceMobileOnboarding } from './ServiceMobileOnboarding';
export { runServiceMobileSync, startServiceMobileHeartbeat, stopServiceMobileHeartbeat } from './sync';
export {
  getSyncState,
  getServiceMobileConnectionStatus,
  subscribeSyncState,
  patchSyncState,
  type SyncConnectionStatus,
} from './syncState';
export { serviceMobileOnlineStatusAdapter } from './serviceMobileOnlineStatusAdapter';
export { restoreFromLocalBackupFile, restoreSameTenantBackup } from './restore';
export {
  exportLocalBackupNow,
  loadLocalBackupSettings,
  saveLocalBackupSettings,
  restoreFromLocalBackupJson,
  type LocalBackupSettings,
  type BackupFrequency,
} from './localBackup';
export { getLocalDb } from './local/db';
export { isLocalProvisioned, getLocalSlug, provisionLocalTenant } from './local/provision';
export { ensureElectricianDemoSeeded, isElectricianDemoSeeded } from './local/seedElectricianDemo';
export { ELECTRICIAN_DEMO_CLIENTS, ELECTRICIAN_DEMO_PRICE_ITEMS } from './local/electricianDemoData';
export { handleLocalApiRequest } from './local/router';
