/**
 * Minimal migration runner — tracks applied migrations in schema_migrations.
 * initSchema() covers all schema up to v2.2.0 and remains the idempotent baseline.
 * Add new schema changes as numbered migrations here instead of ALTER TABLE in initSchema.
 */
import type { Pool } from 'pg';
import { logger } from '../utils/logger';

export interface Migration {
  id: string;
  /** Raw SQL to execute. Wrap multi-statement in a DO $$ ... $$ block if needed. */
  up: string;
}

export async function runMigrations(pool: Pool, migrations: Migration[]): Promise<void> {
  if (migrations.length === 0) return;

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const { rows } = await client.query<{ id: string }>('SELECT id FROM schema_migrations');
    const applied = new Set(rows.map(r => r.id));

    for (const migration of migrations) {
      if (applied.has(migration.id)) continue;

      await client.query('BEGIN');
      try {
        await client.query(migration.up);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [migration.id]);
        await client.query('COMMIT');
        logger.info('Migration applied', { id: migration.id });
      } catch (err) {
        await client.query('ROLLBACK');
        logger.error('Migration failed — rolled back', {
          id: migration.id,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
        throw err;
      }
    }
  } finally {
    client.release();
  }
}
