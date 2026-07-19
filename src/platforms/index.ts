/**
 * Platform bootstrap entry.
 * Call once from `main.tsx` before rendering the app.
 */
export async function initPlatform(): Promise<void> {
  try {
    const { Capacitor, SystemBars, SystemBarsStyle } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;

    document.documentElement.classList.add('dg-capacitor-native');

    try {
      await SystemBars.setStyle({ style: SystemBarsStyle.Light });
    } catch {
      /* older runtime — config plugin still applies */
    }

    // If SystemBars never injected insets (older WebView path), set a status-bar floor.
    const applyFallbackInsets = () => {
      const root = document.documentElement;
      const top = getComputedStyle(root).getPropertyValue('--safe-area-inset-top').trim();
      if (!top || top === '0px' || top === '0') {
        root.style.setProperty('--safe-area-inset-top', '28px');
      }
      const bottom = getComputedStyle(root).getPropertyValue('--safe-area-inset-bottom').trim();
      if (!bottom || bottom === '0px' || bottom === '0') {
        root.style.setProperty('--safe-area-inset-bottom', '16px');
      }
    };
    requestAnimationFrame(() => setTimeout(applyFallbackInsets, 50));
  } catch {
    /* web / Electron */
  }
}

export * from './shared';
export { OnlineStatus } from './desktop/offline';
