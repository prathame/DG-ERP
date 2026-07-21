/**
 * Provider-agnostic Postgres URL helpers.
 * App runs on Render (or anywhere); DATABASE_URL may point at Neon, Supabase,
 * Render Postgres, RDS, self-hosted, etc.
 */

/** Hosts that typically present TLS certs Node does not trust by default. */
const MANAGED_TLS_HOST_RE =
  /(?:\.|^)(?:neon\.tech|neon\.build|render\.com|supabase\.co|supabase\.com|pooler\.supabase\.com|railway\.app|railway\.internal|amazonaws\.com|azure\.com|postgres\.database\.azure\.com|digitalocean\.com|db\.ondigitalocean\.com|timescale\.com|cockroachlabs\.cloud|prisma\.io|elephantsql\.com|bit\.io|fly\.dev|postgres\.railway\.internal)(?:$|[:/])/i;

export function parseDatabaseUrl(url: string): URL | null {
  const raw = url?.trim();
  if (!raw) return null;
  try {
    // URL() needs a hierarchical scheme; postgres:// is fine in Node
    return new URL(raw.replace(/^postgres(ql)?:/i, 'http:'));
  } catch {
    return null;
  }
}

export function databaseHostname(url: string): string | null {
  return parseDatabaseUrl(url)?.hostname || null;
}

/** True for Neon / Render PG / Supabase / common managed PaaS hostnames. */
export function isManagedPostgresHost(url: string): boolean {
  const host = databaseHostname(url);
  if (!host) return false;
  if (MANAGED_TLS_HOST_RE.test(host)) return true;
  // Render internal hostnames: dpg-xxxxx-a (no public DNS suffix)
  if (/^dpg-[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(host)) return true;
  return false;
}

export function urlRequestsSsl(url: string): boolean {
  const u = parseDatabaseUrl(url);
  if (!u) return false;
  const mode = (u.searchParams.get('sslmode') || '').toLowerCase();
  return ['require', 'verify-ca', 'verify-full', 'prefer'].includes(mode);
}

export interface PoolSslDecision {
  useSsl: boolean;
  /** Passed to pg `ssl.rejectUnauthorized` */
  rejectUnauthorized: boolean;
  managedHost: boolean;
}

/**
 * Decide TLS for `pg` Pool from env + connection string.
 * - Production cloud / DATABASE_SSL=true / sslmode=*: use TLS
 * - On-prem local embedded PG: no TLS
 * - Managed hosts default rejectUnauthorized=false (override with env)
 */
export function resolvePoolSsl(
  env: NodeJS.ProcessEnv = process.env,
  databaseUrl = env.DATABASE_URL || '',
): PoolSslDecision {
  const isOnPrem = env.DEPLOYMENT_MODE === 'onprem';
  const isProduction = env.NODE_ENV === 'production';
  const managedHost = isManagedPostgresHost(databaseUrl);
  const useSsl =
    !isOnPrem &&
    (env.DATABASE_SSL === 'true' ||
      urlRequestsSsl(databaseUrl) ||
      managedHost ||
      (isProduction && env.DATABASE_SSL !== 'false'));

  let rejectUnauthorized = true;
  if (managedHost) {
    // Neon / Render / Supabase: platform CA; Node often fails verify unless disabled
    rejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'true';
  } else {
    rejectUnauthorized = env.DATABASE_SSL_REJECT_UNAUTHORIZED !== 'false';
  }

  return { useSsl, rejectUnauthorized, managedHost };
}

/** Human-readable hint when DNS fails for DATABASE_URL host. */
export function formatDbConnectError(err: unknown, databaseUrl = process.env.DATABASE_URL || ''): string {
  const msg = err instanceof Error ? err.message : String(err);
  const host = databaseHostname(databaseUrl) || '(unknown host)';
  if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(msg)) {
    return (
      `Cannot resolve database host "${host}". ` +
      `DATABASE_URL is wrong or points at a deleted instance. ` +
      `For Neon: Dashboard → Connection string (URI) → set DATABASE_URL on the web service. ` +
      `Do not use a stale Render internal hostname (dpg-…) if the DB lives on Neon.`
    );
  }
  if (/ECONNREFUSED/i.test(msg)) {
    return `Database refused connection at "${host}". Check that the instance is running and the port is correct.`;
  }
  if (/certificate|SSL|TLS/i.test(msg)) {
    return (
      `TLS error talking to "${host}". For Neon set DATABASE_SSL=true (default on managed hosts). ` +
      `If needed for managed PaaS only: DATABASE_SSL_REJECT_UNAUTHORIZED=false.`
    );
  }
  return msg;
}
