import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response } from 'express';
import { handleApiError, logAuthEvent, logSlowOperation } from '../../server/utils/http-error';
import { logger, runWithRequestContext } from '../../server/utils/logger';

function mockRes(): Response & { statusCode: number; body: unknown; headersSent: boolean } {
  const res = {
    statusCode: 200,
    body: undefined as unknown,
    headersSent: false,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(body: unknown) {
      this.body = body;
      this.headersSent = true;
      return this;
    },
  };
  return res as unknown as Response & { statusCode: number; body: unknown; headersSent: boolean };
}

function mockReq(overrides: Partial<Request> & Record<string, unknown> = {}): Request {
  return {
    method: 'POST',
    path: '/api/invoices',
    originalUrl: '/api/invoices?token=secret',
    ip: '127.0.0.1',
    headers: { 'user-agent': 'vitest', 'x-tenant-id': 'T1', 'x-correlation-id': 'corr-1' },
    socket: { remoteAddress: '127.0.0.1' },
    correlationId: 'corr-1',
    user: { userId: 'U1', tenantId: 'T1', role: 'Admin' },
    tenantId: 'T1',
    ...overrides,
  } as unknown as Request;
}

describe('handleApiError', () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let fatalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    fatalSpy = vi.spyOn(logger, 'fatal').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    fatalSpy.mockRestore();
  });

  it('logs error + returns sanitized 500 with correlationId', () => {
    const req = mockReq();
    const res = mockRes();
    const err = new Error('db down');
    handleApiError(req, res, err, 'Failed to create invoice', { context: { invoiceId: 'I1' } });
    expect(errorSpy).toHaveBeenCalled();
    expect(res.statusCode).toBe(500);
    expect(res.body).toEqual({ error: 'Internal server error', correlationId: 'corr-1' });
    const payload = errorSpy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(payload.invoiceId).toBe('I1');
    expect(payload.userId).toBe('U1');
  });

  it('uses warn for 4xx and custom publicMessage', () => {
    const req = mockReq();
    const res = mockRes();
    handleApiError(req, res, new Error('bad'), 'Validation failed', {
      status: 400,
      publicMessage: 'Invalid input',
    });
    expect(warnSpy).toHaveBeenCalled();
    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid input', correlationId: 'corr-1' });
  });

  it('supports fatal level and skipLog', () => {
    const req = mockReq();
    const res = mockRes();
    handleApiError(req, res, new Error('x'), 'fatal', { level: 'fatal' });
    expect(fatalSpy).toHaveBeenCalled();

    errorSpy.mockClear();
    const res2 = mockRes();
    handleApiError(req, res2, new Error('y'), 'skipped', { skipLog: true });
    expect(errorSpy).not.toHaveBeenCalled();
    expect(res2.statusCode).toBe(500);
  });

  it('does not write body when headers already sent', () => {
    const req = mockReq();
    const res = mockRes();
    res.headersSent = true;
    const out = handleApiError(req, res, new Error('x'));
    expect(out).toBe(res);
    expect(res.body).toBeUndefined();
  });
});

describe('logAuthEvent', () => {
  it('strips password/token and redacts email to domain', () => {
    const spy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    logAuthEvent('Login failed', mockReq(), {
      password: 'secret',
      token: 'abc',
      accessToken: 'a',
      refreshToken: 'r',
      email: 'user@example.com',
      reason: 'bad_password',
    });
    const ctx = spy.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(ctx.password).toBeUndefined();
    expect(ctx.token).toBeUndefined();
    expect(ctx.email).toBeUndefined();
    expect(ctx.emailDomain).toBe('example.com');
    expect(ctx.reason).toBe('bad_password');
    spy.mockRestore();
  });

  it('supports info/error levels', () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const error = vi.spyOn(logger, 'error').mockImplementation(() => {});
    logAuthEvent('ok', mockReq(), {}, 'info');
    logAuthEvent('bad', mockReq(), {}, 'error');
    expect(info).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    info.mockRestore();
    error.mockRestore();
  });
});

describe('logSlowOperation', () => {
  it('logs only when over threshold and merges request context', () => {
    const spy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    logSlowOperation('query', 100, 200);
    expect(spy).not.toHaveBeenCalled();
    runWithRequestContext({ correlationId: 'c1', tenantId: 'T1' }, () => {
      logSlowOperation('query', 250, 200, { sql: 'SELECT 1' });
    });
    expect(spy).toHaveBeenCalledWith(
      'Slow query',
      expect.objectContaining({ durationMs: 250, thresholdMs: 200, correlationId: 'c1', sql: 'SELECT 1' }),
    );
    spy.mockRestore();
  });
});
