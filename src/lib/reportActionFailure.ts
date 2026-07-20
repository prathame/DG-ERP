/**
 * Critical-action failure reporting for Cap bug reports.
 * - Soft UX blocks (validation): breadcrumb + toast at call site; no file.
 * - Hard failures (exception / save/share/import/backup/convert failed): breadcrumb + full bug report file.
 * Success taps are never logged here.
 */
import { clientLogger, pushClientBreadcrumb } from './logger';
import { persistBugReport } from './bugReport';

const DEDUPE_MS = 8_000;
let lastDedupeKey = '';
let lastDedupeAt = 0;

function shortReason(err: unknown, max = 160): string {
  const msg = err instanceof Error ? err.message : String(err ?? 'unknown');
  const clean = msg.replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean || 'unknown';
}

/** Expected UX block (e.g. Mark Accepted first). Breadcrumb only — no file. */
export function reportActionBlocked(action: string, reason: string, detail?: Record<string, unknown>): void {
  const ctx = { action, phase: 'blocked' as const, reason, ...detail };
  pushClientBreadcrumb(`${action}:blocked`, ctx);
  clientLogger.warn(`${action}:blocked`, ctx);
}

/**
 * Hard failure: write-through breadcrumb + client log, then persist a full bug report on Cap
 * (same shape as Generate Bug Report / unexpected-stop). Dedupes identical action+reason briefly.
 */
export async function reportActionFailed(
  action: string,
  err: unknown,
  detail?: Record<string, unknown>,
): Promise<void> {
  const reason = shortReason(err);
  const ctx = { action, phase: 'error' as const, reason, ...detail };
  pushClientBreadcrumb(`${action}:error`, ctx);
  clientLogger.exception(`${action}:error`, err, ctx);

  const key = `${action}|${reason}`;
  const now = Date.now();
  if (key === lastDedupeKey && now - lastDedupeAt < DEDUPE_MS) return;
  lastDedupeKey = key;
  lastDedupeAt = now;

  try {
    await persistBugReport(
      {
        lastError: `${action}: ${reason}`,
        note: `Auto-report: critical action failed (${action}).`,
      },
      { kind: 'action' },
    );
  } catch {
    /* never break the UI because reporting failed */
  }
}

/** Test helper — reset dedupe window. */
export function _resetActionFailureDedupeForTests(): void {
  lastDedupeKey = '';
  lastDedupeAt = 0;
}
