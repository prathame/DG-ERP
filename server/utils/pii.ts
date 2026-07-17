/**
 * PII / secret redaction for logs and audit trails.
 * Never send passwords, OTP, JWTs, cards, or raw emails/phones to Logtail or stdout.
 */

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE = /\b(?:\+?91[\s-]*)?[6-9]\d{9}\b/g;
const JWT_RE = /\b[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
const BEARER_RE = /Bearer\s+[A-Za-z0-9._-]+/gi;
const PASSWORD_ASSIGN_RE = /(password|passwd|pwd|secret|token|otp|cvv|api[_-]?key)\s*[:=]\s*["']?[^"'\s,;}]+/gi;

/** Context keys whose values are always redacted entirely. */
const SENSITIVE_KEYS = new Set([
  'password',
  'passwd',
  'pwd',
  'otp',
  'pin',
  'cvv',
  'cvc',
  'cardnumber',
  'card_number',
  'creditcard',
  'credit_card',
  'accesstoken',
  'access_token',
  'refreshtoken',
  'refresh_token',
  'idtoken',
  'id_token',
  'authorization',
  'cookie',
  'cookies',
  'session',
  'sessionsecret',
  'session_secret',
  'jwtsecret',
  'jwt_secret',
  'privatekey',
  'private_key',
  'secret',
  'clientsecret',
  'client_secret',
  'apikey',
  'api_key',
  'apisecret',
  'api_secret',
  'password_hash',
  'passwordhash',
]);

function isSensitiveKey(key: string): boolean {
  const norm = key.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (SENSITIVE_KEYS.has(norm)) return true;
  if (/(password|secret|token|otp|cvv|private.?key|api.?key)/i.test(key)) return true;
  return false;
}

export function redactPii(input: string): string {
  return input
    .replace(EMAIL_RE, '[REDACTED_EMAIL]')
    .replace(PHONE_RE, '[REDACTED_PHONE]')
    .replace(BEARER_RE, 'Bearer [REDACTED]')
    .replace(JWT_RE, '[REDACTED_TOKEN]')
    .replace(PASSWORD_ASSIGN_RE, '$1=[REDACTED]');
}

/** Deep-redact string values and sensitive keys in log context objects. */
export function redactContext(ctx?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!ctx) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (isSensitiveKey(k)) {
      out[k] = '[REDACTED]';
      continue;
    }
    if (typeof v === 'string') out[k] = redactPii(v);
    else if (v && typeof v === 'object' && !Array.isArray(v)) out[k] = redactContext(v as Record<string, unknown>);
    else if (Array.isArray(v)) out[k] = v.map(item => (typeof item === 'string' ? redactPii(item) : item));
    else out[k] = v;
  }
  return out;
}

/** Safe error message for console — strips PII that Postgres may embed. */
export function safeErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return redactPii(msg);
}
