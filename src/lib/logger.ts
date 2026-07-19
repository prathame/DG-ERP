/**
 * Frontend structured logger.
 * - Dev: console with level
 * - Prod: console + in-memory ring buffer (for bug reports)
 * Never logs passwords, tokens, or other secrets.
 */

export type ClientLogLevel = 'debug' | 'info' | 'warn' | 'error';

const SENSITIVE_KEY =
  /^(password|passwd|pwd|otp|token|accessToken|refreshToken|authorization|cookie|secret|cvv|cardNumber)$/i;

const RING_MAX = 80;
const ring: string[] = [];

function redact(value: unknown): unknown {
  if (typeof value === 'string') {
    if (/Bearer\s+\S+/i.test(value)) return value.replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
    if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value)) return '[REDACTED_TOKEN]';
    return value;
  }
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEY.test(k) ? '[REDACTED]' : redact(v);
    }
    return out;
  }
  return value;
}

function correlationFromSession(): string | undefined {
  try {
    return sessionStorage.getItem('dg_correlation_id') || undefined;
  } catch {
    return undefined;
  }
}

export function ensureCorrelationId(): string {
  try {
    let id = sessionStorage.getItem('dg_correlation_id');
    if (!id) {
      id = crypto.randomUUID();
      sessionStorage.setItem('dg_correlation_id', id);
    }
    return id;
  } catch {
    return crypto.randomUUID();
  }
}

function baseContext(): Record<string, unknown> {
  return {
    service: 'dg-erp-web',
    environment: import.meta.env.MODE,
    url: typeof location !== 'undefined' ? location.pathname : undefined,
    correlationId: correlationFromSession(),
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : undefined,
  };
}

function pushRing(line: string): void {
  ring.push(line);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
}

/** Recent log lines for bug reports (newest last). No secrets — already redacted. */
export function getRecentClientLogs(limit = 40): string[] {
  return ring.slice(-Math.max(1, limit));
}

function emit(level: ClientLogLevel, message: string, context?: Record<string, unknown>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...baseContext(),
    ...(redact(context || {}) as Record<string, unknown>),
  };

  const line = JSON.stringify(entry);
  if (level !== 'debug' || import.meta.env.DEV) {
    pushRing(line);
  }
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug' && import.meta.env.DEV) console.debug(line);
  else if (level !== 'debug') console.info(line);
}

export const clientLogger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => emit('debug', msg, ctx),
  info: (msg: string, ctx?: Record<string, unknown>) => emit('info', msg, ctx),
  warn: (msg: string, ctx?: Record<string, unknown>) => emit('warn', msg, ctx),
  error: (msg: string, ctx?: Record<string, unknown>) => emit('error', msg, ctx),
  exception(message: string, err: unknown, context?: Record<string, unknown>) {
    const error =
      err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : { message: String(err) };
    emit('error', message, { ...context, error, stack: error.stack });
  },
};

/** Install global window error + unhandledrejection handlers (call once from main.tsx). */
export function installGlobalErrorHandlers(): void {
  ensureCorrelationId();
  window.addEventListener('error', event => {
    clientLogger.exception('Unhandled window error', event.error || event.message, {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  });
  window.addEventListener('unhandledrejection', event => {
    clientLogger.exception('Unhandled promise rejection', event.reason);
  });
}
