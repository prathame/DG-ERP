/**
 * Capacitor Android system back:
 * 1) Close print overlay / registered modals & details
 * 2) At tab root → toast + second press within ~2s minimizes (or exits)
 * Tab switches use replaceState on native so history does not accumulate.
 */

import { consumeAndroidBack } from './androidBackStack';

const EXIT_WINDOW_MS = 2000;

let lastRootBackAt = 0;

const PRINT_OVERLAY_ID = 'dg-print-overlay';

export type AndroidBackToast = (message: string, type?: 'info' | 'success' | 'error') => void;

/** Pure decision helper for unit tests. */
export function shouldExitOnRootBack(now: number, lastAt: number, windowMs = EXIT_WINDOW_MS): boolean {
  return lastAt > 0 && now - lastAt < windowMs;
}

function dismissPrintOverlayIfOpen(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.getElementById(PRINT_OVERLAY_ID);
  if (!el) return false;
  el.remove();
  return true;
}

export async function initAndroidBackButton(toast: AndroidBackToast): Promise<() => void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
      return () => {};
    }
    const { App } = await import('@capacitor/app');

    const sub = await App.addListener('backButton', () => {
      if (dismissPrintOverlayIfOpen()) {
        lastRootBackAt = 0;
        return;
      }

      if (consumeAndroidBack()) {
        lastRootBackAt = 0;
        return;
      }

      const now = Date.now();
      if (shouldExitOnRootBack(now, lastRootBackAt)) {
        lastRootBackAt = 0;
        void App.minimizeApp().catch(() => {
          void App.exitApp();
        });
        return;
      }

      lastRootBackAt = now;
      toast('Press back again to exit', 'info');
    });

    return () => {
      void sub.remove();
    };
  } catch {
    return () => {};
  }
}

/** @internal vitest */
export function __resetAndroidBackExitTimerForTests(): void {
  lastRootBackAt = 0;
}
