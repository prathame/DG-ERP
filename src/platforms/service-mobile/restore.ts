import { restoreFromLocalBackupJson } from './localBackup';

/** Restore from a backup file the staff kept (Downloads / Gmail). We never host these. */
export async function restoreFromLocalBackupFile(file: File): Promise<{ ok: boolean; error?: string }> {
  try {
    const text = await file.text();
    return restoreFromLocalBackupJson(text);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Restore failed' };
  }
}

/** @deprecated Cloud backups removed — use restoreFromLocalBackupFile */
export async function restoreSameTenantBackup(): Promise<{ ok: boolean; error?: string }> {
  return {
    ok: false,
    error: 'Cloud backups are disabled. Restore from your backup file (Downloads / Gmail).',
  };
}
