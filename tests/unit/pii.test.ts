import { describe, it, expect } from 'vitest';
import { redactPii, redactContext, safeErrorMessage } from '../../server/utils/pii';

describe('PII redaction', () => {
  it('redacts emails, phones, JWTs, and password assignments', () => {
    const raw = 'User a@b.co phone 9876543210 token=secret123 Bearer abc.def.ghi password: hunter2';
    const out = redactPii(raw);
    expect(out).toContain('[REDACTED_EMAIL]');
    expect(out).toContain('[REDACTED_PHONE]');
    expect(out).toMatch(/Bearer \[REDACTED\]/i);
    expect(out).toContain('[REDACTED]');
    expect(out).not.toContain('a@b.co');
    expect(out).not.toContain('9876543210');
    expect(out).not.toContain('hunter2');
  });

  it('redacts nested context objects', () => {
    const ctx = redactContext({
      email: 'user@example.com',
      nested: { phone: '9123456789' },
      list: ['x@y.co'],
      n: 1,
    });
    expect(ctx?.email).toBe('[REDACTED_EMAIL]');
    expect((ctx?.nested as Record<string, unknown>).phone).toBe('[REDACTED_PHONE]');
    expect((ctx?.list as string[])[0]).toBe('[REDACTED_EMAIL]');
    expect(ctx?.n).toBe(1);
  });

  it('safeErrorMessage strips PII from Error messages', () => {
    const msg = safeErrorMessage(new Error('duplicate key for email jane@corp.in'));
    expect(msg).toContain('[REDACTED_EMAIL]');
    expect(msg).not.toContain('jane@corp.in');
  });
});
