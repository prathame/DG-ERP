import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../../src/lib/bugReport', () => ({
  persistBugReport: vi.fn(async () => 'saved' as const),
}));

import { persistBugReport } from '../../src/lib/bugReport';
import {
  reportActionBlocked,
  reportActionFailed,
  _resetActionFailureDedupeForTests,
} from '../../src/lib/reportActionFailure';
import { getClientBreadcrumbs } from '../../src/lib/logger';

describe('reportActionFailure', () => {
  beforeEach(() => {
    _resetActionFailureDedupeForTests();
    vi.mocked(persistBugReport).mockClear();
    try {
      localStorage.removeItem('dg_bug_breadcrumbs');
    } catch {
      /* jsdom */
    }
  });

  afterEach(() => {
    _resetActionFailureDedupeForTests();
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
});
