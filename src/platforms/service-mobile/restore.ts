import { downloadLatestBackup } from './cloud';
import { loadLicense } from './licenseStore';
import { getOrCreateDeviceId } from './deviceId';
import { decryptBackup } from './local/crypto';
import { restoreLocalDbFromJson, wipeLocalDb, getLocalDb } from './local/db';

/** Restore encrypted cloud backup for the same license only (server enforces tenant). */
export async function restoreSameTenantBackup(): Promise<{ ok: boolean; error?: string }> {
  const lic = loadLicense();
  if (!lic) return { ok: false, error: 'Activate license first' };
  const machineId = await getOrCreateDeviceId();
  const blob = await downloadLatestBackup({ licenseKey: lic.licenseKey, machineId });
  if (!blob) return { ok: false, error: 'No backup found for this license' };

  try {
    // Backup ciphertext is keyed to licenseKey only (v2) so a new phone after SA unbind can restore.
    const plain = await decryptBackup(blob.ciphertext, blob.nonce, lic.licenseKey);
    await wipeLocalDb();
    await getLocalDb();
    await restoreLocalDbFromJson(plain);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Restore failed' };
  }
}
