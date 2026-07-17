/**
 * Shared API error handler — replaces ad-hoc console.error + generic 500 responses.
 * Always logs the original exception with request/user context; never swallows errors.
 */

import type { Request, Response } from 'express';
import { captureCaller, getRequestContext, logger, serializeError } from './logger';
import { safeErrorMessage } from './pii';

export interface ApiErrorOptions {
  /** HTTP status (default 500). */
  status?: number;
  /** Client-safe message (default "Internal server error"). */
  publicMessage?: string;
  /** Extra structured fields (resource ids, etc.). Never put secrets here. */
  context?: Record<string, unknown>;
  /** When true, skip logging (caller already logged). */
  skipLog?: boolean;
  /** Log level override (default error for 5xx, warn for 4xx). */
  level?: 'warn' | 'error' | 'fatal';
}

type ReqWithMeta = Request & {
  correlationId?: string;
  user?: { userId?: string; tenantId?: string; role?: string };
  tenantId?: string;
};

function extractRequestMeta(req: Request): Record<string, unknown> {
  const r = req as ReqWithMeta;
  const correlationId = r.correlationId || (req.headers['x-correlation-id'] as string | undefined);
  const userId = r.user?.userId;
  const tenantId = r.tenantId || r.user?.tenantId || (req.headers['x-tenant-id'] as string | undefined);
  return {
    requestId: correlationId,
    correlationId,
    method: req.method,
    url: req.originalUrl?.replace(/([?&](?:token|access_token|refresh_token|password|otp)=)[^&]+/gi, '$1[REDACTED]'),
    path: req.path,
    userId,
    tenantId,
    role: r.user?.role,
    ip: req.ip || req.socket?.remoteAddress,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'].slice(0, 200) : undefined,
    statusCode: undefined as number | undefined,
  };
}

/**
 * Log + respond for a failed route handler.
 * Prefer: `} catch (err) { return handleApiError(req, res, err, 'Failed to create invoice', { context: { invoiceId } }); }`
 */
export function handleApiError(
  req: Request,
  res: Response,
  err: unknown,
  message = 'Request failed',
  options: ApiErrorOptions = {},
): Response {
  const status = options.status ?? 500;
  const publicMessage = options.publicMessage ?? (status >= 500 ? 'Internal server error' : safeErrorMessage(err));
  const correlationId =
    (req as ReqWithMeta).correlationId ||
    (typeof req.headers['x-correlation-id'] === 'string' ? req.headers['x-correlation-id'] : undefined);

  if (!options.skipLog) {
    const caller = captureCaller(2);
    const errObj = serializeError(err);
    const meta = extractRequestMeta(req);
    meta.statusCode = status;

    const payload = {
      ...meta,
      ...options.context,
      error: errObj,
      stack: errObj.stack,
      cause: errObj.cause,
      file: caller.file,
      function: caller.function,
      line: caller.line,
    };

    const level = options.level ?? (status >= 500 ? 'error' : 'warn');
    if (level === 'fatal') logger.fatal(message, payload);
    else if (level === 'warn') logger.warn(message, payload);
    else logger.error(message, payload);
  }

  if (res.headersSent) return res;

  const body: Record<string, unknown> = { error: publicMessage };
  if (correlationId) body.correlationId = correlationId;
  return res.status(status).json(body);
}

/** Log a security / auth event without sending a response. */
export function logAuthEvent(
  event: string,
  req: Request,
  context?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'warn',
): void {
  const meta = extractRequestMeta(req);
  // Never log passwords, tokens, or full emails in security events
  const safe = { ...meta, ...context };
  delete safe.password;
  delete safe.token;
  delete safe.accessToken;
  delete safe.refreshToken;
  if (typeof safe.email === 'string') {
    // Keep domain only for correlation without full PII
    const at = safe.email.indexOf('@');
    safe.emailDomain = at > 0 ? safe.email.slice(at + 1) : undefined;
    delete safe.email;
  }
  logger[level](event, safe);
}

/** Log slow operation when duration exceeds threshold (ms). */
export function logSlowOperation(
  operation: string,
  durationMs: number,
  thresholdMs: number,
  context?: Record<string, unknown>,
): void {
  if (durationMs < thresholdMs) return;
  logger.warn(`Slow ${operation}`, {
    operation,
    durationMs,
    thresholdMs,
    ...getRequestContext(),
    ...context,
  });
}
