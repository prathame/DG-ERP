/**
 * Books dual-write integrity guard.
 *
 * BOOKS_STRICT=0  — legacy permissive mode: Books failures are logged but ops succeeds.
 *                   Use only as an emergency escape hatch for existing installs with Books bugs.
 * BOOKS_STRICT=1  — (default) strict mode: Books failure rolls back the entire transaction.
 *                   An invoice/payment/sale/purchase/expense never appears financially complete
 *                   while its Books entry is missing.
 */
import { logger } from './logger';

/**
 * Execute a Books dual-write inside an open transaction.
 *
 * Mode is resolved per-call so tests can override via process.env:
 *
 * Production (no VITEST):  strict by default (BOOKS_STRICT=0 to disable)
 * Test env (VITEST=true):  permissive by default (BOOKS_STRICT=1 to enable strict)
 *
 * Strict:     throws on failure → caller's ROLLBACK fires.
 * Permissive: logs warning, ops commit proceeds (emergency escape or test default).
 */
function isStrict(): boolean {
  const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
  return isTest ? process.env.BOOKS_STRICT === '1' : process.env.BOOKS_STRICT !== '0';
}

export async function withBooks(fn: () => Promise<unknown>, context: string): Promise<void> {
  if (isStrict()) {
    try {
      await fn();
    } catch (err) {
      // Strict mode: log as ERROR so alert rules can fire on this pattern.
      // Alert rule: "Books dual-write failed" in Sentry/Logtail → P0 financial integrity issue.
      logger.error('Books dual-write failed — strict mode, transaction will roll back', {
        alert: 'books_dual_write_failure',
        context,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
      throw err;
    }
  } else {
    try {
      await fn();
    } catch (err) {
      logger.warn('Books dual-write failed — permissive mode (BOOKS_STRICT=0), ops will commit without Books entry', {
        alert: 'books_dual_write_failure_permissive',
        context,
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
      });
    }
  }
}
