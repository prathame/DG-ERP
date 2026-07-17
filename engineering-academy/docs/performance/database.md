---
title: Database Performance
description: Composite tenant_id indexing strategy, why RLS's app.tenant_id column ordering matters for query plans, and pagination as a database-load control.
---

# Database Performance

Every multi-tenant table in Dhandho carries a `tenant_id` column that appears in essentially every `WHERE` clause (see [../security/tenant-isolation.md](../security/tenant-isolation.md)) — which makes indexing strategy here inseparable from the tenant-isolation model. This document is about the specific indexing pattern used and why it's structured the way it is.

## The pattern: `tenant_id` first, in every composite index

```156:264:server/pg-db.ts (representative sample)
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_customers_name ON customers(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id);
CREATE INDEX IF NOT EXISTS idx_products_name ON products(tenant_id, name);
CREATE INDEX IF NOT EXISTS idx_pi_tenant ON product_inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_pi_barcode ON product_inventory(tenant_id, barcode);
CREATE INDEX IF NOT EXISTS idx_pi_product_status ON product_inventory(tenant_id, product_id, status);
CREATE INDEX IF NOT EXISTS idx_pd_vendor ON product_distribution(tenant_id, vendor_id);
CREATE INDEX IF NOT EXISTS idx_ps_date ON product_sales(tenant_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_audit_tenant ON audit_log(tenant_id, created_at);
```

Every composite index here puts `tenant_id` **first**. This isn't cosmetic — Postgres B-tree indexes are only efficiently usable as a prefix match. An index on `(tenant_id, name)` efficiently serves queries filtering on `tenant_id` alone, or on `tenant_id AND name` together, but is nearly useless for a query that filters on `name` alone without `tenant_id` (which, per the isolation convention, should never happen anyway — every real query includes the tenant filter). Because **every single query in this application already includes `tenant_id` in its `WHERE` clause** (the isolation convention discussed in [Tenant Isolation](../security/tenant-isolation.md)), putting it first in every composite index means **every index in the system is actually usable by the query patterns the app actually issues** — there's no wasted index maintenance overhead on index shapes the app's query patterns never hit.

> [!NOTE]
> **Why not just one global index per table on `tenant_id` alone, and rely on that plus a sequential scan for the rest of the filter?** Because for tables with meaningful row counts per tenant (products, inventory items scoped by individual barcode, sales history), narrowing by `tenant_id` alone might still leave thousands of rows to scan for the *specific* row(s) a query actually wants. `idx_pi_barcode ON product_inventory(tenant_id, barcode)` lets Postgres jump directly to a specific barcode within a specific tenant's slice of the table — the composite index is doing meaningfully more work than tenant-scoping alone would.

## Indexing choices that reflect actual query patterns

A few specific indexes reveal what the application's hottest lookups actually are:

