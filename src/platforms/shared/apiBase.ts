/** Cloud API host used by the Capacitor mobile app (and optional web override). */
const DEFAULT_CLOUD_ORIGIN = 'https://dhandho.app';

function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

/** True when running inside Capacitor Android/iOS WebView. */
export function isNativeApp(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    return !!cap?.isNativePlatform?.();
  } catch {
    return false;
  }
}

/**
 * Origin for API calls (no trailing slash), e.g. https://dhandho.app
 * Empty string = same-origin relative `/api` (web + Electron).
 */
export function getApiOrigin(): string {
  const env = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim();
  if (env) return stripTrailingSlash(env);
  if (isNativeApp()) return DEFAULT_CLOUD_ORIGIN;
  return '';
}

/** Base path including `/api`, e.g. https://dhandho.app/api or `/api`. */
export function getApiBase(): string {
  const envBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  if (envBase) return stripTrailingSlash(envBase);
  const origin = getApiOrigin();
  return origin ? `${origin}/api` : '/api';
}

/** Resolve `/api/...` or `/foo` to a full URL when on native / when VITE_API_ORIGIN is set. */
export function resolveApiUrl(path: string): string {
  if (!path) return getApiBase();
  if (/^https?:\/\//i.test(path)) return path;
  const origin = getApiOrigin();
  if (!origin) {
    return path.startsWith('/') ? path : `/${path}`;
  }
  if (path.startsWith('/api/') || path === '/api') return `${origin}${path}`;
  if (path.startsWith('/')) return `${origin}${path}`;
  return `${origin}/api/${path}`;
}

/**
 * Patch window.fetch so bare `/api/...` calls work inside Capacitor
 * (WebView origin is capacitor://localhost, not the cloud host).
 */
export function installNativeApiFetch(): void {
  if (typeof window === 'undefined') return;
  const origin = getApiOrigin();
  if (!origin) return;
  if ((window as unknown as { __dgApiFetchPatched?: boolean }).__dgApiFetchPatched) return;

  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    try {
      if (typeof input === 'string' && (input.startsWith('/api/') || input === '/api')) {
        return orig(resolveApiUrl(input), init);
      }
      if (
        input instanceof Request &&
        (input.url.startsWith('/api/') || input.url === '/api' || input.url.includes('://localhost/api'))
      ) {
        // Relative Request URL may already be resolved against capacitor origin
        const u = new URL(input.url, window.location.href);
        if (u.pathname.startsWith('/api')) {
          return orig(new Request(resolveApiUrl(u.pathname + u.search), input), init);
        }
      }
    } catch {
      /* fall through */
    }
    return orig(input as RequestInfo, init);
  };

  (window as unknown as { __dgApiFetchPatched?: boolean }).__dgApiFetchPatched = true;
}
