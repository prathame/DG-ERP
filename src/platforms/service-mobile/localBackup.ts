/**
 * User-owned backups for Offline Mobile App.
 * We do NOT upload ERP data to our servers — staff keep the file (and may email it to their own Gmail).
 */
import { dumpLocalDb, restoreLocalDbPlaintext, wipeLocalDb } from './local/db';
import { encryptBackup, decryptBackup } from './local/crypto';
import { loadLicense } from './licenseStore';
import { localQuery } from './local/db';
import { isNativeCapacitor, saveDhandhoFile } from '../../lib/dhandhoFiles';

export type BackupFrequency = 'daily' | 'weekly' | 'monthly';

export type LocalBackupSettings = {
  enabled: boolean;
  frequency: BackupFrequency;
  intervalDays: number;
  lastBackupAt: string | null;
  /** Staff Gmail — used only to open a mailto draft on their device (we never send/store the file). */
  email: string | null;
};

const META_KEY = 'backup_settings';
const FORMAT = 'dhandho-sm-local-v1';

const INTERVAL_DAYS: Record<BackupFrequency, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

export function defaultLocalBackupSettings(): LocalBackupSettings {
  return {
    enabled: true,
    frequency: 'daily',
    intervalDays: 1,
    lastBackupAt: null,
    email: null,
  };
}

function normalizeFrequency(v: unknown): BackupFrequency {
  if (v === 'weekly' || v === 'monthly' || v === 'daily') return v;
  return 'daily';
}

export async function loadLocalBackupSettings(): Promise<LocalBackupSettings> {
  try {
    const { rows } = await localQuery<{ value: string }>(`SELECT value FROM sm_meta WHERE key = $1`, [META_KEY]);
    const raw = rows[0]?.value;
    if (!raw) return defaultLocalBackupSettings();
    const parsed = JSON.parse(raw) as Partial<LocalBackupSettings>;
    const frequency = normalizeFrequency(parsed.frequency);
    return {
      enabled: parsed.enabled !== false,
      frequency,
      intervalDays: INTERVAL_DAYS[frequency],
      lastBackupAt: parsed.lastBackupAt || null,
      email: parsed.email || null,
    };
  } catch {
    return defaultLocalBackupSettings();
  }
}

