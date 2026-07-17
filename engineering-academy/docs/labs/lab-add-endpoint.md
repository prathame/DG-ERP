---
sidebar_label: "Lab: Add an Endpoint"
title: "Lab: Add a New Endpoint End-to-End"
description: Build a small, complete feature — a coupon system — that touches the schema, RLS, permissions, a route file, and a frontend call. The fastest way to internalize the full request lifecycle.
---

# Lab: Add an Endpoint End-to-End

## Goal

Add `GET /api/coupons` and `POST /api/coupons` — a minimal tenant-scoped "coupon code" feature — wired correctly through every layer this codebase requires. This lab is deliberately small in *scope* and large in *coverage*: by the end, you will have touched the schema, RLS, the permission system, a route file, and the frontend API client.

## Step 1 — Add the table

In `server/pg-db.ts`, inside `initSchema()`, add:

```sql
CREATE TABLE IF NOT EXISTS coupons (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, tenant_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_coupons_tenant_code ON coupons(tenant_id, UPPER(code));
```

Add `'coupons'` to the `rlsTables` array further down in the same file, so it gets the standard tenant-isolation RLS policy automatically applied in the loop. See [Schema Overview](/database/schema-overview) and [RLS](/database/rls) before writing this — notice the composite PK and the tenant-scoped unique index, both following the established convention.

## Step 2 — Write the route file

Create `server/routes/coupons.ts`:

```typescript
import express from 'express';
import { pool } from '../pg-db';
import { uid } from '../utils/helpers';

const router = express.Router();

router.get('/api/coupons', async (req, res) => {
  const tenantId = (req as any).tenantId;
  const result = await pool.query(
    'SELECT id, code, discount_percent, active FROM coupons WHERE tenant_id = $1 ORDER BY created_at DESC',
    [tenantId]
  );
  res.json(result.rows.map(r => ({ id: r.id, code: r.code, discountPercent: r.discount_percent, active: r.active })));
});

router.post('/api/coupons', async (req, res) => {
  const tenantId = (req as any).tenantId;
  const { code, discountPercent } = req.body;
  if (!code || typeof discountPercent !== 'number') {
    return res.status(400).json({ error: 'code and discountPercent are required.' });
  }
  const existing = await pool.query(
    'SELECT id FROM coupons WHERE tenant_id = $1 AND UPPER(code) = UPPER($2)',
    [tenantId, code]
  );
  if (existing.rows[0]) return res.status(409).json({ error: `Coupon code "${code}" already exists.` });

  const id = uid('CPN');
  await pool.query(
    'INSERT INTO coupons (id, tenant_id, code, discount_percent) VALUES ($1, $2, $3, $4)',
    [id, tenantId, code, discountPercent]
  );
  res.status(201).json({ id, code, discountPercent, active: true });
});

export default router;
```

Notice this follows [Backend Patterns](/backend/patterns): tenant filter first, optimistic existence check before insert, `uid()` for ID generation, hand-mapped camelCase response.

## Step 3 — Wire it into `app.ts`

```typescript
import couponsRouter from './routes/coupons';
// ... in the app.use() block:
app.use(couponsRouter);
```

## Step 4 — Register the module permission (the step everyone forgets)

In `server/middleware/permissions.ts`, add an entry to `PATH_MODULE`:

```typescript
['/coupons', 'sales'],  // or whichever module makes sense
```

**Stop here and read [Permissions](/backend/permissions) if you skipped step 4.** Without it, `moduleForPath('/coupons')` returns `null`, and `enforceModulePermissions` calls `next()` unconditionally — your new endpoint is reachable by *any* authenticated user regardless of their role or module permissions. This is the single most important thing this lab is meant to teach: **a working endpoint and a correctly-secured endpoint are not the same thing, and nothing forces you to notice the gap.**

## Step 5 — Call it from the frontend

In `src/api.ts`, add to the `api` object:

```typescript
coupons: {
  list: () => fetchApi<CouponRecord[]>('/coupons'),
  create: (code: string, discountPercent: number) =>
    fetchApi<CouponRecord>('/coupons', { method: 'POST', body: JSON.stringify({ code, discountPercent }) }),
},
```

## Done when

- [ ] `npm run server` boots with no schema errors, and `\d coupons` in `psql` shows the RLS policy applied.
- [ ] `POST /api/coupons` with a duplicate code (case-insensitively) returns `409`, not a raw constraint-violation error.
- [ ] A `Staff`-role test user with `sales: 'view'` gets `403` on `POST /api/coupons` but `200` on `GET /api/coupons`.
- [ ] A test user from a **second, different tenant** cannot see the first tenant's coupons via `GET /api/coupons`.
- [ ] You can explain, without looking it up again, exactly what would have gone wrong if you'd skipped Step 4.

## Related

- [Backend → Patterns](/backend/patterns)
- [Permissions](/backend/permissions)
- [Schema Overview](/database/schema-overview)
- [Security → Tenant Isolation](/security/tenant-isolation)
- [Testing → How to Add Tests](/testing/how-to-add-tests)
