import { describe, expect, it, beforeEach } from 'vitest';
import { clientLogger, getRecentClientLogs } from '../../src/lib/logger';
import { buildBugReportText } from '../../src/lib/bugReport';

describe('bug report', () => {
  beforeEach(() => {
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
});
