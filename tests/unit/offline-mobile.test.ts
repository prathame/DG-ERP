/**
 * Unit tests for Capacitor / offline helpers (no HTTP server).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installBrowserShim } from '../helpers/browser-shim';

describe('offline cache', () => {
  let shim: ReturnType<typeof installBrowserShim>;

  beforeEach(() => {
    vi.resetModules();
    shim = installBrowserShim();
  });

  afterEach(() => {
    shim.resetStore();
    vi.unstubAllGlobals();
  });

  it('set/get round-trips', async () => {
    const { cacheSet, cacheGet } = await import('../../src/platforms/mobile/offline/cache');
    cacheSet('T1:/products', [{ id: 'P1', name: 'Pump' }]);
    expect(cacheGet('T1:/products')).toEqual([{ id: 'P1', name: 'Pump' }]);
  });

  it('returns null for missing or expired entries', async () => {
    const { cacheSet, cacheGet } = await import('../../src/platforms/mobile/offline/cache');
    expect(cacheGet('missing')).toBeNull();
    vi.useFakeTimers();
    cacheSet('old', { x: 1 });
    vi.advanceTimersByTime(100);
    expect(cacheGet('old', 50)).toBeNull();
    vi.useRealTimers();
  });

  it('returns null for corrupt JSON', async () => {
    const { cacheGet } = await import('../../src/platforms/mobile/offline/cache');
    shim.localStorage.setItem('dg_offline_cache:bad', '{not-json');
    expect(cacheGet('bad')).toBeNull();
  });

  it('returns null when entry has no numeric ts', async () => {
    const { cacheGet } = await import('../../src/platforms/mobile/offline/cache');
    shim.localStorage.setItem('dg_offline_cache:nots', JSON.stringify({ data: 1 }));
    expect(cacheGet('nots')).toBeNull();
    shim.localStorage.setItem('dg_offline_cache:nullentry', 'null');
    expect(cacheGet('nullentry')).toBeNull();
  });

  it('cacheClear removes by prefix substring', async () => {
    const { cacheSet, cacheGet, cacheClear } = await import('../../src/platforms/mobile/offline/cache');
    cacheSet('T1:/products', [1]);
    cacheSet('T1:/vendors', [2]);
    cacheClear('products');
    expect(cacheGet('T1:/products')).toBeNull();
    expect(cacheGet('T1:/vendors')).toEqual([2]);
  });

  it('cacheInvalidateForApiPath clears matching segment', async () => {
    const { cacheSet, cacheGet, cacheInvalidateForApiPath } = await import('../../src/platforms/mobile/offline/cache');
    cacheSet('T1:/products', [1]);
    cacheSet('T1:/vendors', [2]);
    cacheInvalidateForApiPath('/products?search=x');
    expect(cacheGet('T1:/products')).toBeNull();
    expect(cacheGet('T1:/vendors')).toEqual([2]);
  });

  it('cacheInvalidateForApiPath with empty segment clears all', async () => {
    const { cacheSet, cacheGet, cacheInvalidateForApiPath } = await import('../../src/platforms/mobile/offline/cache');
    cacheSet('a', 1);
    cacheInvalidateForApiPath('/');
    expect(cacheGet('a')).toBeNull();
  });
});

describe('offline queue', () => {
  let shim: ReturnType<typeof installBrowserShim>;

  beforeEach(() => {
    vi.resetModules();
    shim = installBrowserShim();
  });

  afterEach(() => {
    shim.resetStore();
    vi.unstubAllGlobals();
  });

  it('enqueues and counts', async () => {
    const { enqueueOfflineMutation, offlineQueueCount, getOfflineQueue, clearOfflineQueue } =
      await import('../../src/platforms/mobile/offline/queue');
    // Missing key → empty (covers !raw)
    expect(getOfflineQueue()).toEqual([]);
    clearOfflineQueue();
    enqueueOfflineMutation({ path: '/api/products', method: 'POST', body: '{"a":1}', label: 'create' });
    expect(offlineQueueCount()).toBe(1);
    expect(getOfflineQueue()[0].label).toBe('create');
  });

  it('dedupes identical method/path/body', async () => {
    const { enqueueOfflineMutation, offlineQueueCount, clearOfflineQueue } =
      await import('../../src/platforms/mobile/offline/queue');
    clearOfflineQueue();
    enqueueOfflineMutation({ path: '/api/x', method: 'POST', body: '{"n":1}' });
    enqueueOfflineMutation({ path: '/api/x', method: 'POST', body: '{"n":1}' });
    expect(offlineQueueCount()).toBe(1);
    enqueueOfflineMutation({ path: '/api/x', method: 'POST', body: '{"n":2}' });
    expect(offlineQueueCount()).toBe(2);
  });

  it('remove and clear', async () => {
    const { enqueueOfflineMutation, removeOfflineMutation, clearOfflineQueue, getOfflineQueue, offlineQueueCount } =
      await import('../../src/platforms/mobile/offline/queue');
    clearOfflineQueue();
    const a = enqueueOfflineMutation({ path: '/api/a', method: 'PUT' });
    enqueueOfflineMutation({ path: '/api/b', method: 'PUT' });
    removeOfflineMutation(a.id);
    expect(getOfflineQueue().map((x) => x.path)).toEqual(['/api/b']);
    clearOfflineQueue();
    expect(offlineQueueCount()).toBe(0);
  });

  it('flush removes successful items', async () => {
    const { enqueueOfflineMutation, flushOfflineQueue, offlineQueueCount, clearOfflineQueue } =
      await import('../../src/platforms/mobile/offline/queue');
    clearOfflineQueue();
    enqueueOfflineMutation({ path: 'https://example.com/api/ok', method: 'POST', body: '{}' });
    const fetchFn = vi.fn(async () => new Response('{}', { status: 200 }));
    const r = await flushOfflineQueue(fetchFn as unknown as typeof fetch);
    expect(r.synced).toBe(1);
    expect(r.failed).toBe(0);
    expect(offlineQueueCount()).toBe(0);
  });

  it('flush drops permanent 4xx but keeps 401/429', async () => {
    const { enqueueOfflineMutation, flushOfflineQueue, offlineQueueCount, clearOfflineQueue, getOfflineQueue } =
      await import('../../src/platforms/mobile/offline/queue');
    clearOfflineQueue();
    enqueueOfflineMutation({ path: '/api/bad', method: 'POST', body: '{}' });
    enqueueOfflineMutation({ path: '/api/auth', method: 'POST', body: '{}' });
    enqueueOfflineMutation({ path: '/api/rate', method: 'POST', body: '{}' });

    const fetchFn = vi.fn(async (url: string) => {
      if (String(url).includes('bad')) return new Response('no', { status: 400 });
      if (String(url).includes('auth')) return new Response('no', { status: 401 });
      return new Response('no', { status: 429 });
    });

    const r = await flushOfflineQueue(fetchFn as unknown as typeof fetch);
    expect(r.failed).toBe(3);
    expect(offlineQueueCount()).toBe(2);
    const paths = getOfflineQueue().map((x) => x.path).sort();
    expect(paths).toEqual(['/api/auth', '/api/rate']);
  });

  it('flush stops on network throw', async () => {
    const { enqueueOfflineMutation, flushOfflineQueue, offlineQueueCount, clearOfflineQueue } =
      await import('../../src/platforms/mobile/offline/queue');
    clearOfflineQueue();
    enqueueOfflineMutation({ path: '/api/1', method: 'POST' });
    enqueueOfflineMutation({ path: '/api/2', method: 'POST' });
    const fetchFn = vi.fn(async () => { throw new TypeError('offline'); });
    const r = await flushOfflineQueue(fetchFn as unknown as typeof fetch);
    expect(r.failed).toBe(1);
    expect(offlineQueueCount()).toBe(2);
  });

  it('tolerates corrupt queue JSON', async () => {
    shim.localStorage.setItem('dg_offline_queue_v1', 'not-json');
    const { getOfflineQueue, offlineQueueCount } = await import('../../src/platforms/mobile/offline/queue');
    expect(getOfflineQueue()).toEqual([]);
    expect(offlineQueueCount()).toBe(0);
  });

  it('treats non-array parsed JSON as empty queue', async () => {
    shim.localStorage.setItem('dg_offline_queue_v1', '{"not":"array"}');
    const { getOfflineQueue } = await import('../../src/platforms/mobile/offline/queue');
    expect(getOfflineQueue()).toEqual([]);
  });
});

describe('apiBase', () => {
  let shim: ReturnType<typeof installBrowserShim>;

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
    shim = installBrowserShim();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('defaults to relative /api when not native and no env', async () => {
    const { getApiOrigin, getApiBase, resolveApiUrl, isNativeApp } = await import('../../src/platforms/shared/apiBase');
    expect(isNativeApp()).toBe(false);
    expect(getApiOrigin()).toBe('');
    expect(getApiBase()).toBe('/api');
    expect(resolveApiUrl('/api/products')).toBe('/api/products');
    expect(resolveApiUrl('products')).toBe('/products');
  });

  it('uses DEFAULT cloud origin when native', async () => {
    shim.setNative(true);
    const { getApiOrigin, getApiBase, resolveApiUrl, isNativeApp } = await import('../../src/platforms/shared/apiBase');
    expect(isNativeApp()).toBe(true);
    expect(getApiOrigin()).toBe('https://dg-erp.onrender.com');
    expect(getApiBase()).toBe('https://dg-erp.onrender.com/api');
    expect(resolveApiUrl('/api/vendors')).toBe('https://dg-erp.onrender.com/api/vendors');
    expect(resolveApiUrl('/health')).toBe('https://dg-erp.onrender.com/health');
    expect(resolveApiUrl('sales')).toBe('https://dg-erp.onrender.com/api/sales');
  });

  it('honours VITE_API_ORIGIN over native default', async () => {
    vi.stubEnv('VITE_API_ORIGIN', 'https://custom.example.com/');
    shim.setNative(true);
    const { getApiOrigin, resolveApiUrl } = await import('../../src/platforms/shared/apiBase');
    expect(getApiOrigin()).toBe('https://custom.example.com');
    expect(resolveApiUrl('/api/x')).toBe('https://custom.example.com/api/x');
  });

  it('honours VITE_API_BASE', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://custom.example.com/v1/api/');
    const { getApiBase } = await import('../../src/platforms/shared/apiBase');
    expect(getApiBase()).toBe('https://custom.example.com/v1/api');
  });

  it('leaves absolute URLs unchanged', async () => {
    shim.setNative(true);
    const { resolveApiUrl } = await import('../../src/platforms/shared/apiBase');
    expect(resolveApiUrl('https://other.test/api/z')).toBe('https://other.test/api/z');
  });

  it('installNativeApiFetch rewrites relative /api calls', async () => {
    vi.stubEnv('VITE_API_ORIGIN', 'https://cloud.test');
    const calls: string[] = [];
    const origFetch = vi.fn(async (input: RequestInfo | URL) => {
      calls.push(input instanceof Request ? input.url : String(input));
      return new Response('{}', { status: 200 });
    });
    shim.window.fetch = origFetch as unknown as typeof fetch;
    vi.stubGlobal('fetch', origFetch);

    const { installNativeApiFetch, resolveApiUrl } = await import('../../src/platforms/shared/apiBase');
    expect(resolveApiUrl('')).toBe('https://cloud.test/api');
    installNativeApiFetch();
    installNativeApiFetch(); // idempotent

    await window.fetch('/api/products');
    expect(calls[0]).toBe('https://cloud.test/api/products');

    await window.fetch(new Request('http://localhost/api/vendors?q=1'));
    expect(calls[1]).toContain('/api/vendors');
    expect(calls[1]).toContain('cloud.test');

    // Non-/api URL falls through to original fetch
    await window.fetch('/health');
    expect(calls[2]).toBe('/health');
  });

  it('isNativeApp is false when Capacitor throws', async () => {
    Object.defineProperty(shim.window, 'Capacitor', {
      get() { throw new Error('boom'); },
    });
    const { isNativeApp } = await import('../../src/platforms/shared/apiBase');
    expect(isNativeApp()).toBe(false);
  });
});
