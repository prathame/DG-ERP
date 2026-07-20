/**
 * Evergreen download URLs for testing builds.
 * Unified Cap shell: one Android + one iOS (Online/Offline chosen in-app once).
 * Unified Desktop: Mac + Windows (Online/Offline chosen in-app once).
 * Super Admin can override via platform_config (Analytics → Version Control).
 */
export const DEFAULT_SERVICE_MOBILE_APP_URL =
  'https://github.com/prathame/DG-ERP/releases/download/dhandho-mobile/dhandho-mobile-debug.apk';

export const DEFAULT_SERVICE_MOBILE_IOS_URL =
  'https://github.com/prathame/DG-ERP/releases/download/dhandho-mobile/dhandho-mobile-debug.app.zip';

/** @deprecated Same unified APK as DEFAULT_SERVICE_MOBILE_* — kept for SA/API backward compat. */
export const DEFAULT_SERVICE_CLOUD_APP_URL = DEFAULT_SERVICE_MOBILE_APP_URL;

/** @deprecated Same unified iOS asset as DEFAULT_SERVICE_MOBILE_IOS_URL. */
export const DEFAULT_SERVICE_CLOUD_IOS_URL = DEFAULT_SERVICE_MOBILE_IOS_URL;

export const DEFAULT_DESKTOP_MAC_ARM64_URL =
  'https://github.com/prathame/DG-ERP/releases/download/dhandho-desktop/dhandho-desktop-mac-arm64.dmg';

export const DEFAULT_DESKTOP_MAC_X64_URL =
  'https://github.com/prathame/DG-ERP/releases/download/dhandho-desktop/dhandho-desktop-mac-x64.dmg';

export const DEFAULT_DESKTOP_WIN_URL =
  'https://github.com/prathame/DG-ERP/releases/download/dhandho-desktop/dhandho-desktop-win-x64.exe';

/** @deprecated Prefer desktop_mac_* / desktop_win_url. Kept for SA/API backward compat. */
export const DEFAULT_DESKTOP_APP_URL = DEFAULT_DESKTOP_MAC_ARM64_URL;
