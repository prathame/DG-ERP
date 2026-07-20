import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Unified Dhandho Service phone shell (Android + iOS).
 * First launch: Online (cloud) or Offline (on-device) — one-time, separate auth/data.
 *
 * Build: npm run build:service-phone && npx cap sync
 */
const config: CapacitorConfig = {
  appId: 'in.dhandho.service',
  appName: 'Dhandho Service',
  webDir: 'dist-service-phone',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    Preferences: {},
    /** Inject --safe-area-inset-* so headers clear status bar / cutouts on Android. */
    SystemBars: {
      insetsHandling: 'css',
      // LIGHT = dark status icons (white app header)
      style: 'LIGHT',
      hidden: false,
    },
    LocalNotifications: {
      // Status-bar glyph must be a white silhouette drawable (not adaptive mipmap).
      // Omit smallIcon → Capacitor default; large shade icon still uses the app icon.
      iconColor: '#E87722',
    },
  },
};

export default config;
