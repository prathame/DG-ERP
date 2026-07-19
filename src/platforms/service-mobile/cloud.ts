/**
 * Cloud API client for Service Mobile license / sync / backup.
 * Business ERP traffic never goes here — only activate, heartbeat, backup.
 */
import { clientLogger } from '../../lib/logger';
import { normalizeActivateResult, type ServiceMobileActivateResult } from './activateResult';

export type { ServiceMobileActivateResult };

const DEFAULT_CLOUD_ORIGIN = 'https://dg-erp.onrender.com';

function cloudOrigin(): string {
  const fromEnv = (import.meta as { env?: { VITE_API_ORIGIN?: string } }).env?.VITE_API_ORIGIN;
  /**
   * Local Vite QA: call same-origin `/api/...` so vite.config proxy can forward to Render.
   * Direct browser calls to VITE_API_ORIGIN fail CORS (Render allows Capacitor origins, not :3000).
   * Cap/APK builds are production (`import.meta.env.DEV` false) and still use VITE_API_ORIGIN.
   */
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      return '';
    }
  }
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  // Native WebView origin is https://localhost — that is NOT the cloud API.
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return DEFAULT_CLOUD_ORIGIN;
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (origin === 'https://localhost' || origin === 'http://localhost' || origin.startsWith('capacitor:')) {
      return DEFAULT_CLOUD_ORIGIN;
    }
    return origin;
  }
  return DEFAULT_CLOUD_ORIGIN;
}

function abortAfter(ms: number): AbortSignal {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

async function cloudPost<T>(path: string, body: Record<string, unknown>): Promise<{ status: number; data: T }> {
  const r = await fetch(`${cloudOrigin()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: abortAfter(20000),
  });
  const data = (await r.json().catch(() => ({}))) as T;
  return { status: r.status, data };
}

export async function activateLicense(input: {
  licenseKey: string;
  machineId: string;
  osInfo?: string;
  appVersion?: string;
}): Promise<ServiceMobileActivateResult> {
  try {
    const { status, data } = await cloudPost<ServiceMobileActivateResult>('/api/service-mobile/activate', input);
    const result = normalizeActivateResult(status, data, input.licenseKey);
    if (!result.valid) {
      clientLogger.warn('License activation failed', {
        path: '/api/service-mobile/activate',
        statusCode: status,
        error: result.error,
        licenseKeyPrefix: input.licenseKey.slice(0, 8),
        responseKeys: data && typeof data === 'object' ? Object.keys(data as object) : [],
        cloudOrigin: cloudOrigin() || '(vite-proxy)',
      });
      return result;
    }
    clientLogger.info('License activation ok', {
      path: '/api/service-mobile/activate',
      statusCode: status,
      licenseKeyPrefix: input.licenseKey.slice(0, 8),
      companyName: result.companyName,
      cloudOrigin: cloudOrigin() || '(vite-proxy)',
    });
    return result;
  } catch (err) {
    clientLogger.exception('License activation network error', err, {
      path: '/api/service-mobile/activate',
      licenseKeyPrefix: input.licenseKey.slice(0, 8),
      cloudOrigin: cloudOrigin() || '(vite-proxy)',
    });
    throw err;
  }
}

export async function heartbeat(input: {
  licenseKey: string;
  machineId: string;
  version?: string;
}): Promise<Record<string, unknown>> {
  const { data } = await cloudPost<Record<string, unknown>>('/api/service-mobile/heartbeat', input);
  return data;
}

export async function markApplied(input: { licenseKey: string; machineId: string }): Promise<boolean> {
  const { status } = await cloudPost('/api/service-mobile/mark-applied', input);
  return status < 400;
}

export async function markNotificationsDelivered(input: {
  licenseKey: string;
  machineId: string;
  notificationIds: string[];
}): Promise<boolean> {
  const { status } = await cloudPost('/api/service-mobile/mark-notifications-delivered', input);
  return status < 400;
}

/** @deprecated We do not store Offline Mobile ERP backups on our servers. */
export async function uploadBackup(_input: {
  licenseKey: string;
  machineId: string;
  ciphertext: string;
  nonce: string;
  wrap?: string;
  appVersion?: string;
}): Promise<boolean> {
  return false;
}

/** @deprecated Restore from a local backup file instead. */
export async function downloadLatestBackup(_input: { licenseKey: string; machineId: string }): Promise<{
  ciphertext: string;
  nonce: string;
  wrap: string | null;
  createdAt: string;
} | null> {
  return null;
}
