import { describe, it, expect } from 'vitest';
import { readIdempotencyKey } from '../../server/utils/idempotency';
import type { Request } from 'express';

function fakeReq(partial: { headers?: Record<string, string>; body?: unknown }): Request {
  return { headers: partial.headers || {}, body: partial.body } as Request;
}

describe('readIdempotencyKey', () => {
  it('reads Idempotency-Key header', () => {
    expect(readIdempotencyKey(fakeReq({ headers: { 'idempotency-key': ' abc-123 ' } }))).toBe('abc-123');
  });

  it('falls back to body.idempotencyKey', () => {
    expect(readIdempotencyKey(fakeReq({ body: { idempotencyKey: 'body-key' } }))).toBe('body-key');
  });

  it('prefers header over body', () => {
    expect(
      readIdempotencyKey(fakeReq({ headers: { 'idempotency-key': 'header' }, body: { idempotencyKey: 'body' } })),
    ).toBe('header');
  });

  it('returns null when missing', () => {
    expect(readIdempotencyKey(fakeReq({}))).toBeNull();
  });

  it('truncates to 128 chars', () => {
    const long = 'x'.repeat(200);
    expect(readIdempotencyKey(fakeReq({ headers: { 'idempotency-key': long } }))?.length).toBe(128);
  });
});
