import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Service Cloud seats — online Capacitor shell (talks to cloud API).
 * Distinct from offline Service Mobile (`capacitor.config.ts` + dist-service-mobile).
 *
 * Build + sync (temporary swap; restores capacitor.config.ts after):
 *   npm run cap:sync:cloud
 *
 * Do not mix with Offline Mobile APK / DG-SM licenses.
 */
const config: CapacitorConfig = {
  appId: 'in.dhandho.servicecloud',
  appName: 'Dhando Service Cloud',
  webDir: 'dist-service-cloud',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    Preferences: {},
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
      hidden: false,
    },
  },
};

export default config;
