import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Service Mobile (offline phone) — Capacitor shell.
 * Built with: npm run build:service-mobile && npx cap sync
 */
const config: CapacitorConfig = {
  appId: 'in.dhandho.service',
  appName: 'Dhandho Service',
  webDir: 'dist-service-mobile',
  server: {
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    Preferences: {},
  },
};

export default config;
