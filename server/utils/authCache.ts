/**
 * Short-TTL cache for per-request auth revalidation (users JOIN tenants).
 * Keyed by userId:tenantId:iat so password-change (new iat) and demotions
 * refresh within TTL without weakening password_changed_at checks.
 */

export type CachedAuthRow = {
  password_changed_at: Date | null;
  role: string;
  vendor_id: string | null;
  permissions: unknown;
  status: string;
  subscription_ends_at: string | null;
  trial_ends_at: string | null;
};

const TTL_MS = 30_000;
const MAX_ENTRIES = 5_000;

type Entry = { row: CachedAuthRow; cachedAt: number };

const cache = new Map<string, Entry>();

function cacheKey(userId: string, tenantId: string, iat: number | undefined): string {
  return `${userId}:${tenantId}:${iat ?? 0}`;
}

export function getCachedAuth(
  userId: string,
  tenantId: string,
  iat: number | undefined
): CachedAuthRow | null {
  const key = cacheKey(userId, tenantId, iat);
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.row;
}

export function setCachedAuth(
  userId: string,
  tenantId: string,
  iat: number | undefined,
  row: CachedAuthRow
): void {
  if (cache.size >= MAX_ENTRIES) {
    const now = Date.now();
    for (const [k, v] of cache) {
      if (now - v.cachedAt > TTL_MS) cache.delete(k);
    }
    if (cache.size >= MAX_ENTRIES) {
      const first = cache.keys().next().value;
      if (first !== undefined) cache.delete(first);
    }
  }
  cache.set(cacheKey(userId, tenantId, iat), { row, cachedAt: Date.now() });
}

/** Clear cached rows for a user (e.g. after password change). */
export function invalidateAuthCache(userId: string, tenantId: string): void {
  const prefix = `${userId}:${tenantId}:`;
  for (const k of cache.keys()) {
    if (k.startsWith(prefix)) cache.delete(k);
  }
}

/** Test helper — wipe cache between tests. */
export function clearAuthCache(): void {
  cache.clear();
}
