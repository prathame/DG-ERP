import type { Request } from 'express';

/** Read Idempotency-Key header or body.idempotencyKey (max 128 chars). */
export function readIdempotencyKey(req: Request): string | null {
  const header = req.headers['idempotency-key'];
  const fromHeader = typeof header === 'string' ? header.trim() : '';
  const body = req.body as { idempotencyKey?: unknown } | undefined;
  const fromBody = typeof body?.idempotencyKey === 'string' ? body.idempotencyKey.trim() : '';
  const key = fromHeader || fromBody;
  if (!key) return null;
  return key.slice(0, 128);
}
