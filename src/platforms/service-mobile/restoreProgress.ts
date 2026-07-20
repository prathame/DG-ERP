/** Shared restore progress for Offline (PGlite) and Online (API) Settings restore UX. */

export type RestoreStage = 'reading' | 'validating' | 'decrypting' | 'wiping' | 'applying' | 'uploading' | 'done';

export type RestoreProgress = {
  /** 0–100 */
  percent: number;
  stage: RestoreStage;
  label: string;
};

export type RestoreProgressCallback = (progress: RestoreProgress) => void;

const LABELS: Record<RestoreStage, string> = {
  reading: 'Reading backup file…',
  validating: 'Validating backup…',
  decrypting: 'Decrypting…',
  wiping: 'Preparing database…',
  applying: 'Restoring data…',
  uploading: 'Applying backup…',
  done: 'Restore complete',
};

export function restoreProgress(stage: RestoreStage, percent: number, label?: string): RestoreProgress {
  return {
    stage,
    percent: Math.max(0, Math.min(100, Math.round(percent))),
    label: label || LABELS[stage],
  };
}

/** Let React paint between heavy restore steps. */
export function yieldRestoreUi(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}
