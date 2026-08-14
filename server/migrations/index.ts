/**
 * Migration registry — all schema changes after v2.2.0 go here.
 *
 * Naming convention: NNNN_short_description (zero-padded, chronological).
 * Each migration runs exactly once and is recorded in schema_migrations.
 * initSchema() covers everything up to and including the entries below,
 * so only add migrations for changes not yet in initSchema.
 *
 * Example:
 *   { id: '0001_products_add_sku', up: `ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT` },
 */
import type { Migration } from './runner';

export const migrations: Migration[] = [
  // Add new migrations here ↓
];
