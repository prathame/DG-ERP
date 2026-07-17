---
sidebar_label: Quiz · Architecture
title: "Quiz: Architecture"
description: A 16-question self-check on Dhandho's system architecture, multi-tenancy, boot sequence, and design trade-offs — with full explanations, not just answers.
---

# Quiz: Architecture

:::tip How to use this quiz
Answer every question on paper (or out loud to a rubber duck) **before** opening any answer dropdown. The goal isn't a score — it's finding out precisely which chapter you need to re-read. A wrong answer with a clear explanation is more valuable than a lucky right one.
:::

Prerequisite reading: [System Overview](/architecture/system-overview), [Multi-tenancy](/architecture/multi-tenancy), [Request Lifecycle](/architecture/request-lifecycle), [Design Decisions](/architecture/design-decisions).

## Section A — The big picture

### Q1

How many primary client surfaces share the one Express API, and name them.

<details>
<summary>Answer</summary>

**Four:** Web SPA, Electron Cloud, Electron On-Prem, and Service Mobile (Capacitor offline phone for service type only). Same React features where applicable; Service Mobile uses on-device PGlite + SA `DG-SM-` licenses. See [Product Surfaces](/architecture/four-surfaces).

</details>

### Q2

What starts first on server boot: the HTTP listener, or `initSchema()`?

<details>
<summary>Answer</summary>

`initSchema()` (via `initDatabase()`), and it runs **before** `app.listen()`. The boot order is: `assertCriticalEnv()` → `initDatabase()`/`initSchema()` → `createApp()` → `.listen()`. No request can ever hit a server whose schema isn't ready, because the schema step is synchronous (awaited) and blocks the listen call. See [System Overview](/architecture/system-overview)'s boot sequence diagram.

</details>

### Q3

Why is there no React Router in this codebase?

<details>
<summary>Answer</summary>

