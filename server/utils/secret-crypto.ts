/**
 * At-rest encryption for sensitive tenant secrets (NIC GST password/client_secret).
 * Key derived from JWT_SECRET. Values prefixed with enc:v1: so plaintext legacy rows still load.
 */
import crypto from 'crypto';

const PREFIX = 'enc:v1:';

function keyFromEnv(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET required for secret encryption');
  return crypto.createHash('sha256').update(`dhandho-secret-v1:${secret}`).digest();
}

/** Encrypt plaintext. Empty string stays empty. */
export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromEnv(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

/** Decrypt enc:v1:… or return legacy plaintext unchanged. */
export function decryptSecret(stored: string): string {
  if (!stored) return stored;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const body = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split('.');
  if (!ivB64 || !tagB64 || !dataB64) throw new Error('Corrupt encrypted secret');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromEnv(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
