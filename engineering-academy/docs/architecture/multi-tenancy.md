---
sidebar_label: Multi-tenancy
title: Multi-tenancy — The Non-Negotiable Invariant
description: How Dhandho isolates tenant data across a shared PostgreSQL schema using JWT-derived tenant IDs, explicit SQL predicates, and Row Level Security as a safety net.
---

# Multi-tenancy

If you internalize nothing else from this academy, internalize this page. A cross-tenant data leak in a multi-tenant SaaS ERP means one business owner sees another business owner's sales, customers, and financials. It is the single worst class of bug this codebase can produce, and this page is about the three overlapping mechanisms that exist specifically to make it structurally hard to write that bug by accident.

:::danger This is the most important page in the academy
Every other architecture decision is negotiable and revisitable. This one is not. If a code review comment says "does this need to be tenant-scoped?", the answer for any table with a `tenant_id` column is always **yes**.
:::

## The shared-schema model

Dhandho uses **one PostgreSQL database, one schema, shared by every tenant** — not database-per-tenant, not schema-per-tenant. Every business-data table carries a `tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE` column, and most tables use a **composite primary key** `(id, tenant_id)` rather than a globally unique `id` alone — meaning the same `id` value can legitimately exist for two different tenants without colliding.

```mermaid
erDiagram
    tenants ||--o{ users : "tenant_id"
    tenants ||--o{ products : "tenant_id"
    tenants ||--o{ product_sales : "tenant_id"
    tenants ||--o{ vendors : "tenant_id"
    tenants ||--o{ warranties : "tenant_id"
    tenants {
        text id PK
        text slug
        text company_name
        text status
        jsonb tab_config
    }
    products {
        text id
        text tenant_id FK
        text name
    }
```

:::tip Analogy
A shared-schema multi-tenant database is like a **shared warehouse with individually locked cages**, not separate warehouses per customer. It's cheaper to operate (one building, one security guard, one fire alarm system) than giving every customer their own warehouse — but it only works if every single cage door is actually locked, every time, with no exceptions. The rest of this page is about how Dhandho makes sure no cage is ever left unlocked.
:::

## Layer 1: the JWT carries `tenantId`, and the server — never the client — decides it

When a user logs in (`POST /api/auth/login`), the server issues a JWT whose payload includes `tenantId` (alongside `userId`, `role`, `email`, `name`, optional `vendorId`):

```ts
// server/middleware/auth.ts
export interface JwtPayload {
  userId: string;
  tenantId: string;
  role: string;
  email: string;
  name: string;
  vendorId?: string | null;
  permissions?: Record<string, string>;
  impersonatedBy?: string;
  iat?: number;
}
```

On every subsequent request, the global auth middleware (`server/app.ts`) verifies this JWT and — critically — **overwrites** `req.headers['x-tenant-id']` with the value decoded from the token, regardless of any `X-Tenant-ID` header the client happened to send:

```ts
const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] });
if (decoded.tenantId && decoded.userId) {
  req.headers['x-tenant-id'] = decoded.tenantId;   // ← server-authoritative, always
  // ...
}
```

Route handlers then read `tenantId` from `req.headers['x-tenant-id']` — which, for an authenticated request, is now guaranteed to be the value the server itself derived from a cryptographically verified token, not anything the browser sent.

:::warning Why the `X-Tenant-ID` header exists at all, then
The header name `X-Tenant-ID` appears in `Access-Control-Allow-Headers` and is genuinely readable client-side for *unauthenticated* flows (e.g. resolving a tenant by slug before login, `/api/tenant/by-slug/:slug`). For any **authenticated** request, though, the value the client might send in that header is silently discarded and replaced by the JWT-derived value the instant the auth middleware runs. A client cannot pick which tenant it operates as merely by setting a header — this is the whole point.
:::

## Layer 2: explicit `WHERE tenant_id = $1` in every query

