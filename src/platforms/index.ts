/**
 * Platform bootstrap entry.
 * Call once from `main.tsx` before rendering the app.
 */
export async function initPlatform(): Promise<void> {
  /* web + Electron only — Capacitor mobile removed */
}

export * from './shared';
export { OnlineStatus } from './desktop/offline';
