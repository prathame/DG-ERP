/**
 * Cap unexpected-stop detection → auto bug report on next launch.
 *
 * Pattern (avoids treating OS background kills as crashes):
 * - Foreground / active → dirty session flag
 * - Pause / background / visibility hidden → clean shutdown flag
 * - Next launch: dirty && !clean → previous process died while "running" → persist bug report
 *
 * Breadcrumbs / client logs are write-through in logger.ts (localStorage) so WhatsApp/PDF
 * steps survive WebView process death.
 */

import { clientLogger } from './logger';

export const CAP_SESSION_DIRTY_KEY = 'dg_cap_session_dirty';
export const CAP_SESSION_CLEAN_KEY = 'dg_cap_session_clean';

export type SessionFlagStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function defaultStorage(): SessionFlagStorage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** App is in foreground / actively running — process death after this counts as unexpected. */
export function markSessionRunning(storage: SessionFlagStorage | null = defaultStorage()): void {
  if (!storage) return;
  storage.setItem(CAP_SESSION_DIRTY_KEY, '1');
  storage.setItem(CAP_SESSION_CLEAN_KEY, '0');
}

/** Normal pause / background / intentional exit — next cold start is not a crash. */
export function markSessionCleanShutdown(storage: SessionFlagStorage | null = defaultStorage()): void {
  if (!storage) return;
  storage.setItem(CAP_SESSION_DIRTY_KEY, '0');
  storage.setItem(CAP_SESSION_CLEAN_KEY, '1');
}

/** True when last run left a dirty session without recording a clean shutdown. */
export function wasUnexpectedStop(storage: SessionFlagStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  return storage.getItem(CAP_SESSION_DIRTY_KEY) === '1' && storage.getItem(CAP_SESSION_CLEAN_KEY) !== '1';
}

export function clearSessionLifecycleFlags(storage: SessionFlagStorage | null = defaultStorage()): void {
  if (!storage) return;
  storage.removeItem(CAP_SESSION_DIRTY_KEY);
  storage.removeItem(CAP_SESSION_CLEAN_KEY);
}

/**
 * Call once from Cap platform bootstrap.
 * If the previous session died unexpectedly, silently save a bug report under Dhandho/bug-reports.
 */
export async function initUnexpectedStopReporting(): Promise<void> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return;
  } catch {
    return;
  }

  const storage = defaultStorage();
  if (!storage) return;

  if (wasUnexpectedStop(storage)) {
    try {
      clientLogger.warn('Previous Cap session stopped unexpectedly — saving bug report');
      const { persistBugReport } = await import('./bugReport');
      await persistBugReport({
        note: 'Auto-report: previous session stopped unexpectedly (crash/freeze/process death without clean shutdown). Check WhatsApp/PDF breadcrumbs and recent client logs above.',
        lastError: 'unexpected_stop',
      });
    } catch (err) {
      clientLogger.exception('Failed to persist unexpected-stop bug report', err);
    }
    clearSessionLifecycleFlags(storage);
  }

  markSessionRunning(storage);

  try {
    const { App } = await import('@capacitor/app');
    await App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) markSessionRunning(storage);
      else markSessionCleanShutdown(storage);
    });
  } catch {
    /* App plugin unavailable */
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') markSessionCleanShutdown(storage);
    else markSessionRunning(storage);
  });
}