The authenticated app is fundamentally a small number of tabs within one session (`activeTab` state + `history.pushState` for back-button support), not a deep multi-page site with meaningfully distinct, bookmarkable URLs per screen. A hand-rolled `switch`-on-`activeTab` in `App.tsx` covers that need with far less code and zero extra dependency surface — the trade-off is weaker deep-linking (you can't bookmark "Sales → Invoice #4021" as a URL) and no built-in nested-route/loader machinery, which simply isn't needed here. See [Design Decisions](/architecture/design-decisions) and [App Shell](/frontend/app-shell).

</details>

## Section B — Multi-tenancy

### Q4

Name the three "locks" that enforce tenant isolation, in the order they actually matter day to day.

<details>
<summary>Answer</summary>

1. **`WHERE tenant_id = $1`** in every query — the one doing the real work on every single request.
2. **JWT-derived `tenantId`** — server-side, set once at login, never trusted from a client-supplied header (an `X-Tenant-ID` header is explicitly overwritten server-side, not read).
3. **Postgres RLS** — a backstop policy that exists but doesn't protect the application's own queries, because the app connects as the table owner, and owners bypass RLS.

See [Multi-tenancy](/architecture/multi-tenancy) for the full "three locks" framing.

</details>

### Q5

Why is Postgres RLS enabled on ~30 tables if it doesn't protect the application's own connection?

<details>
<summary>Answer</summary>

Defense-in-depth against a **different** class of access: any tool, script, or future service that connects with a *non-owner* role (e.g. a read-only reporting credential, a support engineer's psql session using a restricted role) is still bound by RLS policies. It's a deliberate second line of defense for a threat model where "someone bypasses the application layer entirely," not a substitute for `WHERE tenant_id` in the app's own queries.

</details>

### Q6

What was tried and reverted regarding `FORCE ROW LEVEL SECURITY`, and why?

<details>
<summary>Answer</summary>

`FORCE ROW LEVEL SECURITY` (which would apply RLS even to the table owner) was tried, then reverted. The `pg` connection pool hands out different physical connections per query, and a `SET app.tenant_id = ...` on one connection doesn't carry over to a different connection used for a later query in the same logical request. With FORCE active, this mismatch causes queries to **silently return zero rows** instead of the correct data — a worse failure mode (silent data loss / "my data disappeared") than simply relying on the existing `WHERE tenant_id` clause.

</details>

### Q7

A composite primary key `(id, tenant_id)` appears on tenant-scoped tables. What does this buy you that a plain `id` primary key wouldn't?

<details>
<summary>Answer</summary>

It makes `tenant_id` mismatches a **database-level integrity error**, not just an application bug: a foreign key referencing `(id, tenant_id)` forces the referencing row to belong to the *same* tenant as the row it points to — a query or migration that tries to link two rows from different tenants fails at the database layer rather than silently succeeding. It's a structural guardrail on top of the query-level `WHERE tenant_id` discipline.

</details>

## Section C — Request lifecycle & boot

### Q8

List the Express middleware stack in `server/app.ts`, in order, from memory. (Don't worry about the exact function names — get the *order* and *purpose* right.)

<details>
<summary>Answer</summary>

Roughly: correlation ID assignment → `helmet` (security headers) → CORS → tiered rate limiting → body parsing/`QUERY` method shim → global JWT auth (`authMiddleware`) → `enforceModulePermissions` → route handlers → static asset serving (SPA fallback) → error handler. The exact order matters: e.g. correlation ID must be assigned before anything else can reference it in logs, and auth must run before permissions can check anything. See [Middleware Stack](/backend/middleware-stack) for the authoritative line-by-line breakdown.

</details>

### Q9

Does the client-supplied `X-Tenant-ID` header ever win over the JWT's embedded tenant claim?

<details>
<summary>Answer</summary>

No. The server always derives `req.tenantId` from the verified JWT payload; any client-sent tenant header is either ignored or explicitly overwritten. Trusting a client-controlled header for tenant scoping would make cross-tenant access trivial — this is one of the load-bearing assumptions of the whole multi-tenancy model.

</details>

### Q10

Why does the global auth middleware re-query the database for a user's current role/status on every request instead of only trusting the JWT's embedded claims?

<details>
<summary>Answer</summary>

Because a role change, permission change, or tenant suspension needs to take effect quickly — within the 30-second `authCache` TTL, not "whenever this user's 24-hour JWT happens to expire." Trusting only the JWT's claims would mean a demoted or suspended user keeps full access for up to 24 hours after the change. The `authCache` exists specifically to make this DB re-check cheap on average, without going fully stale.

</details>

## Section D — On-prem & GST

### Q11

On-prem Electron installs run their own embedded Postgres. What do they still need the internet for?

<details>
<summary>Answer</summary>

License activation and periodic heartbeat (and settings/update pushes) — not day-to-day ERP data, which stays entirely local against the embedded database. This is what makes the on-prem product credible for customers in low-connectivity areas, while still giving the vendor a way to enforce licensing.

</details>

### Q12

Where does GST e-Invoice (IRN) generation actually run — browser or server — and why does that matter?

<details>
<summary>Answer</summary>

**Server**, via `server/services/nic-api.ts` and the `gst-api` routes. It matters because the credentials and cryptographic material needed to talk to the government's NIC API (and the AES key derived from `JWT_SECRET` used to decrypt stored per-tenant GST credentials) must never reach client-side JavaScript, where they'd be extractable by anyone with DevTools open.

</details>

## Section E — Trade-offs and "why not X"

### Q13

Why raw `pg` and hand-written SQL instead of an ORM (e.g. Prisma, TypeORM)?

<details>
<summary>Answer</summary>

Full control over exactly which query runs, easy to reason about performance and locking behavior (`FOR UPDATE SKIP LOCKED` for distribution conversion, for instance), and no ORM abstraction to fight when a query needs a shape an ORM's query builder doesn't naturally express. The cost: no compile-time schema/type safety between SQL and TypeScript, and `WHERE tenant_id` discipline is a *convention*, not something the ORM enforces for you. See [Design Decisions](/architecture/design-decisions).

</details>

### Q14

Why does `initSchema()` run idempotent `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements instead of using a real migration framework with numbered, ordered migration files?

<details>
<summary>Answer</summary>

Simplicity for a small team and low migration volume: there's exactly one "current" schema definition to read (in `pg-db.ts`), not a chain of historical migration files to mentally replay. The cost that's explicitly accepted: no rollback story for a bad schema change, no per-environment migration history/audit trail, and destructive changes (dropping a column, changing a type) aren't well-supported by this pattern — see [Tech Debt Register](/scaling/tech-debt-register) for when this would need to change.

</details>

### Q15

The main JS bundle is capped at 256KB gzipped by a CI check. What's the primary mechanism (not the CI check itself) that keeps the bundle under that limit as the app grows?

<details>
<summary>Answer</summary>

`lazy()`-loading every feature view from `App.tsx`, plus `manualChunks` splitting heavy, situational vendor dependencies (`xlsx`, the barcode/QR scanner libs) into their own chunks that are only downloaded by users who open the screens that need them. The CI check is a tripwire that catches regressions; the actual defense is architectural. See [Bundle Performance](/performance/bundle).

</details>

### Q16

What's the single biggest way a change accidentally regresses the main bundle size, and how would you catch it in review?

<details>
<summary>Answer</summary>

Adding a new feature or shared component via a static `import` in `App.tsx` (or in something `App.tsx` imports eagerly) instead of `lazy(() => import(...))`. In review, check that any new top-level view is wired through the existing `lazy()` pattern, and when in doubt, run `npm run analyze` locally to see exactly what landed in the main chunk before merging.

</details>

## Score yourself

| Score | Meaning |
|---|---|
| 0–8 correct | Re-read [System Overview](/architecture/system-overview) and [Multi-tenancy](/architecture/multi-tenancy) fully, then retry |
| 9–13 correct | Solid — pair the weak sections with the matching lab ([Lab: Tenant Isolation](/labs/lab-tenant-isolation)) |
| 14–16 correct | Ready to explain this architecture to a new hire, or defend it in a design review |

## Related

- [System Overview](/architecture/system-overview)
- [Multi-tenancy](/architecture/multi-tenancy)
- [Design Decisions](/architecture/design-decisions)
- [Request Lifecycle](/architecture/request-lifecycle)
- [Lab: Tenant Isolation](/labs/lab-tenant-isolation)
- [Quiz: Security](/quizzes/quiz-security)
