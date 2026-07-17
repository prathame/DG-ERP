import { vi } from 'vitest';

/** Minimal localStorage + window for Node vitest (offline queue/cache). */
export function installBrowserShim() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size; },
  };

  const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>();
  const windowObj = {
    localStorage,
    location: { href: 'http://localhost/' },
    Capacitor: undefined as undefined | { isNativePlatform?: () => boolean },
    dispatchEvent: (ev: Event) => {
      const set = listeners.get(ev.type);
      if (set) {
        for (const l of set) {
          if (typeof l === 'function') l(ev);
          else l.handleEvent(ev);
        }
      }
      return true;
    },
    addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(listener);
    },
    removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(type)?.delete(listener);
    },
    fetch: globalThis.fetch?.bind(globalThis),
  };

  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('window', windowObj);
  // CustomEvent for queue write notifications
  if (typeof globalThis.CustomEvent === 'undefined') {
    class CustomEventPolyfill extends Event {
      detail: unknown;
      constructor(type: string, init?: CustomEventInit) {
        super(type, init);
        this.detail = init?.detail;
      }
    }
    vi.stubGlobal('CustomEvent', CustomEventPolyfill);
  }

  return {
    localStorage,
    window: windowObj,
    resetStore: () => store.clear(),
    setNative(native: boolean) {
      windowObj.Capacitor = native ? { isNativePlatform: () => true } : undefined;
    },
  };
}
