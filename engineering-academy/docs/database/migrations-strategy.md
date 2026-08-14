---
sidebar_position: 4
title: Migrations
description: DG-ERP migration strategy — initSchema for baseline, versioned migrations for incremental changes.
---

# Database Migrations

> **Last updated:** 2026-08-14
> Previous versions of this doc incorrectly stated there was no migration runner. A migration runner was added in Phase 1.

---

## Two-Phase Approach

DG-ERP uses a two-phase database setup:

### Phase 1 — `initSchema()` (baseline, runs every boot)

`server/pg-db.ts` — `initSchema()` runs on every application startup. It uses `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN IF NOT EXISTS`, and similar idempotent DDL. It also applies RLS policies (idempotent `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$`) and FORCE RLS flags.

This ensures the full schema exists from a fresh database without any migration state.

### Phase 2 — Versioned Migration Runner (incremental changes)

`server/migrations/runner.ts` — creates a `schema_migrations` table and applies numbered migrations exactly once.

`server/migrations/index.ts` — the migration registry:

```typescript
export const migrations: Migration[] = [
  {
    id: '0001_standalone_invoices_tenant_safety',
    up: `
      ALTER TABLE standalone_invoices ALTER COLUMN tenant_id SET NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_standalone_invoices_id_tenant ...
      -- Replace single-column FK with composite FK (invoice_id, tenant_id)
    `,
  },
  {
    id: '0002_book_voucher_entries_fk',
    up: `
      ALTER TABLE book_voucher_entries ADD CONSTRAINT bve_voucher_fk
        FOREIGN KEY (voucher_id) REFERENCES book_vouchers(id) ON DELETE CASCADE;
    `,
  },
  {
    id: '0003_notification_digest_indexes',
    up: `
      CREATE INDEX IF NOT EXISTS idx_warranties_tenant_status_expiry ...
      -- 4 compound indexes for notification digest queries
    `,
  },
];
```

Called from `initDatabase()`:
```typescript
await initSchema();                    // idempotent baseline
await runMigrations(pool, migrations); // versioned once-only changes
await seedPlatformData();
```

---

## Adding a New Migration

```typescript
// server/migrations/index.ts
export const migrations: Migration[] = [
  // ... existing migrations ...
  {
    id: '0004_my_new_change',  // sequential, chronological
    up: `ALTER TABLE products ADD COLUMN IF NOT EXISTS new_column TEXT`,
  },
];
```

- `id` must be unique and chronological
- `up` runs in a transaction — it rolls back cleanly on failure
- Failures cause application startup to exit with a fatal log
- The migration is recorded in `schema_migrations` after success

---

## Rollback Strategy

There is currently no automated rollback. If a migration fails:

1. Fix the migration SQL in `server/migrations/index.ts`
2. If the migration partially applied, manually fix the DB via Neon Console
3. Check `SELECT * FROM schema_migrations` — if the id isn't recorded, it rolled back cleanly
4. Redeploy

See RUNBOOK.md for the failed migration recovery procedure.

---

## schema_migrations Table

```sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

The runner checks this table before running each migration. `ON CONFLICT DO NOTHING` semantics — safe to re-run.
