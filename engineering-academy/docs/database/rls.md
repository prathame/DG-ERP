---
sidebar_position: 3
title: Row-Level Security
description: How FORCE ROW LEVEL SECURITY is implemented in DG-ERP as a second layer of tenant isolation behind application-layer WHERE tenant_id filtering.
---

# Row-Level Security — FORCE Enabled

> **Last updated:** 2026-08-14 (Phase 2 — FORCE RLS implemented)
> **Status:** FORCE RLS is ACTIVE on all 31 tenant tables.
> Previous versions of this doc described a state where FORCE RLS was disabled. That state no longer exists.

---

## Current Architecture

DG-ERP applies **four independent layers** of tenant isolation:

1. `WHERE tenant_id = $1` in every query (application layer)
2. `pool.query()` override — wraps every query in `BEGIN / SET LOCAL app.tenant_id / COMMIT`
3. `setTenantContext(client, tenantId)` after every `BEGIN` in `pool.connect()` transactions
4. `ALTER TABLE ... FORCE ROW LEVEL SECURITY` — DB-level enforcement on all 31 tenant tables

---

## How pool.query() Sets app.tenant_id Automatically

`server/pg-db.ts` overrides `pool.query` transparently:

```typescript
(pool as any).query = async function tenantAwareQuery(textOrConfig, values?) {
  const tenantId = requestContext.getStore()?.tenantId; // AsyncLocalStorage
  if (!tenantId) {
    // Platform queries (initSchema, SA operations) — bypass
    return _rawPoolQuery(textOrConfig, values);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await client.query(textOrConfig, values);
    await client.query('COMMIT');
    return result;
  } catch (err) { ... }
};
```

Every authenticated route that calls `pool.query()` automatically has `app.tenant_id` set from `AsyncLocalStorage`. Routes that use `pool.connect()` directly must also call `setTenantContext(client, tenantId)` after `BEGIN` — this is verified and enforced in all route files.

---

## The RLS Policy

Applied to all 31 tenant-scoped tables:

```sql
CREATE POLICY {table}_tenant_isolation ON {table}
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));

ALTER TABLE {table} FORCE ROW LEVEL SECURITY;
```

- `USING` — filters rows visible in SELECT/UPDATE/DELETE
- `WITH CHECK` — validates rows inserted/updated belong to current tenant
- `FORCE` — applies even to the table owner (the pool user)
- `true` parameter on `current_setting` — returns NULL (not an error) if unset; NULL matches zero rows (safe all-deny)

---

## Tables with FORCE RLS (31)

`users`, `vendors`, `customers`, `products`, `product_inventory`, `product_distribution`, `product_sales`, `product_purchases`, `warranties`, `product_replacements`, `rewards`, `reward_rules`, `redemption_settings`, `banks`, `vendor_payments`, `vendor_reminder_settings`, `audit_log`, `categories`, `bill_settings`, `credit_debit_notes`, `price_lists`, `quotations`, `orders`, `suppliers`, `supplier_payments`, `expenses`, `staff_members`, `staff_payments`, `standalone_invoices`, `tenant_notifications`, `tenant_invoices`, `tenant_stats`.

---

## Performance Note

The `pool.query()` override adds 4 round-trips per query (BEGIN + SET LOCAL + query + COMMIT). For high-frequency endpoints like `analytics/overview` (10 parallel queries), this means 40 round-trips. This is the documented trade-off for zero-change tenant isolation. Hot paths should migrate to `withTenantClient()` which amortises the overhead across multiple queries in one connection.

---

## What `app.tenant_id = ''` or `NULL` Does

| Context | app.tenant_id | RLS result |
|---|---|---|
| Authenticated tenant request | JWT tenantId | Correct rows returned |
| Platform query (no JWT, no requestContext) | '' or NULL | Zero rows — safe all-deny |
| Test setup code (pool.query in beforeAll) | NULL (no req ctx) | Pool user is superuser → bypasses FORCE RLS |

---

## Testing Tenant Isolation

The test suite includes `tests/api/http-cross-tenant.test.ts` with 20 HTTP-level isolation tests. Every test proves that Tenant A's JWT cannot access Tenant B's resources.
