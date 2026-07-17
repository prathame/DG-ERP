---
sidebar_label: Backend Patterns
title: Backend Patterns Playbook
description: Transactions, row locks, safeError, GST fragments, camelCase mapping — the patterns every new route should copy.
---

# Backend Patterns Playbook

Copy these. Do not invent a fifth way to talk to Postgres.

## 1. Tenant-scoped query

```ts
const tenantId = req.headers['x-tenant-id'] as string; // set by global JWT middleware
await pool.query(
  `SELECT * FROM products WHERE tenant_id = $1 AND id = $2`,
  [tenantId, id],
);
```

:::danger
Never take `tenantId` from `req.body`.
:::

## 2. Multi-step write = transaction

```ts
const client = await pool.connect();
try {
  await client.query('BEGIN');
  // … multiple statements …
  await client.query('COMMIT');
} catch (e) {
  await client.query('ROLLBACK');
  throw e;
} finally {
  client.release();
}
```

Used by: product+barcode create, distribution batches, purchase batches, quotation convert, order fulfill, tenant delete.

## 3. Inventory races → `FOR UPDATE` / `SKIP LOCKED`

```sql
SELECT … FROM product_inventory
WHERE tenant_id = $1 AND id = ANY($2)
FOR UPDATE SKIP LOCKED
```

**Why SKIP LOCKED:** concurrent convert/fulfill should take available rows rather than wait forever / deadlock. If you need all-or-nothing specific barcodes, use plain `FOR UPDATE` and fail if missing.

## 4. `safeError` allow-list (GST / third parties)

Only pre-approved message patterns return to the client; everything else → `Internal server error`. Prevents leaking PG errors wrapped by libraries.

## 5. GST math fragments

Import from `utils/helpers.ts` — never paste a new `CASE WHEN price_includes_gst` into a report.

## 6. CamelCase at the boundary

DB is snake_case. Handlers map to camelCase for the SPA (`mapProduct`, inline mappers). Keep mapping next to the query, not in a magic ORM layer.

## 7. Audit important mutations

`logAudit({ tenantId, userId, action, entity, … })` with PII redaction. Super-admin impersonation must always audit.

## 8. Vendor portal guards

```ts
router.use(blockVendors); // whole router
// or per-handler:
assertVendorAccess(req, resource.vendorId);
const scope = vendorScopeId(req); // null for internal users
```

## 9. Pagination + bulk caps

Use `parsePagination` / `assertBulkSize` — unbounded `GET` and 100k-row CSV inserts are DoS vectors.

## 10. Generic 500s

```ts
} catch (err) {
  console.error('💥 POST /api/foo failed:', err);
  res.status(500).json({ error: 'Internal server error' });
}
```

Correlation middleware may rewrite 5xx bodies anyway — still don't put `err.message` in JSON.

## Anti-patterns (seen in AI-shaped code — avoid adding more)

| Anti-pattern | Prefer |
|---|---|
| God-file 2k-line route | Split by sub-resource |
| Copy-paste GST CASE | Shared fragment |
| `SELECT *` + filter in JS | WHERE + LIMIT |
| Swallow errors empty catch | Log + 500 |

## What breaks if you “simplify” locks away

Double-selling the same barcode, negative stock, two IRNs, quotation converted twice into two batches — silent money corruption.

## Interview question

*When is `SKIP LOCKED` wrong?*

:::info Answer sketch
When the business requires a **specific** set of rows (exact barcodes reserved for this order). Skipping would fulfill a different set than the user confirmed.
:::

## Related

- [Routes Catalog](/backend/routes-catalog)  
- [pg-db](/backend/pg-db)  
- [Utils Catalog](/backend/utils-catalog)  
- [Lab: Add Endpoint](/labs/lab-add-endpoint)  
