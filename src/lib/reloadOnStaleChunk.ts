/** One reload after deploy when a lazy tab chunk hash no longer exists. */

const RELOAD_AT_KEY = 'dg_stale_chunk_reload_at';
const RELOAD_COOLDOWN_MS = 30_000;

export function isStaleChunkError(err: unknown): boolean {
  const name = err instanceof Error ? err.name : '';
  const msg = err instanceof Error ? err.message : String(err ?? '');
  return (
    name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /Loading chunk [\d]+ failed/i.test(msg) ||
    /Unexpected token '<'/i.test(msg)
  );
}

async function clearStaleClientCaches(): Promise<void> {
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch {
    /* ignore */
  }
  try {
    const regs = await navigator.serviceWorker?.getRegistrations?.();
    await Promise.all((regs || []).map(r => r.unregister()));
  } catch {
    /* ignore */
  }
}

/** Returns true if a reload was triggered. */
export async function reloadOnceOnStaleChunk(err: unknown): Promise<boolean> {
  if (!isStaleChunkError(err)) return false;
  try {
    const last = Number(sessionStorage.getItem(RELOAD_AT_KEY) || 0);
    if (last && Date.now() - last < RELOAD_COOLDOWN_MS) return false;
    sessionStorage.setItem(RELOAD_AT_KEY, String(Date.now()));
  } catch {
    /* private mode — still try reload */
  }
  await clearStaleClientCaches();
  window.location.reload();
  return true;
}

/** Manual recovery (ErrorBoundary button). */
export async function hardReloadApp(): Promise<void> {
  try {
    sessionStorage.removeItem(RELOAD_AT_KEY);
  } catch {
    /* ignore */
  }
  await clearStaleClientCaches();
  window.location.reload();
}