- **`idx_pi_barcode(tenant_id, barcode)`** — Dhandho tracks inventory **per individual barcode**, not just per SKU/product-type aggregate count (see [../frontend/features-catalog.md](../frontend/features-catalog.md)'s Inventory section) — meaning barcode lookups (scanning a physical item to check its status) are a core, frequent operation, not an edge case, and get a dedicated index rather than relying on a table scan filtered after the fact.
- **`idx_ps_date(tenant_id, purchase_date)` / `idx_pd_date(tenant_id, distribution_date)`** — sales and distribution history are frequently queried by date range (a day's sales report, a month's distribution summary) — a composite index with the date column lets Postgres use an efficient range scan rather than a full tenant-scoped scan followed by a filter.
- **`idx_audit_tenant(tenant_id, created_at)` / `idx_audit_action(action, created_at)`** — the audit log gets **two** different composite indexes because it's queried two different ways: "show me this tenant's recent activity" (tenant_id + time-ordered) and "show me all `IMPERSONATE` events across the platform, recently" (a Super Admin cross-tenant query, filtering by `action` rather than `tenant_id` at all) — a genuinely different access pattern that needs its own index shape.

## Pagination as a database-load control, not just a UI concern

`parsePagination`'s hard ceiling of 1000 rows (see [Backend Performance](./backend.md)) directly bounds how much work any single query can force Postgres to do — a `LIMIT 1000 OFFSET N` query is fundamentally cheaper for the database to plan and execute than an unbounded `SELECT *` across a tenant's full history table, especially as that table grows over a tenant's multi-year lifetime with the platform.

> [!TIP]
> **`OFFSET`-based pagination has a well-known scaling limitation worth knowing about, even though it's not currently a live problem here.** `OFFSET 50000 LIMIT 500` still requires Postgres to scan and discard the first 50,000 matching rows before returning the requested slice — a cost that grows linearly with how deep into a result set a client pages. For Dhandho's actual tenant sizes (SME businesses, not enterprises with millions of historical sales rows), this hasn't been a practical bottleneck, but a cursor-based (`WHERE id > last_seen_id ORDER BY id LIMIT 500`) pagination scheme would scale better for a hypothetical future tenant with a very large multi-year sales history. This is a reasonable "haven't needed to solve this yet" gap, not an oversight — see [Bottlenecks](./bottlenecks.md).

## RLS's `current_setting` lookup and query plans

One subtlety worth knowing from [Tenant Isolation](../security/tenant-isolation.md): on the (comparatively rare) code paths that *do* run inside a transaction with `setTenantContext` called, the RLS policy's `USING (tenant_id = current_setting('app.tenant_id', true))` clause is evaluated per-row unless Postgres's planner can push it down efficiently — since `current_setting` is a stable (not volatile) function call from Postgres's perspective within a single statement, the planner generally *can* treat it as a constant for planning purposes and use the same `tenant_id`-prefixed indexes described above. In practice, since the application-layer `WHERE tenant_id = $1` is *also* present in the actual query text on top of the RLS policy, the explicit predicate is what primarily drives index selection — RLS's policy predicate is effectively redundant with, not a replacement for, the query's own filter, for the connections where it even applies.

## Quiz

1. Why does putting `tenant_id` first in every composite index matter, given the application's query conventions?
2. Why does the audit log have two separate composite indexes instead of one shared `(tenant_id, action, created_at)` index?
3. What's the known scaling limitation of `OFFSET`-based pagination, and why hasn't it needed fixing yet in this codebase?

<details>
<summary>Answers</summary>

1. Because Postgres B-tree composite indexes are efficiently usable as left-to-right prefix matches, and every query in this application already filters on `tenant_id`. Putting it first means every composite index is actually reachable by the app's real query patterns — an index with `tenant_id` in any other position, or omitted, would be far less useful given how consistently every query includes that filter.
2. Because the audit log is queried two genuinely different ways with different leading filter columns: per-tenant activity views (filtering by `tenant_id` first, ordered by time) and cross-tenant action-type queries used by Super Admin tooling (filtering by `action` first, like finding all `IMPERSONATE` events platform-wide, ordered by time) — a single composite index with one fixed leading column can't efficiently serve both access patterns.
3. `OFFSET N` pagination requires the database to scan and discard the first `N` matching rows before returning the requested page, so its cost grows linearly with how deep a client pages into a result set — a query with `OFFSET 100000` is meaningfully more expensive than `OFFSET 0`. It hasn't needed fixing because Dhandho's actual tenants (SME businesses) don't yet accumulate result sets large enough for this cost to be noticeable in practice — it's a known, deferred concern rather than an active problem.

</details>

## Related reading

- [Tenant Isolation](../security/tenant-isolation.md) — the `WHERE tenant_id` convention these indexes are built around.
- [Backend Performance](./backend.md) — pagination defaults and connection pooling.
- [Bottlenecks](./bottlenecks.md) — where database performance shows real strain today.
