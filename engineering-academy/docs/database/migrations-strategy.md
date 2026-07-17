---
sidebar_label: Migrations Strategy
title: Schema Migrations — Idempotent initSchema() Instead of a Migration Framework
description: Why DG-ERP runs ~120 idempotent DDL statements on every boot instead of Flyway/Knex/Prisma Migrate, what that costs, and the safe change cookbook for evolving the schema without one.
---

# Schema Migrations — Idempotent `initSchema()` Instead of a Migration Framework

There is no `schema_migrations` table, no `up.sql`/`down.sql` pair, no migration runner CLI, and no rollback tooling anywhere in this codebase. Schema evolution happens by editing `server/pg-db.ts` directly and letting `initSchema()` re-run its entire — now-longer — script on the next boot.

```mermaid
flowchart LR
    Boot[Process boot: cloud API restart,\nRender redeploy, or Electron on-prem launch] --> InitDB[initDatabase()]
    InitDB --> InitSchema[initSchema()]
    InitSchema --> Create["~40× CREATE TABLE IF NOT EXISTS"]
    InitSchema --> Alter["~70× ALTER TABLE ... ADD COLUMN IF NOT EXISTS"]
    InitSchema --> Index["~40× CREATE INDEX IF NOT EXISTS"]
    InitSchema --> RLS["31× ENABLE ROW LEVEL SECURITY + CREATE POLICY"]
    InitSchema --> Seed[seedPlatformData: plans + super admin]
```

:::tip Mental model
Every statement in `initSchema()` must be safe to execute against a database that already has it applied. That single constraint — idempotency — is the entire migration strategy. There's no versioning because there's nothing to version: the script always converges the database to the same end state, regardless of which subset of statements a given database has already seen.
:::

## Why this, deliberately, over Flyway/Knex/Prisma Migrate

| Benefit | Who it helps |
|---|---|
| An on-prem Electron box self-heals its embedded Postgres just by installing a new app version — no separate migration step, no "did the customer remember to run migrations" support ticket | On-prem customers, who have no DBA and no ops team |
| Zero migration-runner dependency, zero migration-state table to get out of sync in Docker/Render deploys | Solo founder / small team, thinner ops surface |
| The schema lives in the same file, in the same language (TypeScript), next to the code that queries it — one file to read to understand "what exists," not a migration history to replay mentally | Both human engineers and AI coding assistants working on this repo |
| No possibility of "migration ran on cloud, forgot to run on on-prem" drift between the two deployment targets ([Four Surfaces](/architecture/four-surfaces)) — they run the *exact same* `initSchema()` function | Cross-deployment consistency |

## Costs — also stated plainly

| Cost | Mitigation actually in place |
|---|---|
| No automatic rollback of a destructive change — there's no "down" migration | Expand/contract changes manually (see cookbook below); never ship a same-deploy destructive DDL |
| `pg-db.ts` only grows — it's now 1000+ lines and will keep growing | Section comments (`-- ============ PLATFORM TABLES ============`) and dated inline comments (`// P1 fix`, `// H3 fix`) act as an informal changelog |
| No single source of truth for "which schema version is Tenant X's on-prem box running" | Not solved today — see [Tech Debt Register](/scaling/tech-debt-register) if this becomes a real support problem |
| Can't cleanly rename a column — `ALTER TABLE ... RENAME COLUMN` run inside an idempotent `IF NOT EXISTS`-style guard isn't a thing Postgres supports the same way | Add the new column, dual-write, backfill, deprecate the old one — see cookbook |
| Every boot re-runs the *entire* script, even on tenants/installs that have had every statement applied for years | Every statement is a cheap idempotent no-op (`IF NOT EXISTS` checks) — this is a real per-boot cost but small in absolute terms for this schema's size |

## The safe change cookbook

### Add a nullable column (the common case)

```sql
ALTER TABLE products ADD COLUMN IF NOT EXISTS is_hazardous BOOLEAN DEFAULT false;
```

Because the whole app is a monolith that runs `initSchema()` before serving any request on that boot, code that reads/writes the new column is safe to ship in the **same deploy** as the DDL — there's no window where new code runs against old schema, because schema always updates first, synchronously, on process start.

### Add a table

```sql
CREATE TABLE IF NOT EXISTS return_requests (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  barcode TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_return_requests_tenant ON return_requests(tenant_id);
```

Then, separately, add the table name to the `rlsTables` array in the same file (see [RLS](/database/rls)) so it gets `ENABLE ROW LEVEL SECURITY` + a tenant-isolation policy in the very same `initSchema()` run. Forgetting this step is easy to miss in review because the table works perfectly fine without it — RLS is a safety net, not a functional requirement, so its absence produces no visible bug until it's needed.

### Destructive change (rename or remove a column) — expand/contract, always

1. **Expand:** add the new column (or table) alongside the old one. Deploy.
2. Deploy application code that **dual-writes** — every write path updates both the old and new column.
3. **Backfill** existing rows: a one-off `UPDATE ... SET new_col = old_col WHERE new_col IS NULL` statement, either as another idempotent line in `initSchema()` (fine for small tables) or a one-time script (for large ones, to avoid a slow boot-time lock).
4. Deploy application code that **reads only the new column**, while still dual-writing (safety window).
5. **Contract:** stop writing the old column. Only *after* you're confident nothing on-prem or cloud still depends on it, drop it — manually, deliberately, never inside a routine `initSchema()` boot without a version gate, because an on-prem customer's Electron app might skip several app-version boots between updates and could still expect the old column to exist mid-way through the expand/contract window.

