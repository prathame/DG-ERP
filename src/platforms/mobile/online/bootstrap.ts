import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNativeApp, installNativeApiFetch } from '../../shared/apiBase';
import { initNetworkMonitor } from '../offline/network';
import { startMobileHeartbeat } from './mobileSync';
import { isMobileClient } from './isMobileClient';

/** Bootstrap Capacitor (mobile · online-capable): API fetch patch, network, status bar, heartbeat. */
export async function initCapacitorApp(): Promise<void> {
  installNativeApiFetch();
  await initNetworkMonitor();

  if (isMobileClient()) startMobileHeartbeat();

  if (!isNativeApp()) return;

  document.documentElement.classList.add('native-app');

  try {
    await StatusBar.setStyle({ style: Style.Light });
    // Overlay so CSS safe-area insets control layout (notch / Dynamic Island)
    await StatusBar.setOverlaysWebView({ overlay: true }).catch(() => undefined);
    await StatusBar.setBackgroundColor({ color: '#F27D26' }).catch(() => undefined);
  } catch { /* web / unsupported */ }

  try {
    await SplashScreen.hide();
  } catch { /* ignore */ }

  try {
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        window.history.back();
      } else {
        void App.exitApp();
      }
    });
  } catch { /* ignore */ }
}
