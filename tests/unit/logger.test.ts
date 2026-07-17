import { describe, it, expect, vi } from 'vitest';
import {
  logger,
  serializeError,
  captureCaller,
  runWithRequestContext,
  getRequestContext,
} from '../../server/utils/logger';

describe('serializeError', () => {
  it('includes stack, code, and nested cause', () => {
    const cause = new Error('root');
    const err = new Error('wrap', { cause });
    (err as NodeJS.ErrnoException).code = 'ECONNRESET';
    const out = serializeError(err);
    expect(out.message).toBe('wrap');
    expect(out.code).toBe('ECONNRESET');
    expect(out.stack).toContain('wrap');
    expect((out.cause as { message: string }).message).toBe('root');
  });

  it('stringifies non-Error values', () => {
    expect(serializeError('boom')).toEqual({ message: 'boom' });
  });
});

describe('captureCaller / child / request context', () => {
  it('captureCaller returns file and line from this test', () => {
    const loc = captureCaller(1);
    expect(loc.file).toMatch(/logger\.test\.ts/);
    expect(typeof loc.line).toBe('number');
  });

  it('child logger merges bindings', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.setLevel('error');
    logger.child({ module: 'billing' }).error('x', { id: 1 });
    const line = String(spy.mock.calls[0]?.[0] || '');
    expect(line).toContain('"module":"billing"');
    expect(line).toContain('"id":1');
    spy.mockRestore();
    logger.setLevel('warn');
  });

  it('runWithRequestContext exposes store to getRequestContext', () => {
    expect(getRequestContext()).toEqual({});
    runWithRequestContext({ correlationId: 'abc', userId: 'U1' }, () => {
      expect(getRequestContext()).toEqual({ correlationId: 'abc', userId: 'U1' });
    });
  });

  it('normalizes err key and nested error objects', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.setLevel('error');
    logger.error('with err', { err: new Error('e1') });
    logger.error('with plain error', { error: 'plain' });
    logger.error('with object error', { error: { message: 'obj', nested: { password: 'x' } } });
    expect(spy).toHaveBeenCalled();
    const joined = spy.mock.calls.map(c => String(c[0])).join('\n');
    expect(joined).toContain('e1');
    expect(joined).toContain('plain');
    expect(joined).toContain('[REDACTED]');
    spy.mockRestore();
    logger.setLevel('warn');
  });
});