export async function saveLocalBackupSettings(
  input: Partial<Pick<LocalBackupSettings, 'enabled' | 'frequency' | 'email' | 'lastBackupAt'>>,
): Promise<LocalBackupSettings> {
  const current = await loadLocalBackupSettings();
  const frequency = input.frequency !== undefined ? normalizeFrequency(input.frequency) : current.frequency;
  const next: LocalBackupSettings = {
    enabled: input.enabled !== undefined ? Boolean(input.enabled) : current.enabled,
    frequency,
    intervalDays: INTERVAL_DAYS[frequency],
    lastBackupAt: input.lastBackupAt !== undefined ? input.lastBackupAt : current.lastBackupAt,
    email: input.email !== undefined ? input.email || null : current.email,
  };
  await localQuery(
    `INSERT INTO sm_meta (key, value) VALUES ($1, $2)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [META_KEY, JSON.stringify(next)],
  );
  return next;
}

export async function shouldRunLocalBackup(now = Date.now()): Promise<boolean> {
  const s = await loadLocalBackupSettings();
  if (!s.enabled) return false;
  if (!s.lastBackupAt) return true;
  const last = new Date(s.lastBackupAt).getTime();
  if (Number.isNaN(last)) return true;
  return now - last >= s.intervalDays * 24 * 60 * 60 * 1000;
}

export type LocalBackupEnvelope = {
  format: typeof FORMAT;
  companyName: string;
  exportedAt: string;
  ciphertext: string;
  nonce: string;
  wrap: string;
};

export async function buildLocalBackupEnvelope(): Promise<{ envelope: LocalBackupEnvelope; filename: string }> {
  const lic = loadLicense();
  if (!lic) throw new Error('Activate license before exporting a backup');
  const dump = await dumpLocalDb();
  const enc = await encryptBackup(dump, String(lic.licenseKey || '').trim().toUpperCase());
  const exportedAt = new Date().toISOString();
  const envelope: LocalBackupEnvelope = {
    format: FORMAT,
    companyName: lic.companyName,
    exportedAt,
    ciphertext: enc.ciphertext,
    nonce: enc.nonce,
    wrap: enc.wrap,
  };
  const day = exportedAt.slice(0, 10);
  const safe = lic.companyName.replace(/[^a-zA-Z0-9-_]+/g, '_').slice(0, 40) || 'service';
  return { envelope, filename: `offline-mobile-backup-${safe}-${day}.json` };
}

export function downloadLocalBackupFile(envelope: LocalBackupEnvelope, filename: string): void {
  const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Opens the staff's mail app — we do not send or store the backup. */
export function openBackupMailto(email: string, filename: string, companyName: string, relativePath?: string): void {
  const to = email.trim();
  if (!to || typeof window === 'undefined') return;
  const subject = encodeURIComponent(`Offline Mobile backup — ${companyName}`);
  const where = relativePath || `Documents/Dhandho/backups/${filename}`;
  const body = encodeURIComponent(
    `Your Offline Mobile App backup file was saved on this phone as:\n\n${where}\n\n` +
      `Open My Files / Files → Documents → Dhandho → backups to attach it in Gmail.\n\n` +
      `Dhando does not store your business data — keep this file safe.`,
  );
  window.location.href = `mailto:${encodeURIComponent(to)}?subject=${subject}&body=${body}`;
}

export async function exportLocalBackupNow(opts?: {
  openMail?: boolean;
}): Promise<{ filename: string; path?: string }> {
  const { envelope, filename } = await buildLocalBackupEnvelope();
  let path: string | undefined;
  if (isNativeCapacitor()) {
    const saved = await saveDhandhoFile({
      subdir: 'backups',
      filename,
      data: JSON.stringify(envelope, null, 2),
      encoding: 'utf8',
    });
    path = saved.relativePath;
  } else {
    downloadLocalBackupFile(envelope, filename);
  }
  await saveLocalBackupSettings({ lastBackupAt: envelope.exportedAt });
  if (opts?.openMail) {
    const s = await loadLocalBackupSettings();
    if (s.email) openBackupMailto(s.email, filename, envelope.companyName, path);
  }
  return { filename, path };
}

export async function runScheduledLocalBackupIfDue(): Promise<boolean> {
  if (!(await shouldRunLocalBackup())) return false;
  const s = await loadLocalBackupSettings();
  await exportLocalBackupNow({ openMail: Boolean(s.email) });
  return true;
}

export async function restoreFromLocalBackupJson(text: string): Promise<{ ok: boolean; error?: string }> {
  const lic = loadLicense();
  if (!lic) return { ok: false, error: 'Activate license first' };
  let parsed: LocalBackupEnvelope;
  try {
    parsed = JSON.parse(text) as LocalBackupEnvelope;
  } catch {
    return { ok: false, error: 'Invalid backup file' };
  }
  if (parsed.format !== FORMAT || !parsed.ciphertext || !parsed.nonce) {
    return { ok: false, error: 'Not an Offline Mobile backup file' };
  }
  const licenseKey = String(lic.licenseKey || '')
    .trim()
    .toUpperCase();
  let plain: Uint8Array;
  try {
    // Same DG-SM key that encrypted the file (not machineId) — reinstall / new phone OK
    plain = await decryptBackup(parsed.ciphertext, parsed.nonce, licenseKey);
  } catch {
    return {
      ok: false,
      error: 'Could not decrypt backup — use the same DG-SM license key that created this file',
    };
  }
  try {
    await wipeLocalDb();
    await restoreLocalDbPlaintext(plain);
    return { ok: true };
  } catch (err) {
    const detail = err instanceof Error && err.message ? err.message : 'import failed';
    return {
      ok: false,
      error: `Backup decrypted but restore failed (${detail}). Try again or Share bug report.`,
    };
  }
}
