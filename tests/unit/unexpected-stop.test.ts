import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSessionLifecycleFlags,
  markSessionCleanShutdown,
  markSessionRunning,
  wasUnexpectedStop,
  CAP_SESSION_CLEAN_KEY,
  CAP_SESSION_DIRTY_KEY,
} from '../../src/lib/unexpectedStop';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    key: (i: number) => [...map.keys()][i] ?? null,
  };
}

describe('unexpected stop session flags', () => {
  let storage: Storage;

  beforeEach(() => {
    storage = memoryStorage();
  });

  it('does not treat a fresh install as unexpected stop', () => {
    expect(wasUnexpectedStop(storage)).toBe(false);
  });

  it('treats dirty + not clean as unexpected stop (foreground crash/freeze)', () => {
    markSessionRunning(storage);
    expect(storage.getItem(CAP_SESSION_DIRTY_KEY)).toBe('1');
    expect(storage.getItem(CAP_SESSION_CLEAN_KEY)).toBe('0');
    expect(wasUnexpectedStop(storage)).toBe(true);
  });

  it('does not report after clean pause/background', () => {
    markSessionRunning(storage);
    markSessionCleanShutdown(storage);
    expect(wasUnexpectedStop(storage)).toBe(false);
  });

  it('does not report after clean shutdown then cold start flags cleared', () => {
    markSessionRunning(storage);
    markSessionCleanShutdown(storage);
    clearSessionLifecycleFlags(storage);
    expect(wasUnexpectedStop(storage)).toBe(false);
  });

  it('resume after background sets dirty again', () => {
    markSessionRunning(storage);
    markSessionCleanShutdown(storage);
    markSessionRunning(storage);
    expect(wasUnexpectedStop(storage)).toBe(true);
  });
});

describe('durable breadcrumbs survive process death', () => {
  function stubDurableLocalStorage(): Map<string, string> {
    const map = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() {
        return map.size;
      },
      clear: () => map.clear(),
      getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
      setItem: (k: string, v: string) => {
        map.set(k, String(v));
      },
      removeItem: (k: string) => {
        map.delete(k);
      },
      key: (i: number) => [...map.keys()][i] ?? null,
    });
    return map;
  }

  beforeEach(() => {
    stubDurableLocalStorage();
    vi.resetModules();
  });

  it('keeps WhatsApp-style breadcrumbs in localStorage after module remount', async () => {
    const { pushClientBreadcrumb } = await import('../../src/lib/logger');
    pushClientBreadcrumb('WhatsApp invoice share start', { invoiceId: 'INV-1', path: 'pdf' });
    pushClientBreadcrumb('WhatsApp PDF build start', { invoiceId: 'INV-1' });
    pushClientBreadcrumb('WhatsApp PDF build ok', { invoiceId: 'INV-1' });

    const raw = localStorage.getItem('dg_bug_breadcrumbs');
    expect(raw).toBeTruthy();
    expect(raw).toMatch(/WhatsApp PDF build ok/);

    // Simulate WebView kill: new JS realm, empty in-memory — localStorage remains.
    vi.resetModules();
    const { getClientBreadcrumbs: getAfterDeath, getRecentClientLogs } = await import('../../src/lib/logger');
    const crumbs = getAfterDeath(20).join('\n');
    expect(crumbs).toMatch(/WhatsApp invoice share start/);
    expect(crumbs).toMatch(/WhatsApp PDF build ok/);
    expect(getRecentClientLogs(5)).toEqual([]);
  });

  it('hydrates client log ring from localStorage after remount', async () => {
    const { clientLogger } = await import('../../src/lib/logger');
    clientLogger.info('WhatsApp share yield UI', { invoiceId: 'INV-9' });
    expect(localStorage.getItem('dg_client_log_ring')).toMatch(/WhatsApp share yield UI/);

    vi.resetModules();
    const { getRecentClientLogs: getAfter } = await import('../../src/lib/logger');
    const logs = getAfter(10).join('\n');
    expect(logs).toMatch(/WhatsApp share yield UI/);
    expect(logs).toMatch(/INV-9/);
  });
});
