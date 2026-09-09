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

export const DEFAULT_DESKTOP_MAC_ARM64_URL =
  'https://github.com/prathame/DG-ERP/releases/download/dhandho-desktop/dhandho-desktop-mac-arm64.dmg';

export const DEFAULT_DESKTOP_MAC_X64_URL =
  'https://github.com/prathame/DG-ERP/releases/download/dhandho-desktop/dhandho-desktop-mac-x64.dmg';

export const DEFAULT_DESKTOP_WIN_URL =
  'https://github.com/prathame/DG-ERP/releases/download/dhandho-desktop/dhandho-desktop-win-x64.exe';

/** Optional public TestFlight invite / app link — set via SA when TestFlight is live. */
export const DEFAULT_SERVICE_MOBILE_TESTFLIGHT_URL: string | null = null;
