/**
 * Evergreen download URLs for testing builds.
 * Rebuild/overwrite the same GitHub release asset; keep the link stable.
 * Super Admin can override via platform_config (Analytics → Version Control).
 */
export const DEFAULT_SERVICE_MOBILE_APP_URL =
  'https://github.com/prathame/DG-ERP/releases/download/offline-mobile/offline-mobile-service-debug.apk';

/** Online Service Cloud Cap APK (separate product from Offline Mobile). */
export const DEFAULT_SERVICE_CLOUD_APP_URL =
  'https://github.com/prathame/DG-ERP/releases/download/service-cloud/service-cloud-online-debug.apk';
