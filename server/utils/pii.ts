/**
 * PII redaction for logs and audit trails.
 * Never send raw emails/phones/tokens to Logtail or stdout.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\b(?:\+?91[\s-]*)?[6-9]\d{9}\b/g;
const JWT_RE = /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._-]+/gi;
const PASSWORD_ASSIGN_RE = /(password|passwd|pwd|secret|token)\s*[:=]\s*["']?[^"'\s,;}]+/gi;

export function redactPii(input: string): string {
  return input
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, '[REDACTED_PHONE]')
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(JWT_RE, '[REDACTED_TOKEN]')
    .replace(PASSWORD_ASSIGN_RE, '$1=[REDACTED]');
}

/** Deep-redact string values in log context objects. */
export function redactContext(ctx?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!ctx) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (typeof v === 'string') out[k] = redactPii(v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = redactContext(v as Record<string, unknown>);
    else if (Array.isArray(v)) out[k] = v.map((item) => (typeof item === 'string' ? redactPii(item) : item));
    else out[k] = v;
  }
  return out;
}

/** Safe error message for console — strips PII that Postgres may embed. */
export function safeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return redactPii(msg);
}
