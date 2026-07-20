import { restoreFromLocalBackupJson } from './localBackup';
import { restoreProgress, yieldRestoreUi, type RestoreProgressCallback } from './restoreProgress';

/** Restore from a backup file the staff kept (Downloads / Gmail). We never host these. */
export async function restoreFromLocalBackupFile(
  file: File,
  onProgress?: RestoreProgressCallback,
): Promise<{ ok: boolean; error?: string }> {
  try {
    onProgress?.(restoreProgress('reading', 3));
    await yieldRestoreUi();
    const text = await file.text();
    onProgress?.(restoreProgress('reading', 8));
    await yieldRestoreUi();
    return restoreFromLocalBackupJson(text, onProgress);
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
