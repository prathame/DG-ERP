/**
 * Encrypted local storage for license key and cached activation data.
 * Uses AES-256-GCM (authenticated encryption) with a random per-install key
 * stored in userData — prevents offline expiry tampering.
 */
import { app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';

const STORE_FILE  = path.join(app.getPath('userData'), 'license.dat');
const SECRET_FILE = path.join(app.getPath('userData'), 'install.key');

// Random 32-byte key generated once per install, never derived from guessable data
function getInstallKey(): Buffer {
  if (fs.existsSync(SECRET_FILE)) {
    const raw = fs.readFileSync(SECRET_FILE);
    if (raw.length === 32) return raw;
  }
  const key = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_FILE, key, { mode: 0o600 });
  return key;
}

function encrypt(text: string): string {
  const key = getInstallKey();
  const iv  = crypto.randomBytes(12); // GCM standard IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // iv(12) + tag(16) + ciphertext — all hex, colon-separated
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

function decrypt(data: string): string {
  const parts = data.split(':');
  if (parts.length !== 3) throw new Error('invalid store format');
  const [ivHex, tagHex, encHex] = parts;
  const key = getInstallKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(encHex, 'hex')), decipher.final()]).toString('utf8');
}

export interface LicenseData {
  licenseKey: string;
  companyName: string;
  businessType: string;
  maxUsers: number;
  validUntil: string | null;
  adminEmail: string | null;
  slug: string;
  activatedAt: string;
  lastValidated: string;
}

export function saveLicense(data: LicenseData): void {
  // ponytail: 0o600 = owner read/write only
  fs.writeFileSync(STORE_FILE, encrypt(JSON.stringify(data)), { encoding: 'utf8', mode: 0o600 });
}

export function loadLicense(): LicenseData | null {
  try {
    if (!fs.existsSync(STORE_FILE)) return null;
    const raw = fs.readFileSync(STORE_FILE, 'utf8');
    return JSON.parse(decrypt(raw)) as LicenseData;
  } catch {
    return null; // tampered or missing — treat as no license
  }
}

export function clearLicense(): void {
  if (fs.existsSync(STORE_FILE)) fs.unlinkSync(STORE_FILE);
}

export function getMachineId(): string {
  return crypto.createHash('sha256')
    .update(`${os.hostname()}-${os.platform()}-${os.cpus()[0]?.model || 'cpu'}`)
    .digest('hex').slice(0, 32);
}
