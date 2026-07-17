/**
 * Unit tests for at-rest secret crypto + GST helpers (no HTTP / NIC network).
 */
import { describe, it, expect, beforeAll } from 'vitest';

beforeAll(() => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for tests');
  }
});

describe('secret-crypto', () => {
  it('round-trips plaintext', async () => {
    const { encryptSecret, decryptSecret } = await import('../../server/utils/secret-crypto');
    const enc = encryptSecret('nic-password-xyz');
    expect(enc.startsWith('enc:v1:')).toBe(true);
    expect(decryptSecret(enc)).toBe('nic-password-xyz');
  });

  it('passes through legacy plaintext', async () => {
    const { decryptSecret } = await import('../../server/utils/secret-crypto');
    expect(decryptSecret('old-plain')).toBe('old-plain');
  });

  it('empty stays empty', async () => {
    const { encryptSecret, decryptSecret } = await import('../../server/utils/secret-crypto');
    expect(encryptSecret('')).toBe('');
    expect(decryptSecret('')).toBe('');
  });
});

describe('gst helpers', () => {
  it('isValidPin', async () => {
    const { isValidPin } = await import('../../server/services/nic-api');
    expect(isValidPin('380001')).toBe(true);
    expect(isValidPin('12')).toBe(false);
    expect(isValidPin('')).toBe(false);
  });

  it('resolveSupplyType B2B vs B2C', async () => {
    const { resolveSupplyType } = await import('../../server/services/nic-api');
    expect(resolveSupplyType('24AAAPZ9999G1ZI')).toBe('B2B');
    expect(resolveSupplyType('')).toBe('B2C');
    expect(resolveSupplyType('URP')).toBe('B2C');
  });

  it('getGstnPublicKey fails closed without PEM', async () => {
    const { getGstnPublicKey } = await import('../../server/services/nic-api');
    delete process.env.GSTN_SANDBOX_PUBLIC_KEY;
    delete process.env.GSTN_PRODUCTION_PUBLIC_KEY;
    delete process.env.GSTN_PUBLIC_KEY;
    expect(() => getGstnPublicKey('sandbox')).toThrow(/crypto not configured/i);
    expect(() => getGstnPublicKey('mock')).not.toThrow();
  });
});
