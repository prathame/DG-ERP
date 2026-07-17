---
sidebar_label: API Integration Testing
title: API Integration Testing — Supertest + Real PostgreSQL
description: How DG-ERP's tests/api/*.test.ts suite exercises real routes against a real database, and the conventions that make it reliable.
---

# API Integration Testing

`tests/api/*.test.ts` is the workhorse layer — ~30 files covering nearly every route file, running real HTTP-shaped requests (via Supertest) against the **real** Express app (`createApp()`) and a **real** PostgreSQL 16 instance. No mocking of the database, no mocking of middleware.

## Why real Postgres, not a mock

The single most important design decision in this layer: **it never mocks `pool.query`.** A mocked DB layer can make a test pass while the underlying SQL is subtly wrong — a missing `tenant_id` filter, a typo'd column name, an incorrect `JOIN` — because the mock doesn't know what "correct" SQL even looks like. Testing against real Postgres 16 (matching production's major version — see [Local Setup](/tutorials/local-setup)) means a test failure here is a real signal: either the SQL is wrong, or the test's expectation is wrong. There's no third category of "the mock didn't behave like real Postgres."

## How the app boots for tests, without a real network port

```ts
// server/app.ts
export function createApp(): express.Application {
  // ... entire middleware + route registration ...
  return app;
}
```

`createApp()` builds the full Express app object but never calls `.listen()` — that's exactly what makes it usable both by `server/index.ts` (which does call `.listen()`) and by tests (which pass the app object directly to `supertest(app)`, letting Supertest handle the request/response cycle in-process, without binding an actual TCP port). This is why the function is factored out as a separate export in the first place — see [File Walkthrough: server/app](/files/server/app).

```ts
import request from 'supertest';
import { createApp } from '../../server/app';

const app = createApp();

it('rejects login with wrong password', async () => {
  const res = await request(app)
    .post('/api/auth/login')
    .send({ slug: tenantSlug, email: 'a@b.com', password: 'wrong' });
  expect(res.status).toBe(401);
});
```

## The standard test lifecycle pattern

Nearly every file in `tests/api/` follows this shape:

```ts
import { createTestToken, cleanupTestData, pool } from '../helpers';

let tenantId: string;
let token: string;

beforeAll(async () => {
  // 1. Create a real tenant + user row directly via SQL (or via provisionTenant)
  tenantId = `TEST-${Date.now()}`;
  await pool.query(`INSERT INTO tenants (...) VALUES (...)`, [...]);
  await pool.query(`INSERT INTO users (...) VALUES (...)`, [...]);
  // 2. Mint a JWT for that tenant/user without going through the real login flow
  token = createTestToken({ userId: 'U1', tenantId, email: 'a@b.com', role: 'Admin', name: 'Test' });
});

afterAll(async () => {
  await cleanupTestData(tenantId);
});
```

**Why mint a token directly instead of calling `POST /api/auth/login` in every test file's setup:** it decouples "testing the products route" from "testing the login route" — if login had a bug, every *other* test file would fail too, which is noisy and unhelpful for triage. `createTestToken` (`tests/helpers.ts`) signs a JWT with the same `JWT_SECRET`/algorithm the real server uses, so it's indistinguishable from a real session token to any route's auth middleware — but its *creation* bypasses the login endpoint entirely, isolating failures to the module actually under test.

## What this layer is specifically good at catching

| Bug class | Example test | Where |
|---|---|---|
| **Missing tenant scoping** | Create data as Tenant A, request as Tenant B, assert empty/404 | `tests/api/security.test.ts`, and scattered through most other files |
| **Wrong permission gating** | Request a `PUT` as a `Staff`-role token, assert `403` | Any route with `requireAdmin`/`requireRole` |
| **SQL correctness** | Assert a computed field (e.g. GST split, outstanding balance) matches hand-calculated expected value | `tests/api/gst-helpers.test.ts`, `finance.test.ts`, `finance2.test.ts` |
| **Status code contracts** | Assert `404` for a nonexistent ID, not `500` | Most `*.test.ts` files, implicitly |
| **Rate limiting behavior** | Assert the 6th rapid login attempt within a minute gets `429` | `tests/api/http-auth.test.ts` |
| **Response shape drift** | Assert the JSON keys returned match what the frontend actually expects (camelCase, not raw snake_case columns) | Nearly every route test, since routes map DB columns to camelCase API responses |
| **Party-linked invoice ledger** | Two invoices same `party_id`, different display names → one summary card; unknown party → 400; price-list bulk by name | `tests/api/http-invoices-finance.test.ts` |
| **partyKey parsing** | `vendor:` / `customer:` / `name:` / empty prefix / URL encoding | `tests/unit/invoice-finance-party.test.ts` |

## The cross-tenant test — the most important one in the suite

`tests/api/security.test.ts` deserves special attention because it directly tests the property [Mental Models](/tutorials/mental-models) and [Failure Scenarios](/sre/failure-scenarios) call the scariest failure mode in this codebase:

```ts
it('tenant B cannot read tenant A\'s products', async () => {
  const resA = await request(app).post('/api/products').set(authHeaders(tokenA, tenantA)).send({ name: 'Secret Product' });
  const productId = resA.body.id;

  const resB = await request(app).get(`/api/products/${productId}`).set(authHeaders(tokenB, tenantB));
  expect(resB.status).toBe(404); // not 200, not 403 leaking existence — a clean 404
});
```

Notice the assertion is `404`, not `403` — a `403` would confirm to an attacker that the resource *exists* but they can't access it (an information leak in itself); a `404` gives no signal either way. This is a subtle but important convention: check it whenever you add a new tenant-scoped `GET`.

## Running this layer

```bash
# Needs a real Postgres reachable via DATABASE_URL — see Local Setup
npx vitest run tests/api/
npx vitest run tests/api/products.test.ts
npx vitest run tests/api/ --coverage      # with coverage — see Coverage Gates for the caveat on scope
```

CI runs this against an ephemeral `postgres:16` service container (`pr-check.yml`, `build.yml`, `release.yml`'s `test` job) — a fresh database every run, `initDatabase()` called once via `globalSetup.ts`.

## Common mistakes when writing new API integration tests

1. **Forgetting `cleanupTestData` in `afterAll`** — leaves orphaned tenants in whatever DB you ran against.
2. **Sharing a `tenantId` across test files running in parallel** — Vitest can run files concurrently; always generate a unique ID (`TEST-${Date.now()}-${Math.random()}`) rather than a fixed string.
3. **Testing only the happy path** — the valuable tests here are the 401/403/404 boundary cases, not just "does creating a product return 201."
4. **Asserting on exact error message strings from `err.message`** — remember the two-faced error contract (see [Logging](/sre/logging)); client-visible 500s are always generic. Assert on status code and the `error` field's *generic* text, not internal details that were never sent to the client anyway.
5. **Deleting `standalone_invoices` before `invoice_payments` in cleanup** — the FK is `ON DELETE RESTRICT`. `cleanupTestData` in `tests/helpers.ts` deletes payments first; keep that order if you extend the helper.

## Related pages

- [Testing Overview](./overview.md)
- [Unit Testing](./unit.md)
- [Coverage Gates](./coverage-gates.md)
- [Lab: Tenant Isolation](/labs/lab-tenant-isolation)
- [Security → Tenant Isolation](/security/tenant-isolation)