This is the workhorse layer — the one enforced by human (or AI-agent) discipline in every route handler, not by a database feature:

```ts
// The canonical pattern, everywhere in server/routes/
const rows = await pool.query(
  'SELECT * FROM products WHERE tenant_id = $1 AND id = $2',
  [tenantId, productId]
);
```

Because `tenantId` here comes from the JWT-derived, server-set `req.headers['x-tenant-id']` (Layer 1), and because the predicate is on **every** query against a tenant-scoped table, no row from Tenant A's `products` table can ever appear in a response to Tenant B — provided the predicate is never forgotten.

:::danger Common mistake — the one that matters most
The single most dangerous class of bug in this codebase is a query against a tenant-scoped table **missing** the `WHERE tenant_id = $1` predicate. It will work perfectly in every manual test with one tenant in the database, pass code review from someone in a hurry, and then leak data silently the moment a second tenant exists. There is no compiler error for this. The only defenses are review discipline, tests that seed *multiple* tenants and assert isolation (see [Lab: Tenant Isolation](/labs/lab-tenant-isolation)), and Layer 3 below.
:::

## Layer 3: PostgreSQL Row Level Security — the safety net

This is the layer that exists specifically to catch the mistake described above. `server/pg-db.ts` enables RLS on every tenant-scoped table and creates a matching policy:

```sql
ALTER TABLE products ENABLE ROW LEVEL SECURITY;

CREATE POLICY products_tenant_isolation ON products
  USING (tenant_id = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true));
```

This is applied identically across all ~30 tenant-scoped tables (`users`, `vendors`, `customers`, `products`, `product_inventory`, `product_distribution`, `product_sales`, `warranties`, `quotations`, `orders`, `standalone_invoices`, and more).

`withTenantClient()` (`server/pg-db.ts`) is the helper that actually sets the session variable RLS checks against, scoped to a single transaction:

```ts
export async function withTenantClient<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

```mermaid
flowchart TB
    subgraph App["Application layer"]
        A1["Route handler builds query"]
        A2["WHERE tenant_id = $1<br/>(explicit predicate)"]
    end
    subgraph DB["PostgreSQL"]
        R1["RLS policy checks<br/>tenant_id = current_setting('app.tenant_id')"]
    end
    A1 --> A2 --> R1
    R1 -->|"policy holds"| Result["Row returned"]
    R1 -->|"policy violated"| Empty["Row excluded — even if the<br/>application query forgot the predicate"]
```

:::tip FORCE RLS is enabled — and safe (Phase 2 update)
`server/pg-db.ts` runs `ALTER TABLE ... FORCE ROW LEVEL SECURITY` on all 31 tenant-scoped tables. The earlier concern about `pool.query()` not setting `app.tenant_id` was solved by overriding `pool.query` itself via AsyncLocalStorage:

```typescript
// Every authenticated pool.query() auto-wraps in BEGIN / SET LOCAL app.tenant_id / COMMIT
(pool as any).query = async function(textOrConfig, values?) {
  const tenantId = requestContext.getStore()?.tenantId;
  if (!tenantId) return _rawPoolQuery(textOrConfig, values);
  const client = await pool.connect();
  await client.query('BEGIN');
  await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
  const result = await client.query(textOrConfig, values);
  await client.query('COMMIT');
  return result;
};
```

Routes using `pool.connect()` also call `setTenantContext(client, tenantId)` after BEGIN.

This is exactly why RLS here is described as a **safety net**, not the primary defense: it protects against direct database access, SQL injection that manages to inject a query without a hardcoded tenant filter, and reviewer-missed omissions in code that *does* use `withTenantClient()` — but it is not a substitute for Layer 2's explicit predicates in the common `pool.query()` path.

## The three locks, together

```mermaid
flowchart LR
    JWT["Lock 1: JWT tenantId<br/>(server decides, not the client)"] --> SQL["Lock 2: WHERE tenant_id = $1<br/>(explicit, in every query)"]
    SQL --> RLS["Lock 3: Postgres RLS policy<br/>(DB-level safety net)"]
