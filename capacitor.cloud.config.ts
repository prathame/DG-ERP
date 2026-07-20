import type { CapacitorConfig } from '@capacitor/cli';

/**
 * @deprecated Use unified `capacitor.config.ts` (service-phone) + first-launch Online/Offline picker.
 * Kept for transitional local builds only — CI publishes a single Cap product.
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
    SystemBars: {
      insetsHandling: 'css',
      style: 'LIGHT',
      hidden: false,
    },
  },
};

export default config;
