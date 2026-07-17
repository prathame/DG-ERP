import { isNativeApp } from '../../shared/apiBase';

/** True in Capacitor, or when building/running with VITE_MOBILE=1. */
export function isMobileClient(): boolean {
  if (isNativeApp()) return true;
  try {
    return import.meta.env.VITE_MOBILE === '1' || import.meta.env.MODE === 'mobile';
  } catch {
    return false;
  }
}
