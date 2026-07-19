/**
 * Cloud API client for Service Mobile license / sync / backup.
 * Business ERP traffic never goes here — only activate, heartbeat, backup.
 */
import { clientLogger } from '../../lib/logger';

export type ServiceMobileActivateResult = {
  valid: boolean;
  licenseKey: string;
  companyName: string;
  businessType: 'service';
  maxUsers: 1;
  validUntil: string | null;
  adminEmail: string | null;
  settings: Record<string, unknown>;
  tabConfig: Record<string, { label: string; visible: boolean }>;
  hasBackup: boolean;
  error?: string;
};

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
  if (typeof window !== 'undefined' && window.location?.origin) {
    return window.location.origin;
  }
  return 'https://dg-erp.onrender.com';
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
    if (status >= 400) {
      const error = (data as { error?: string }).error || 'Activation failed';
      clientLogger.warn('License activation failed', {
        path: '/api/service-mobile/activate',
        statusCode: status,
        error,
        licenseKeyPrefix: input.licenseKey.slice(0, 8),
      });
      return {
        valid: false,
        licenseKey: input.licenseKey,
        companyName: '',
        businessType: 'service',
        maxUsers: 1,
        validUntil: null,
        adminEmail: null,
        settings: {},
        tabConfig: {},
        hasBackup: false,
        error,
      };
    }
    clientLogger.info('License activation ok', {
      path: '/api/service-mobile/activate',
      statusCode: status,
      licenseKeyPrefix: input.licenseKey.slice(0, 8),
    });
    return data;
  } catch (err) {
    clientLogger.exception('License activation network error', err, {
      path: '/api/service-mobile/activate',
      licenseKeyPrefix: input.licenseKey.slice(0, 8),
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
