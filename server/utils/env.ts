/**
 * Fail-fast validation for critical runtime configuration.
 * Call before opening DB pools or listening.
 */

const WEAK_DB_PASSWORD = /:(postgres|password|admin|root|123456|secret|changeme|pass)@/i;

export function assertCriticalEnv(env: NodeJS.ProcessEnv = process.env): void {
  const isProduction = env.NODE_ENV === 'production';
  const isTest = env.VITEST === 'true' || env.NODE_ENV === 'test';
  const isOnPrem = env.DEPLOYMENT_MODE === 'onprem';

  if (!env.DATABASE_URL?.trim()) {
    fatal('DATABASE_URL environment variable is required');
  }
  if (!env.JWT_SECRET?.trim()) {
    fatal('JWT_SECRET environment variable is required');
  }
  if (env.JWT_SECRET.length < 32) {
    if (isProduction) {
      fatal('JWT_SECRET must be at least 32 characters in production');
    }
    if (!isTest) {
      console.warn('⚠ JWT_SECRET should be at least 32 characters');
    }
  }

  // Cloud production only — Electron on-prem uses local embedded Postgres (no TLS / CORS)
  if (isProduction && !isOnPrem) {
    if (!env.ALLOWED_ORIGINS?.trim()) {
      fatal('ALLOWED_ORIGINS must be set in production (comma-separated frontend origins)');
    }
    if (WEAK_DB_PASSWORD.test(env.DATABASE_URL!)) {
      fatal('DATABASE_URL appears to use a default/weak password — refuse to start');
    }
    if (env.DATABASE_SSL === 'false') {
      fatal('DATABASE_SSL=false is not allowed in production — TLS is required');
    }
    // Managed hosts (Render/Neon) need rejectUnauthorized=false; still forbid it elsewhere.
    const managedDb = env.RENDER === 'true' || /render\.com|neon\.tech/i.test(env.DATABASE_URL ?? '');
    if (env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false' && !managedDb) {
      fatal('DATABASE_SSL_REJECT_UNAUTHORIZED=false is not allowed in production');
    }
    if (!env.SUPER_ADMIN_EMAIL?.trim() || !env.SUPER_ADMIN_PASSWORD?.trim()) {
      fatal('SUPER_ADMIN_EMAIL and SUPER_ADMIN_PASSWORD are required in production');
    }
    if (env.SUPER_ADMIN_PASSWORD.length < 12) {
      fatal('SUPER_ADMIN_PASSWORD must be at least 12 characters in production');
    }
  }
}

function fatal(message: string): never {
  console.error(`❌ FATAL: ${message}`);
  process.exit(1);
}
