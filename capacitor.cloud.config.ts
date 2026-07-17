import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Service cloud seats — online Capacitor shell (talks to cloud API).
 * Distinct from offline Service Mobile (`capacitor.config.ts` + dist-service-mobile).
 *
 * Build web: npm run build
 * Sync: npx cap sync --config capacitor.cloud.config.ts
 * (Requires a dedicated Android/iOS project or copy of android/ios pointed at webDir `dist`.)
 */
const config: CapacitorConfig = {
  appId: 'in.dhandho.servicecloud',
  appName: 'Dhandho Service Cloud',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
};

export default config;
