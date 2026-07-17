/**
 * Lightweight offline mutation queue for the mobile app.
 * Stores failed write requests and retries when connectivity returns.
 */

export type OfflineMutation = {
  id: string;
  path: string;
  method: string;
  body?: string;
  headers?: Record<string, string>;
  createdAt: string;
  label?: string;
};

const KEY = 'dg_offline_queue_v1';
const MAX = 100;
const SENSITIVE_HEADER = /^(authorization|x-tenant-id)$/i;

/** Drop auth headers — flush rebinds a fresh session token (never persist JWTs). */
function sanitizeHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    if (SENSITIVE_HEADER.test(k)) continue;
    out[k] = v;
  }
  return Object.keys(out).length ? out : undefined;
}

function read(): OfflineMutation[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineMutation[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function write(items: OfflineMutation[]) {
  localStorage.setItem(KEY, JSON.stringify(items.slice(-MAX)));
  window.dispatchEvent(new CustomEvent('dg-offline-queue', { detail: { count: items.length } }));
}

export function getOfflineQueue(): OfflineMutation[] {
  return read();
}

export function offlineQueueCount(): number {
  return read().length;
}

function dedupeKey(m: Pick<OfflineMutation, 'method' | 'path' | 'body'>): string {
  return `${m.method}|${m.path}|${m.body ?? ''}`;
}

/** Enqueue a write. Identical method/path/body replaces the previous pending entry (no duplicates). */
export function enqueueOfflineMutation(m: Omit<OfflineMutation, 'id' | 'createdAt'>): OfflineMutation {
  const item: OfflineMutation = {
    ...m,
    headers: sanitizeHeaders(m.headers),
    id: `OQ${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  const key = dedupeKey(item);
  const next = read().filter((x) => dedupeKey(x) !== key);
  next.push(item);
  write(next);
  return item;
}

export function removeOfflineMutation(id: string) {
  write(read().filter((x) => x.id !== id));
}

export function clearOfflineQueue() {
  write([]);
}

/** Flush queue using fetch. Returns number synced. */
export async function flushOfflineQueue(
  fetchFn: typeof fetch = fetch,
): Promise<{ synced: number; failed: number }> {
  const items = read();
  let synced = 0;
  let failed = 0;
  for (const item of items) {
    try {
      const res = await fetchFn(item.path, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
          ...(item.headers || {}),
        },
        body: item.body,
      });
      if (!res.ok) {
        // Drop permanent client errors so a bad payload cannot block the queue forever
        if (res.status >= 400 && res.status < 500 && res.status !== 401 && res.status !== 429) {
          removeOfflineMutation(item.id);
        }
        failed++;
        continue;
      }
      removeOfflineMutation(item.id);
      synced++;
    } catch {
      failed++;
      break; // still offline — stop
    }
  }
  return { synced, failed };
}
