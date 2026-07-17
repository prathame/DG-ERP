/**
 * Heartbeat / hard sync for Service Mobile — settings, Bell, force sync, then encrypted backup.
 */
import { heartbeat, markApplied, markNotificationsDelivered, uploadBackup } from './cloud';
import { loadLicense } from './licenseStore';
import { getOrCreateDeviceId } from './deviceId';
import { localQuery, dumpLocalDb } from './local/db';
import { encryptBackup } from './local/crypto';
import { serviceMobileAppVersion } from './mode';

let lastForceSyncAt: string | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;

async function applySettings(settings: Record<string, unknown>): Promise<boolean> {
  const { rows } = await localQuery<{ id: string; tab_config: unknown }>(`SELECT id, tab_config FROM tenants LIMIT 1`);
  const tenant = rows[0];
  if (!tenant) return false;

  if (settings.tabConfig && typeof settings.tabConfig === 'object') {
    const existing =
      typeof tenant.tab_config === 'string'
        ? JSON.parse(tenant.tab_config)
        : (tenant.tab_config as Record<string, unknown>) || {};
    const incoming = settings.tabConfig as Record<string, unknown>;
    const merged = { ...existing };
    for (const [k, v] of Object.entries(incoming)) {
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        merged[k] = { ...((existing[k] as object) || {}), ...(v as object) };
      } else {
        merged[k] = v;
      }
    }
    await localQuery(`UPDATE tenants SET tab_config=$1 WHERE id=$2`, [JSON.stringify(merged), tenant.id]);
  }

  const featureMap: Record<string, string> = {
    barcodeSystemEnabled: 'barcode_system_enabled',
    multiLanguageEnabled: 'multi_language_enabled',
    inventoryTrackingEnabled: 'inventory_tracking_enabled',
    vendorPortalEnabled: 'vendor_portal_enabled',
    quotationsEnabled: 'quotations_enabled',
    accountsEnabled: 'accounts_enabled',
    purchasesEnabled: 'purchases_enabled',
    chatbotEnabled: 'chatbot_enabled',
  };
  for (const [key, col] of Object.entries(featureMap)) {
    if (settings[key] !== undefined) {
      await localQuery(`UPDATE tenants SET ${col}=$1 WHERE id=$2`, [Boolean(settings[key]), tenant.id]);
    }
  }
  return true;
}

async function applyNotifications(
  pending: {
    id: string;
    title: string;
    body: string;
    type: string;
    source: string;
    createdAt: string;
    expiresAt: string | null;
  }[],
): Promise<string[]> {
  const { rows } = await localQuery<{ id: string }>(`SELECT id FROM tenants LIMIT 1`);
  const tid = rows[0]?.id;
  if (!tid) return [];
  const applied: string[] = [];
  for (const n of pending) {
    await localQuery(
      `INSERT INTO tenant_notifications (id, tenant_id, title, body, type, source, created_at, expires_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO NOTHING`,
      [n.id, tid, n.title, n.body, n.type || 'info', n.source || 'super_admin', n.createdAt, n.expiresAt],
    );
    applied.push(n.id);
  }
  return applied;
}

async function pushEncryptedBackup(): Promise<void> {
  const lic = loadLicense();
  if (!lic) return;
  const machineId = await getOrCreateDeviceId();
  const dump = await dumpLocalDb();
  const enc = await encryptBackup(dump, lic.licenseKey);
  await uploadBackup({
    licenseKey: lic.licenseKey,
    machineId,
    ciphertext: enc.ciphertext,
    nonce: enc.nonce,
    wrap: enc.wrap,
    appVersion: serviceMobileAppVersion(),
  });
}

export type SyncResult = {
  ok: boolean;
  licenseValid?: boolean;
  reloaded?: boolean;
  error?: string;
};

export async function runServiceMobileSync(): Promise<SyncResult> {
  const lic = loadLicense();
  if (!lic) return { ok: false, error: 'No license' };
  const machineId = await getOrCreateDeviceId();

  try {
    const data = await heartbeat({
      licenseKey: lic.licenseKey,
      machineId,
      version: serviceMobileAppVersion(),
    });

    if (data.licenseValid === false) {
      return { ok: false, licenseValid: false, error: String(data.licenseStatus || 'invalid') };
    }

    const settings = (data.settings || {}) as Record<string, unknown>;
    const forceSyncAt = settings.forceSyncAt ? String(settings.forceSyncAt) : null;
    let applied = false;

    if (settings && Object.keys(settings).length) {
      applied = await applySettings(settings);
    }

    const pending = (data.pendingNotifications || []) as {
      id: string;
      title: string;
      body: string;
      type: string;
      source: string;
      createdAt: string;
      expiresAt: string | null;
    }[];
    if (pending.length) {
      const ids = await applyNotifications(pending);
      if (ids.length) {
        await markNotificationsDelivered({ licenseKey: lic.licenseKey, machineId, notificationIds: ids });
      }
    }

    const shouldReload = Boolean(forceSyncAt && forceSyncAt !== lastForceSyncAt);
    if (applied || shouldReload) {
      await markApplied({ licenseKey: lic.licenseKey, machineId });
      if (forceSyncAt) lastForceSyncAt = forceSyncAt;
    }

    // Encrypted backup after successful sync (disaster recovery B)
    try {
      await pushEncryptedBackup();
    } catch {
      /* offline backup skip is fine */
    }

    if (shouldReload && typeof window !== 'undefined') {
      window.location.reload();
    }
    return { ok: true, licenseValid: true, reloaded: shouldReload };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Sync failed' };
  }
}

export function startServiceMobileHeartbeat(intervalMs = 15 * 60 * 1000): void {
  void runServiceMobileSync();
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = setInterval(() => {
    void runServiceMobileSync();
  }, intervalMs);
}

export function stopServiceMobileHeartbeat(): void {
  if (syncTimer) clearInterval(syncTimer);
  syncTimer = null;
}
