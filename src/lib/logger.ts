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
/** Survives Cap WebView process death (sessionStorage does not). */
const RING_STORAGE_KEY = 'dg_client_log_ring';
const BREADCRUMB_KEY = 'dg_bug_breadcrumbs';
let ringHydrated = false;

function durableStorage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined' || typeof localStorage.getItem !== 'function') return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readStoredLines(key: string, max: number): string[] {
  try {
    const raw = durableStorage()?.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const out: string[] = [];
    for (const line of parsed.slice(-max)) {
      if (typeof line === 'string') out.push(line);
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Merge write-through localStorage into memory (safe to call repeatedly).
 * Disk order wins; append any in-memory-only lines not yet persisted.
 */
function mergeLinesFromStorage(mem: string[], key: string, max: number): void {
  const fromDisk = readStoredLines(key, max);
  if (fromDisk.length === 0) return;
  const seen = new Set(fromDisk);
  const merged = [...fromDisk];
  for (const line of mem) {
    if (!seen.has(line)) {
      merged.push(line);
      seen.add(line);
    }
  }
  mem.length = 0;
  mem.push(...merged.slice(-max));
}

function hydrateRingIfNeeded(): void {
  if (ringHydrated) return;
  ringHydrated = true;
  if (ring.length > 0) return;
  ring.push(...readStoredLines(RING_STORAGE_KEY, RING_MAX));
}

function persistRing(): void {
  try {
    durableStorage()?.setItem(RING_STORAGE_KEY, JSON.stringify(ring));
  } catch {
    /* private mode / quota */
  }
}

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
  hydrateRingIfNeeded();
  ring.push(line);
  if (ring.length > RING_MAX) ring.splice(0, ring.length - RING_MAX);
  persistRing();
}

/**
 * Recent log lines for bug reports (newest last). No secrets — already redacted.
 * Always merges localStorage write-through so Share/Generate never misses lines
 * after an early empty hydrate (Cap onboarding before full app shell).
 */
export function getRecentClientLogs(limit = 40): string[] {
  hydrateRingIfNeeded();
  mergeLinesFromStorage(ring, RING_STORAGE_KEY, RING_MAX);
  return ring.slice(-Math.max(1, limit));
}

const BREADCRUMB_MAX = 20;
const breadcrumbs: string[] = [];
let breadcrumbsHydrated = false;

function hydrateBreadcrumbsIfNeeded(): void {
  if (breadcrumbsHydrated) return;
  breadcrumbsHydrated = true;
  if (breadcrumbs.length > 0) return;
  breadcrumbs.push(...readStoredLines(BREADCRUMB_KEY, BREADCRUMB_MAX));
}

function persistBreadcrumbs(): void {
  try {
    durableStorage()?.setItem(BREADCRUMB_KEY, JSON.stringify(breadcrumbs));
  } catch {
    /* private mode / quota — in-memory trail still works this session */
  }
}

/**
 * Write-through breadcrumb trail (memory + localStorage) so Cap WhatsApp/PDF steps
 * survive WebView process death. Used by manual + unexpected-stop bug reports.
 */
export function pushClientBreadcrumb(message: string, context?: Record<string, unknown>): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    msg: message,
    ...(redact(context || {}) as Record<string, unknown>),
  });
  hydrateBreadcrumbsIfNeeded();
  breadcrumbs.push(line);
  if (breadcrumbs.length > BREADCRUMB_MAX) breadcrumbs.splice(0, breadcrumbs.length - BREADCRUMB_MAX);
  persistBreadcrumbs();
}

/** Breadcrumbs for bug reports (newest last). Always merges localStorage write-through. */
export function getClientBreadcrumbs(limit = 20): string[] {
  hydrateBreadcrumbsIfNeeded();
  mergeLinesFromStorage(breadcrumbs, BREADCRUMB_KEY, BREADCRUMB_MAX);
  return breadcrumbs.slice(-Math.max(1, limit));
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
