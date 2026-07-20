/** Optional API host override for non-same-origin clients (e.g. Capacitor). */
function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

/**
 * Working public cloud host while `dhandho.app` DNS is NXDOMAIN.
 * Cap / Electron may still set `VITE_API_ORIGIN` to the canonical domain later.
 */
export const CLOUD_ORIGIN_FALLBACK = 'https://dg-erp.onrender.com';

const BROKEN_CANONICAL_HOSTS = new Set(['dhandho.app', 'www.dhandho.app']);

/**
 * Normalize a configured API origin.
 * - Empty → same-origin relative `/api` (hosted web on Render).
 * - `dhandho.app` (no DNS yet) → same-origin when the page is already on a real host,
 *   otherwise {@link CLOUD_ORIGIN_FALLBACK} for Cap/native (`https://localhost`).
 */
export function resolveConfiguredApiOrigin(configured: string | undefined | null): string {
  const raw = configured?.trim();
  if (!raw) return '';
  const stripped = stripTrailingSlash(raw);
  try {
    const host = new URL(stripped).hostname.toLowerCase();
    if (!BROKEN_CANONICAL_HOSTS.has(host)) return stripped;

    if (typeof window !== 'undefined' && window.location?.hostname) {
      const pageHost = window.location.hostname.toLowerCase();
      if (pageHost && !BROKEN_CANONICAL_HOSTS.has(pageHost) && pageHost !== 'localhost' && pageHost !== '127.0.0.1') {
        return '';
      }
    }
    return CLOUD_ORIGIN_FALLBACK;
  } catch {
    return stripped;
  }
}

/** Cap WebView / capacitor: origin is localhost — never the cloud API. */
function isCapOrLocalWebView(): boolean {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) return true;
  } catch {
    /* ignore */
  }
  if (typeof window === 'undefined' || !window.location?.origin) return false;
  const origin = window.location.origin;
  return origin === 'https://localhost' || origin === 'http://localhost' || origin.startsWith('capacitor:');
}

/**
 * Origin for API calls (no trailing slash), e.g. https://dg-erp.onrender.com
 * Empty string = same-origin relative `/api` (hosted web on Render).
 * Online Cap must never use relative `/api` (that hits Cap localhost).
 */
export function getApiOrigin(): string {
  const env = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim();
  const resolved = resolveConfiguredApiOrigin(env);
  if (resolved) return resolved;
  if (isCapOrLocalWebView()) return CLOUD_ORIGIN_FALLBACK;
  return '';
}

/** Base path including `/api`, e.g. https://dg-erp.onrender.com/api or `/api`. */
export function getApiBase(): string {
  const envBase = (import.meta.env.VITE_API_BASE as string | undefined)?.trim();
  if (envBase) return stripTrailingSlash(envBase);
  const origin = getApiOrigin();
  return origin ? `${origin}/api` : '/api';
}

/** Resolve `/api/...` or `/foo` to a full URL when VITE_API_ORIGIN is set. */
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
