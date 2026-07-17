/**
 * Encrypt/decrypt local DB dumps for user-owned backup files.
 * Key material: PBKDF2(licenseKey) — restore on a new phone with the same DG-SM- key.
 * Files stay on the staff device / their Gmail — we do not store them.
 */

function b64(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]!);
  return btoa(s);
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(licenseKey: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(`dhandho-sm-backup::${licenseKey}`),
    'PBKDF2',
    false,
    ['deriveKey'],
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: new TextEncoder().encode('dhandho-service-mobile-backup-v2'),
      iterations: 120_000,
      hash: 'SHA-256',
    },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptBackup(
  plaintext: Uint8Array,
  licenseKey: string,
): Promise<{ ciphertext: string; nonce: string; wrap: string }> {
  const key = await deriveKey(licenseKey);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, key, plaintext as BufferSource);
  return {
    ciphertext: b64(ct),
    nonce: b64(nonce),
    wrap: 'pbkdf2-aes-gcm-v2-license',
  };
}

export async function decryptBackup(ciphertextB64: string, nonceB64: string, licenseKey: string): Promise<Uint8Array> {
  const key = await deriveKey(licenseKey);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: fromB64(nonceB64) as BufferSource },
    key,
    fromB64(ciphertextB64) as BufferSource,
  );
  return new Uint8Array(pt);
}