:::warning Never `DROP COLUMN` or `DROP TABLE` unconditionally in initSchema()
An on-prem customer can go months between updates. If version N adds a column, version N+1 starts writing to it, and version N+2 drops the old column it replaced, an on-prem box that jumps straight from N to N+2 in one update will run `initSchema()` exactly once and needs every intermediate step to have already been idempotently folded in — which it will be, since `initSchema()` always represents the *current* desired end-state, not a sequence of diffs. But if you ever add an actual `DROP COLUMN`/`DROP TABLE` statement, it executes unconditionally every future boot forever, with no way to know whether the specific installation it's running against ever had the expand/contract window complete. Treat drops as a one-time manual operation against each environment, not a permanent line in `pg-db.ts`.
:::

## Rejected alternatives

| Tool | Why not adopted (yet) |
|---|---|
| Knex migrations | Adds a migration-runner step to the on-prem Electron first-boot flow that doesn't otherwise exist — the on-prem app currently just launches, and `initSchema()` runs inline as part of that launch with no separate CLI invocation needed |
| Flyway | Same on-prem-offline-first-boot friction as Knex, plus a JVM dependency that doesn't otherwise exist anywhere in this Node/TypeScript stack |
| Prisma Migrate | Would require adopting Prisma's schema DSL and query layer wholesale, a much bigger rewrite than "add a migration tool" — the app currently uses raw `pg` queries everywhere (see [Backend → pg-db.ts](/backend/pg-db)), and Prisma Migrate specifically (as opposed to the Prisma Client) doesn't compose cleanly with a raw-SQL codebase |
| Squawk (migration linter) + CI-enforced migration files | A reasonable *future* step once there's a real migration framework in place to lint — not applicable to the current single-file-DDL approach; would need someone to own introducing the framework first |

## When to graduate off this approach

This strategy scales until one of these becomes true:

- Schema changes become **frequent and destructive** (weekly column removals/renames) rather than occasional additive changes — expand/contract by hand gets error-prone at that cadence.
- **Multiple engineers** are editing `pg-db.ts` concurrently and conflicting on the same regions of the file — a real migration framework's per-change files avoid merge conflicts in a shared monolith file.
- A compliance requirement (SOC 2, an enterprise customer's security questionnaire) demands an **audited migration history** — "here is exactly what changed, when, and who approved it" — that a single mutable file with inline comments can't produce mechanically.

None of these triggers has been hit yet for this codebase's current size and team.

## Common mistakes

1. Adding an unconditional `DROP TABLE` or `DROP COLUMN` directly into `initSchema()` — see the warning above.
2. Changing a column's type in place (`ALTER TABLE ... ALTER COLUMN ... TYPE ...`) without considering that this can rewrite the entire table and lock it for the duration — on a large production table, this could stall every request against it for the length of the boot.
3. Forgetting that `initSchema()` runs against **both** cloud and every on-prem install — a statement that's fast on the shared cloud Postgres (small idle time) might behave differently on a resource-constrained on-prem machine.
4. Assuming a new `CREATE POLICY` statement is automatically idempotent — it isn't by default; note the explicit `IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE ...)` guard wrapped in a `DO $$ ... END $$` block around every policy creation in the current code, which is there specifically because `CREATE POLICY` has no native `IF NOT EXISTS` clause.
5. Backfilling a large table synchronously inside `initSchema()` on a hot boot path — for anything beyond a small table, do it as an out-of-band script, not a blocking statement every future boot re-checks.

## Interview question

> **Q: How would you safely add a `NOT NULL` column to a table with millions of existing rows in this codebase, given that `initSchema()` runs synchronously on every boot?**
>
> Expected answer: never add `NOT NULL` directly in one step. First add the column nullable with `ADD COLUMN IF NOT EXISTS`. Backfill existing rows in batches (outside the hot boot path if the table is large, to avoid a long lock stalling every request during that boot). Only once backfill is confirmed complete do you add a `NOT NULL` constraint (a separate, deliberate `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` statement) — and even then, be aware this statement itself requires a full table scan under a lock in older Postgres versions, so timing matters. Never attempt to rewrite the whole table's constraint in a single boot-time transaction on a live production table without understanding that lock cost.

## Hands-on exercise

1. Open `server/pg-db.ts` and find a section comment marking a distinct feature era (e.g. "Purchase module tables", "on-prem notifications").
2. Pick one `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statement from that section and write out, in your own words, the expand/contract steps that *would* be needed if that column's name needed to change today.
3. Find the `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` pattern used for the `invoice_payments_invoice_fk` foreign key. Explain why a plain `ALTER TABLE ... ADD CONSTRAINT` without that wrapper would break idempotency, and what specific Postgres error the `EXCEPTION` clause is catching.

## Related

- [Schema Overview](/database/schema-overview)
- [Tenant Tables](/database/tenant-tables)
- [RLS](/database/rls)
- [Backend → pg-db.ts](/backend/pg-db)
- [Deployment → On-prem / Electron](/deployment/electron)
