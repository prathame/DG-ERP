/** Simple JSON cache for offline reads (products, vendors, etc.). */

const PREFIX = 'dg_offline_cache:';
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

type Entry<T> = { ts: number; data: T };

export function cacheSet<T>(key: string, data: T): void {
  try {
    const entry: Entry<T> = { ts: Date.now(), data };
    localStorage.setItem(PREFIX + key, JSON.stringify(entry));
  } catch { /* quota */ }
}

export function cacheGet<T>(key: string, ttlMs = DEFAULT_TTL_MS): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    if (!entry || typeof entry.ts !== 'number') return null;
    if (Date.now() - entry.ts > ttlMs) return null;
    return entry.data;
  } catch {
    return null;
  }
}

export function cacheClear(prefix?: string): void {
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX) && (!prefix || k.includes(prefix))) keys.push(k);
  }
  keys.forEach((k) => localStorage.removeItem(k));
}

/** Drop durable offline GET caches after a write so stale lists are not served. */
export function cacheInvalidateForApiPath(path: string): void {
  const segment = path.replace(/^\//, '').split(/[/?]/)[0] || '';
  if (!segment) {
    cacheClear();
    return;
  }
  cacheClear(segment);
}
