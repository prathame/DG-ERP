/**
 * At-rest encryption for sensitive tenant secrets (NIC GST password/client_secret).
 * Prefer SECRETS_ENCRYPTION_KEY; fall back to JWT_SECRET for legacy installs.
 * Values prefixed with enc:v1: so plaintext legacy rows still load.
 */
import crypto from 'crypto';

const PREFIX = 'enc:v1:';

function deriveKey(material: string): Buffer {
  return crypto.createHash('sha256').update(`dhandho-secret-v1:${material}`).digest();
}

/** Prefer dedicated secrets key; JWT_SECRET kept for backward compatibility. */
function candidateKeys(): Buffer[] {
  const keys: Buffer[] = [];
  const dedicated = process.env.SECRETS_ENCRYPTION_KEY?.trim();
  const jwt = process.env.JWT_SECRET?.trim();
  if (dedicated) keys.push(deriveKey(dedicated));
  if (jwt) keys.push(deriveKey(jwt));
  return keys;
}

function primaryKey(): Buffer {
  const keys = candidateKeys();
  if (!keys.length) throw new Error('JWT_SECRET or SECRETS_ENCRYPTION_KEY required for secret encryption');
  return keys[0];
}

/** Encrypt plaintext. Empty string stays empty. */
export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', primaryKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

/** Decrypt enc:v1:… (tries SECRETS_ENCRYPTION_KEY then JWT_SECRET) or return legacy plaintext. */
export function decryptSecret(stored: string): string {
  if (!stored) return stored;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const body = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Corrupt encrypted secret');
  const keys = candidateKeys();
  if (!keys.length) throw new Error('JWT_SECRET or SECRETS_ENCRYPTION_KEY required for secret encryption');
  let lastErr: unknown;
  for (const key of keys) {
    try {
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
      return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Corrupt encrypted secret');
}
