import { describe, expect, it } from 'vitest';
import { hashResetToken } from '../../server/utils/helpers';

describe('password reset tokens', () => {
  it('stores a one-way deterministic digest instead of the raw token', () => {
    const token = 'reset-token-test';
    expect(hashResetToken(token)).toHaveLength(64);
    expect(hashResetToken(token)).toMatch(/^[a-f0-9]+$/);
    expect(hashResetToken(token)).not.toBe(token);
    expect(hashResetToken(token)).toBe(hashResetToken(token));
  });
});
