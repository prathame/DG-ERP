import { describe, expect, it, beforeEach, vi } from 'vitest';
import { clientLogger, getRecentClientLogs, pushClientBreadcrumb } from '../../src/lib/logger';
import { buildBugReportText } from '../../src/lib/bugReport';
import { isMobileAppShell } from '../../src/lib/mobileAppShell';
import { reportSlugOnboardingFailure, _resetActionFailureDedupeForTests } from '../../src/lib/reportActionFailure';

vi.mock('../../src/lib/bugReport', async importOriginal => {
  const actual = await importOriginal<typeof import('../../src/lib/bugReport')>();
  return {
    ...actual,
    persistBugReport: vi.fn(async () => 'saved' as const),
  };
});

describe('bug report', () => {
  beforeEach(() => {
    _resetActionFailureDedupeForTests();
    // ring buffer is module-level; push a known line
    clientLogger.warn('bug-report-test-line', { password: 'secret', ok: true });
  });

  it('keeps recent redacted logs in memory', () => {
    const logs = getRecentClientLogs(10);
    expect(logs.some(l => l.includes('bug-report-test-line'))).toBe(true);
    expect(logs.some(l => l.includes('[REDACTED]') && l.includes('password'))).toBe(true);
    expect(logs.some(l => l.includes('secret'))).toBe(false);
  });

  it('builds text with note and last error', async () => {
    const text = await buildBugReportText({
      note: 'Login failed after update',
      lastError: 'Invalid credentials',
    });
    expect(text).toContain('Dhando bug report');
    expect(text).toContain('Invalid credentials');
    expect(text).toContain('Login failed after update');
    expect(text).toContain('Recent client logs');
  });

  it('includes durable WhatsApp breadcrumbs in report body', async () => {
    pushClientBreadcrumb('WhatsApp PDF build start', { invoiceId: 'INV-CRASH' });
    const text = await buildBugReportText({
      note: 'Auto-report: previous session stopped unexpectedly',
      lastError: 'unexpected_stop',
    });
    expect(text).toContain('unexpected_stop');
    expect(text).toContain('WhatsApp PDF build start');
    expect(text).toContain('INV-CRASH');
  });

  it('after slug onboarding failure, Share text has non-empty client logs', async () => {
    await reportSlugOnboardingFailure({
      action: 'slug.entry',
      kind: 'reserved',
      reason: '"admin" is reserved for the app. Try another company slug.',
      slug: 'admin',
      apiOrigin: 'https://dhandho.onrender.com',
      pageOrigin: 'https://localhost',
    });
    const text = await buildBugReportText({
      note: 'Online Cap company slug entry',
      lastError: '"admin" is reserved for the app. Try another company slug.',
    });
    expect(text).toContain('Last error:');
    expect(text).toContain('reserved');
    expect(text).not.toContain('Recent client logs (0)');
    expect(text).not.toContain('(empty — reproduce the issue once, then share again)');
    expect(text).toMatch(/Recent client logs \([1-9]\d*\):/);
    expect(text).toMatch(/slug\.entry:error/);
    expect(text).toMatch(/"kind":"reserved"/);
  });

  it('isMobileAppShell is false in plain vitest (no Capacitor / offline mode)', () => {
    expect(isMobileAppShell()).toBe(false);
  });
});
