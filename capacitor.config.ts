import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.dhandho.mobile',
  appName: 'Dhandho',
  webDir: 'dist-mobile',
  server: {
    // Production: load bundled web assets; API calls go to VITE_API_ORIGIN / cloud.
    androidScheme: 'https',
    iosScheme: 'capacitor',
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      backgroundColor: '#F27D26',
      showSpinner: false,
    },
    StatusBar: {
      style: 'LIGHT',
      backgroundColor: '#F27D26',
    },
  },
};

export default config;
