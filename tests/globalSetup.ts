import dotenv from 'dotenv';
dotenv.config();

/**
 * Tests require DATABASE_URL + JWT_SECRET from the environment
 * (local `.env`, CI workflow env, or shell exports). No fallback secrets in source.
 */
function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(
      `${name} is required for tests. Copy .env.example → .env (or set CI env) before running vitest.`,
    );
  }
  return v;
}

requireEnv('DATABASE_URL');
requireEnv('JWT_SECRET');

export async function setup() {
  const { initDatabase } = await import('../server/pg-db');
  await initDatabase();
}

export async function teardown() {
  // Pool will close naturally when process exits
}
