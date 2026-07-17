/**
 * Production-grade structured logger for DG-ERP.
 *
 * - JSON lines to stdout (ELK / Loki / CloudWatch friendly)
 * - Optional Better Stack Logtail sink
 * - AsyncLocalStorage request context (correlationId, userId, tenantId, …)
 * - PII / secret redaction via pii.ts
 * - Levels: trace | debug | info | warn | error | fatal
 */

import { AsyncLocalStorage } from 'node:async_hooks';
import { hostname } from 'node:os';
import { Logtail } from '@logtail/node';
import { redactContext, redactPii } from './pii';

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

export interface RequestLogContext {
  requestId?: string;
  correlationId?: string;
  traceId?: string;
  userId?: string;
  tenantId?: string;
  organizationId?: string;
  method?: string;
  path?: string;
  url?: string;
  ip?: string;
  userAgent?: string;
  service?: string;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
  fatal: 60,
};

const SERVICE_NAME = process.env.SERVICE_NAME || 'dg-erp-api';
const HOST = hostname();
const ENV = process.env.NODE_ENV || 'development';
const VERSION = process.env.npm_package_version || process.env.APP_VERSION || 'unknown';
const IS_TEST = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

function resolveMinLevel(): LogLevel {
  const raw = (process.env.LOG_LEVEL || '').toLowerCase() as LogLevel;
  if (raw && raw in LEVEL_ORDER) return raw;
  if (IS_TEST) return 'warn';
  if (IS_PRODUCTION) return 'info';
  return 'debug';
}

let minLevel: LogLevel = resolveMinLevel();

const LOGTAIL_TOKEN = process.env.LOGTAIL_TOKEN;
const logtail = LOGTAIL_TOKEN ? new Logtail(LOGTAIL_TOKEN) : null;

if (logtail && !IS_TEST) {
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'Logtail connected',
      service: SERVICE_NAME,
      ts: new Date().toISOString(),
    }),
  );
}

/** Per-request context store — set by request logging middleware. */
export const requestContext = new AsyncLocalStorage<RequestLogContext>();

export function getRequestContext(): RequestLogContext {
  return requestContext.getStore() ?? {};
}

export function runWithRequestContext<T>(ctx: RequestLogContext, fn: () => T): T {
  return requestContext.run(ctx, fn);
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_ORDER[level] >= LEVEL_ORDER[minLevel];
}

export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    const out: Record<string, unknown> = {
      name: err.name,
      message: redactPii(err.message),
      stack: err.stack ? redactPii(err.stack) : undefined,
    };
    if ('cause' in err && err.cause !== undefined) {
      out.cause = serializeError(err.cause);
    }
    const code = (err as NodeJS.ErrnoException).code;
    if (code) out.code = code;
    return out;
  }
  return { message: redactPii(String(err)) };
}

function normalizeContext(context?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!context) return undefined;
  const copy: Record<string, unknown> = { ...context };
  if (copy.error !== undefined) {
    copy.error =
      copy.error instanceof Error || typeof copy.error !== 'object' || copy.error === null
        ? serializeError(copy.error)
        : redactContext(copy.error as Record<string, unknown>);
  }
  if (copy.err !== undefined) {
    copy.error = serializeError(copy.err);
    delete copy.err;
  }
  if (typeof copy.stack === 'string') {
    copy.stack = redactPii(copy.stack);
  }
  return redactContext(copy);
}

function emit(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  if (!shouldLog(level)) return;

  const safeMsg = redactPii(message);
  const req = getRequestContext();
  const safeCtx =
    normalizeContext({
      service: SERVICE_NAME,
      hostname: HOST,
      environment: ENV,
      version: VERSION,
      ...req,
      ...context,
    }) ?? {};

  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: safeMsg,
    ...safeCtx,
  };

  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'fatal') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }

  if (logtail) {
    const ltCtx = { ...safeCtx, level };
    if (level === 'error' || level === 'fatal') logtail.error(safeMsg, ltCtx);
    else if (level === 'warn') logtail.warn(safeMsg, ltCtx);
    else logtail.info(safeMsg, ltCtx);
  }
}

export interface Logger {
  trace(message: string, context?: Record<string, unknown>): void;
  debug(message: string, context?: Record<string, unknown>): void;
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
  fatal(message: string, context?: Record<string, unknown>): void;
  /** Log an Error with full stack + optional extras. */
  exception(message: string, err: unknown, context?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): Logger;
  flush(): Promise<void> | undefined;
  setLevel(level: LogLevel): void;
}

function createLogger(bindings: Record<string, unknown> = {}): Logger {
  const withBindings = (ctx?: Record<string, unknown>) => ({ ...bindings, ...ctx });

  return {
    trace: (msg, ctx) => emit('trace', msg, withBindings(ctx)),
    debug: (msg, ctx) => emit('debug', msg, withBindings(ctx)),
    info: (msg, ctx) => emit('info', msg, withBindings(ctx)),
    warn: (msg, ctx) => emit('warn', msg, withBindings(ctx)),
    error: (msg, ctx) => emit('error', msg, withBindings(ctx)),
    fatal: (msg, ctx) => emit('fatal', msg, withBindings(ctx)),
    exception(message, err, context) {
      const errObj = serializeError(err);
      emit(
        'error',
        message,
        withBindings({
          ...context,
          error: errObj,
          stack: errObj.stack,
        }),
      );
    },
    child(childBindings) {
      return createLogger({ ...bindings, ...childBindings });
    },
    flush() {
      return logtail?.flush();
    },
    setLevel(level) {
      minLevel = level;
    },
  };
}

export const logger = createLogger();

/** Capture caller location (file, function, line) for error logs. */
export function captureCaller(skipFrames = 2): { file?: string; function?: string; line?: number } {
  const stack = new Error().stack;
  if (!stack) return {};
  const lines = stack.split('\n').slice(skipFrames + 1);
  for (const line of lines) {
    const withFn = line.match(/^\s*at\s+(.+?)\s+\((.+):(\d+):(\d+)\)$/);
    if (withFn) {
      const fn = withFn[1];
      const file = withFn[2]?.replace(/^file:\/\//, '');
      const lineNum = parseInt(withFn[3]!, 10);
      if (file?.includes('node_modules') || file?.includes('node:internal')) continue;
      if (file?.includes('/utils/logger.') || file?.includes('/utils/http-error.')) continue;
      return { file, function: fn, line: lineNum };
    }
    const bare = line.match(/^\s*at\s+(.+):(\d+):(\d+)$/);
    if (bare) {
      const file = bare[1]?.replace(/^file:\/\//, '');
      const lineNum = parseInt(bare[2]!, 10);
      if (file?.includes('node_modules') || file?.includes('node:internal')) continue;
      if (file?.includes('/utils/logger.') || file?.includes('/utils/http-error.')) continue;
      return { file, line: lineNum };
    }
  }
  return {};
}
