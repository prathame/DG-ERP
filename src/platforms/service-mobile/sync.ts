/**
 * Heartbeat / hard sync for Service Mobile — settings, Bell, force sync.
 * ERP data is never uploaded; scheduled backups are local files on the phone only.
 */
import { heartbeat, markApplied, markNotificationsDelivered } from './cloud';
import { loadLicense, saveLicense } from './licenseStore';
import { getOrCreateDeviceId } from './deviceId';
import { localQuery } from './local/db';
import { serviceMobileAppVersion } from './mode';
import { runScheduledLocalBackupIfDue } from './localBackup';
import { patchSyncState } from './syncState';

let lastForceSyncAt: string | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;

function printOverlayOpen(): boolean {
  return typeof document !== 'undefined' && Boolean(document.getElementById('dg-print-overlay'));
}

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

export type SyncResult = {
  ok: boolean;
  licenseValid?: boolean;
  reloaded?: boolean;
  localBackupSaved?: boolean;
  error?: string;
};

export async function runServiceMobileSync(): Promise<SyncResult> {
  const lic = loadLicense();
  if (!lic) {
    patchSyncState({ status: 'offline', licenseValid: false });
    return { ok: false, error: 'No license' };
  }
  const machineId = await getOrCreateDeviceId();
  patchSyncState({
    status: 'syncing',
    version: serviceMobileAppVersion(),
    validUntil: lic.validUntil,
  });

  try {
    const data = await heartbeat({
      licenseKey: lic.licenseKey,
      machineId,
      version: serviceMobileAppVersion(),
    });

    const hb = data as { validUntil?: unknown; licenseValid?: unknown; licenseStatus?: unknown };
    const validUntil = hb.validUntil != null ? String(hb.validUntil) : lic.validUntil;
    if (validUntil !== lic.validUntil) {
      saveLicense({ ...lic, validUntil });
    }
    patchSyncState({ validUntil });

    if (hb.licenseValid === false) {
      patchSyncState({ status: 'offline', licenseValid: false, lastSync: new Date().toISOString() });
      return { ok: false, licenseValid: false, error: String(hb.licenseStatus || 'invalid') };
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
    let notificationsInserted = 0;
    if (pending.length) {
      const ids = await applyNotifications(pending);
      notificationsInserted = ids.length;
      if (ids.length) {
        await markNotificationsDelivered({ licenseKey: lic.licenseKey, machineId, notificationIds: ids });
        // Cap OS shade — SA messages arrive via heartbeat even when Bell isn't open
        try {
          const { showOsNotification } = await import('../../lib/capLocalNotifications');
          for (const n of pending.filter(p => ids.includes(p.id))) {
            await showOsNotification({
              id: n.id,
              title: n.title,
              body: n.body,
              priority: 'high',
            });
          }
        } catch {
          /* web / permission denied */
        }
      }
    }

    const shouldReload = Boolean(forceSyncAt && forceSyncAt !== lastForceSyncAt) || notificationsInserted > 0;
    if (applied || shouldReload) {
      await markApplied({ licenseKey: lic.licenseKey, machineId });
      if (forceSyncAt) lastForceSyncAt = forceSyncAt;
    }

    // User-owned local file only — never upload ERP data to our cloud
    let localBackupSaved = false;
    try {
      localBackupSaved = await runScheduledLocalBackupIfDue();
    } catch {
      /* skip if user dismisses download / offline quirks */
    }
    if (localBackupSaved) {
      try {
        const { showOsNotification } = await import('../../lib/capLocalNotifications');
        const day = new Date().toISOString().slice(0, 10);
        await showOsNotification({
          id: `local_backup:${day}`,
          title: 'Backup saved',
          body: 'Offline backup written under Documents/Dhandho/backups.',
          hrefTab: 'settings',
          priority: 'high',
        });
      } catch {
        /* ignore */
      }
    }

    const lastSync = new Date().toISOString();
    patchSyncState({ status: 'online', lastSync, licenseValid: true });

    if (shouldReload && typeof window !== 'undefined' && !printOverlayOpen()) {
      window.location.reload();
    }
    return { ok: true, licenseValid: true, reloaded: shouldReload && !printOverlayOpen(), localBackupSaved };
  } catch (err) {
    patchSyncState({ status: 'offline' });
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