```

:::tip Analogy, extended
Think of the three locks like a **bank vault door, a teller's ID check, and a silent alarm**. The JWT is the ID check at the counter — you can't just claim to be a different account holder. The `WHERE tenant_id` predicate is the vault door itself — the mechanism that actually prevents access. RLS is the silent alarm that still trips even if someone found a way to prop the vault door open, but it doesn't replace the door.
:::

## Slug-based routing and the frontend side of tenancy

Tenants are addressed by a human-readable `slug` (`/:slug/*` in the URL, e.g. `dhandho.app/acme-traders`), resolved server-side. `src/lib/session.ts` scopes every `localStorage` key to the current slug (`getSessionSlug()` parses `window.location.pathname`), so that opening two different tenant slugs in two browser tabs on the same machine doesn't cross-contaminate session state — each tenant's token, user object, and tenant ID are stored under slug-prefixed keys (`auth_token_acme-traders`, etc.). This is a **client-side UX convenience**, not a security boundary — the real isolation is still the three server-side locks above; a malicious script running in the page could still read any of these localStorage keys (see [Design Decisions](./design-decisions.md) for the accepted-risk discussion of JWT-in-localStorage).

## Key concepts

- **Shared schema, not database-per-tenant** — cheaper to operate, safe only because of the three-lock model.
- **Composite primary keys `(id, tenant_id)`** — the same entity ID can exist per-tenant without collision.
- **Server-authoritative tenant ID** — the JWT decides `tenantId`; a client-supplied header is never trusted for authenticated requests.
- **FORCE RLS is enabled** — `pool.query()` override sets `app.tenant_id` from AsyncLocalStorage on every authenticated request; `setTenantContext(client, tenantId)` covers `pool.connect()` transactions. Both layers together make FORCE RLS safe.
- **Slug-scoped `localStorage`** is a UX nicety, not a security control.

## Common mistakes

1. Writing a new query against a tenant-scoped table without `WHERE tenant_id = $1` — the most severe and most common mistake class in this codebase's history (see the `P0`-class fixes referenced in [AI Origin Assumptions](/overview/ai-origin-assumptions)).
2. Trusting a client-supplied `tenant_id` in a request body or query string for anything other than input to a query that will *still* be filtered by the JWT-derived tenant ID.
3. Adding a new `pool.connect()` transaction without calling `setTenantContext(client, tenantId)` after BEGIN — FORCE RLS will block all queries in that transaction, making the feature silently broken (this exact bug was found in `warranties.ts` during the Phase 3 audit).
4. Forgetting the composite primary key means `id` alone is not unique — a lookup by `id` without `tenant_id` can silently match the wrong tenant's row if IDs ever collide (they're generated with time-based prefixes like `T${Date.now()}`, which reduces but does not eliminate this risk).

## Interview question

> **Q: How does FORCE ROW LEVEL SECURITY work safely when most queries use `pool.query()` without explicit transactions?**
>
> Expected answer: `pool.query` is overridden in `server/pg-db.ts` to wrap every authenticated request in `BEGIN / SET LOCAL app.tenant_id / COMMIT` using AsyncLocalStorage (`requestContext`). This transparently injects the JWT tenant context into every `pool.query()` call without changing any route file. Routes using `pool.connect()` directly also call `setTenantContext(client, tenantId)` after BEGIN. Together these make FORCE RLS safe: every tenant query has `app.tenant_id` set, so the RLS policy `tenant_id = current_setting('app.tenant_id', true)` evaluates correctly.

## Related

- [System Overview](./system-overview.md)
- [Request Lifecycle](./request-lifecycle.md)
- [Personas & Roles](/overview/personas-and-roles)
- [Design Decisions](./design-decisions.md)
- [Lab: Tenant Isolation](/labs/lab-tenant-isolation)
