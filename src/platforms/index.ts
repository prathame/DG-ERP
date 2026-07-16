/**
 * Platform bootstrap entry.
 * Call once from `main.tsx` before rendering the app.
 */
export { initCapacitorApp as initPlatform } from './mobile/online';
export { initCapacitorApp } from './mobile/online';
export * from './shared';
export { OfflineBanner } from './mobile/offline';
export { OnlineStatus } from './desktop/offline';
