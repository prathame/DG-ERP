/**
 * Mobile heartbeat — mirrors on-prem: register device, receive force-sync + version policy.
 */
import { resolveApiUrl, isNativeApp } from '../../shared/apiBase';
import { session } from '../../../lib/session';
import { getSavedCompanySlug } from './companyStorage';
import { cacheClear } from '../offline/cache';
import { isMobileClient } from './isMobileClient';

const DEVICE_KEY = 'dg_mobile_device_id';
const LAST_FORCE_KEY = 'dg_mobile_last_force_sync';
const APP_VERSION =
  (import.meta.env.VITE_APP_VERSION as string | undefined)?.trim() || '2.2.0';
const HEARTBEAT_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;

export function getMobileDeviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    id = `dev_${hex}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

function platformLabel(): string {
  if (!isNativeApp()) return 'web-mobile';
  const ua = navigator.userAgent || '';
  if (/android/i.test(ua)) return 'android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  return 'native';
}

async function applyForceSync(forceSyncAt: string) {
  const last = localStorage.getItem(LAST_FORCE_KEY);
  if (last && new Date(last).getTime() >= new Date(forceSyncAt).getTime()) return;
  cacheClear();
  localStorage.setItem(LAST_FORCE_KEY, forceSyncAt);
  // Soft reload so tenant tabConfig / feature flags refresh
  window.location.reload();
}

export async function mobileHeartbeat(): Promise<void> {
  if (!isMobileClient()) return;
  const slug = getSavedCompanySlug() || session.getSlug();
  const token = session.getToken();
  const body = {
    deviceId: getMobileDeviceId(),
    platform: platformLabel(),
    appVersion: APP_VERSION,
    slug: slug || undefined,
    tenantId: session.getTenantId() || undefined,
  };
  try {
    const res = await fetch(resolveApiUrl('/api/mobile/heartbeat'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return;
    const data = await res.json() as {
      forceSyncAt?: string | null;
      forceUpdate?: boolean;
      updateAvailable?: boolean;
      latestVersion?: string | null;
    };
    if (data.forceSyncAt) await applyForceSync(data.forceSyncAt);
    if (data.forceUpdate) {
      window.dispatchEvent(new CustomEvent('dg-mobile-force-update', { detail: data }));
    } else if (data.updateAvailable) {
      window.dispatchEvent(new CustomEvent('dg-mobile-update-available', { detail: data }));
    }
  } catch { /* offline */ }
}

export function startMobileHeartbeat(): void {
  if (!isMobileClient()) return;
  void mobileHeartbeat();
  if (timer) clearInterval(timer);
  timer = setInterval(() => { void mobileHeartbeat(); }, HEARTBEAT_MS);
}

export function stopMobileHeartbeat(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
