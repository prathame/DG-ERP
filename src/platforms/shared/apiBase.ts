/** Optional API host override for non-same-origin clients (e.g. Electron). */
function stripTrailingSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

/**
 * Origin for API calls (no trailing slash), e.g. https://dhandho.app
 * Empty string = same-origin relative `/api` (web + Electron).
 */
export function getApiOrigin(): string {
  const env = (import.meta.env.VITE_API_ORIGIN as string | undefined)?.trim();
  if (env) return stripTrailingSlash(env);
  return '';
}

/** Base path including `/api`, e.g. https://dhandho.app/api or `/api`. */
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
