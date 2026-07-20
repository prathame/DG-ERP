import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/bugReport', () => ({
  persistBugReport: vi.fn(async () => 'saved' as const),
}));

import { persistBugReport } from '../../src/lib/bugReport';
import {
  reportActionBlocked,
  reportActionFailed,
  reportSlugOnboardingFailure,
  _resetActionFailureDedupeForTests,
} from '../../src/lib/reportActionFailure';
import { getClientBreadcrumbs, getRecentClientLogs } from '../../src/lib/logger';

describe('reportActionFailure', () => {
  function stubDurableLocalStorage() {
    const map = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      key: (i: number) => [...map.keys()][i] ?? null,
    });
  }

  beforeEach(() => {
    stubDurableLocalStorage();
    _resetActionFailureDedupeForTests();
    vi.mocked(persistBugReport).mockClear();
  });

  afterEach(() => {
    _resetActionFailureDedupeForTests();
    vi.unstubAllGlobals();
  });

  it('blocked writes breadcrumb only (no file)', () => {
    reportActionBlocked('quote.convert', 'Mark as Accepted first');
    const crumbs = getClientBreadcrumbs(5);
    expect(crumbs.some(c => c.includes('quote.convert:blocked'))).toBe(true);
    expect(persistBugReport).not.toHaveBeenCalled();
  });

  it('failed writes breadcrumb and persists action bug report', async () => {
    await reportActionFailed('quote.convert', new Error('DB locked'));
    const crumbs = getClientBreadcrumbs(5);
    expect(crumbs.some(c => c.includes('quote.convert:error'))).toBe(true);
    expect(persistBugReport).toHaveBeenCalledTimes(1);
    expect(vi.mocked(persistBugReport).mock.calls[0]?.[1]).toEqual({ kind: 'action' });
  });

  it('dedupes identical failures within window', async () => {
    await reportActionFailed('backup.export', 'disk full');
    await reportActionFailed('backup.export', 'disk full');
    expect(persistBugReport).toHaveBeenCalledTimes(1);
  });

  it('slug onboarding failure writes durable logs and persists full report', async () => {
    await reportSlugOnboardingFailure({
      action: 'slug.entry',
      kind: 'network',
      reason: 'Failed to fetch',
      slug: 'acme',
      apiOrigin: 'https://dg-erp.onrender.com',
      pageOrigin: 'https://localhost',
    });
    const crumbs = getClientBreadcrumbs(10).join('\n');
    expect(crumbs).toMatch(/slug\.entry:error/);
    expect(crumbs).toMatch(/"kind":"network"/);
    expect(crumbs).toMatch(/"slug":"acme"/);
    const logs = getRecentClientLogs(10).join('\n');
    expect(logs).toMatch(/slug\.entry:error/);
    expect(logs).toMatch(/\[network\] Failed to fetch/);
    expect(localStorage.getItem('dg_client_log_ring')).toMatch(/slug\.entry:error/);
    expect(persistBugReport).toHaveBeenCalledTimes(1);
    const extras = vi.mocked(persistBugReport).mock.calls[0]?.[0];
    expect(extras?.lastError).toMatch(/slug\.entry/);
    expect(extras?.lastError).toMatch(/network/);
  });
});
