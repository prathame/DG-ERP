/**
 * Stable 32-hex device id for 1:1 license bind (same format as on-prem machineId).
 */
const STORAGE_KEY = 'dg_sm_device_id';

function toHex32(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export async function getOrCreateDeviceId(): Promise<string> {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
  } catch {
    /* private mode */
  }

  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  const id = toHex32(bytes);
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}
