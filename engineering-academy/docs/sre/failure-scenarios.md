---
sidebar_label: Failure Scenarios
title: Failure Scenarios — Worked Examples
description: Concrete "what if X breaks" walkthroughs for DG-ERP, each tracing exactly which code path fires and how you would notice.
---

# Failure Scenarios

Runbooks tell you what to *do*. This page is about building the intuition for what *would happen* — tracing the actual code path — so that when something breaks that isn't in a runbook yet, you can reason about it the same way.

## Scenario 1 — PostgreSQL becomes unreachable

**What happens, in order:**

1. Any in-flight query fails. Route handlers wrapped in `try/catch` (which is all of them) hit their `catch` block, log via `console.error`, and respond `500`.
2. `GET /api/health`'s `pool.query('SELECT 1')` throws → responds `503 { ok: false, db: 'down' }`.
3. Render's health check (or the Dockerfile `HEALTHCHECK`) starts failing. Depending on platform configuration, the instance may be marked unhealthy or restarted — restarting does **not** fix an external DB outage, so this can loop.
4. `pool.on('error', ...)` in `server/pg-db.ts` catches pool-level connection errors and logs them — but note it explicitly no-ops when `DEPLOYMENT_MODE === 'onprem'` (expected there, since the local embedded Postgres shuts down with the app).
5. New login attempts fail at the `SELECT ... FROM users u JOIN tenants t ...` step inside the auth middleware in `server/app.ts` — users see a generic error, not "database is down" (by design — never leak infra details to end users).

**How you'd notice:** health check failures (if monitored), a burst of `logger.error` entries with similar messages, customer reports of "everything is broken."

**See:** [DB Down Runbook](/runbooks/db-down)

## Scenario 2 — JWT_SECRET is rotated without a coordinated rollout

**What happens:**

1. Every JWT issued with the *old* secret fails `jwt.verify(token, NEW_SECRET, ...)` in the global auth middleware (`server/app.ts`) → `401 { error: 'Invalid or expired token' }`.
2. Every currently-logged-in user, across cloud, mobile, and Electron cloud wrapper, is logged out simultaneously.
3. New logins work fine (new tokens are signed with the new secret).
4. On-prem installs are **not** affected for their local API calls (each on-prem instance has its own independent `JWT_SECRET` from its own `.env`), but if the on-prem instance's *cloud-facing* activation/heartbeat calls happen to reuse platform-level tokens... (they don't — `onprem.ts` heartbeat uses the license key, not a tenant JWT — so on-prem is fully insulated from a cloud `JWT_SECRET` rotation).

**How you'd notice:** a spike in `401`s immediately after a config change/deploy, correlated in time with the rotation, and a flood of "I got logged out" reports.

**Why you'd still do this deliberately:** if a `JWT_SECRET` is ever suspected compromised (e.g. accidentally committed), rotating it is the correct move *despite* this blast radius — see [Security → Secrets](/security/secrets). Communicate the "everyone gets logged out" side effect ahead of time rather than being surprised by the support load.

## Scenario 3 — A tenant's subscription silently expires

**What happens:**

1. On the next authenticated request, the global auth middleware computes `expiresAt` from `trial_ends_at` or `subscription_ends_at` depending on `tenants.status`.
2. If `expiresAt < now`, every request gets `403 { error: 'Subscription expired. Contact admin to renew.' }` — this happens **before** the route handler runs, so it's consistent across every endpoint, not just some.
3. The frontend sees a `403` on its next API call (could be anything — a background poll, a page load) and should show an appropriate message — verify this is actually handled gracefully in `src/api.ts`'s error path rather than surfacing a raw fetch error.
4. Read access is not specially preserved — this is a hard cutoff, not a read-only degraded mode (unlike `suspended`, see Scenario 4, which is handled identically at this layer).

**How you'd notice:** the affected tenant's Admin contacts support; from your side, a `403` spike scoped to one `tenant_id` in logs (once you have tenant-scoped log search) is the earliest automatic signal.

## Scenario 4 — A tenant is suspended (by Super Admin, or in the future by a billing failure)

**What happens:** identical mechanism to Scenario 3 — `row.status === 'suspended'` short-circuits with `403 { error: 'Account suspended. Contact admin.' }` in the global auth middleware, before any route handler executes. Login itself (`POST /api/auth/login`) is a `PUBLIC_PATH`, so a suspended tenant's users can still *attempt* to log in and get a normal-looking success... only to be blocked on their very next API call. This is worth knowing so you don't assume "user says login succeeded" rules out suspension as the cause of what they report next.

**See:** [Tenant Suspended Runbook](/runbooks/tenant-suspended)

## Scenario 5 — GST NIC sandbox/production API is down or slow

**What happens:**

1. `server/services/nic-api.ts`'s `NicApiClient` makes an outbound HTTPS call to generate an IRN (E-Invoice) or E-Way Bill.
2. If it times out or errors, `server/routes/gst-api.ts`'s `safeError()` function filters the error message through an allowlist regex before it can reach the client — only short, expected-shaped messages pass through; anything else becomes a generic `Internal server error`. This prevents a raw NIC API error (which might contain internal URLs or unexpected formats) from leaking to the browser.
3. The specific Distribution batch's E-Invoice/E-Way Bill generation fails; the underlying distribution record itself is unaffected (it was already saved) — this is a secondary action, not a blocking one, by design.
4. In `mock` mode (the default, `gst_api_mode` on `bill_settings`), none of this can happen — mock mode never calls out to NIC at all, and always "succeeds" with synthetic IRN/EWB numbers. This is why local dev and most demo tenants never see this failure class.

**How you'd notice:** a cluster of failed E-Invoice/E-Way Bill attempts specifically for tenants in `sandbox`/`production` GST API mode, likely reported by the customer as "I can't generate my e-way bill."

**See:** [GST API Failures Runbook](/runbooks/gst-api-failures)

## Scenario 6 — An on-prem customer's machine loses power/crashes mid-write

**What happens:**

1. The embedded Postgres (`electron/onprem/pg-manager.ts`) may be left in an unclean shutdown state. On next launch, Postgres's own crash-recovery (WAL replay) typically brings it back consistent — this is standard Postgres durability, not something DG-ERP code manages specially.
2. If the *disk itself* is damaged (not just an unclean shutdown), there is **no automatic recovery** — see [Disaster Recovery](./disaster-recovery) for why this is the single biggest on-prem DR gap.
3. The Electron app's heartbeat to the cloud (`POST /api/onprem/heartbeat`, every `HEARTBEAT_INTERVAL_MS`) simply stops arriving. From the cloud side, `onprem_licenses.last_seen` goes stale — this is your only signal, and it's not real-time (up to ~60 minutes of lag by design).

**How you'd notice:** the customer calls support saying the app won't open, or (less directly) you notice a stale `last_seen` if you're proactively monitoring the on-prem fleet — which, per [Metrics & Alerting](./metrics-alerting), isn't yet automated as an alert.

## Scenario 7 — A route handler forgets `tenant_id` in a query

**What happens:**

1. The query returns rows across **all** tenants (or, if RLS's `current_setting('app.tenant_id', true)` happens to be unset on that connection — which it usually is, since most handlers use the shared `pool` directly rather than `withTenantClient`/RLS-context connections — RLS does not silently filter these either, because the pool's connecting role is the table owner, which bypasses RLS by design).
2. This is a **cross-tenant data leak** — potentially severe, depending on the endpoint. It would surface as "I can see another company's products/customers/sales," almost certainly reported by an alert customer rather than caught internally, absent a specific test for it.
3. `tests/cases/cross-tenant.md` and `tests/api/security.test.ts` exist specifically to catch this class of bug in CI/manual QA — but only for the scenarios they explicitly enumerate. A *new* route without an equivalent test is exposed.

**How you'd notice, ideally before a customer does:** code review specifically checking every new/changed query for `tenant_id`, and a habit of writing a cross-tenant-isolation test (see [Lab: Tenant Isolation](/labs/lab-tenant-isolation)) for every new tenant-scoped table or route.

**Why this is the scenario to fear most:** unlike downtime (annoying, visible, self-resolving once fixed), a tenant-isolation bug can cause silent, ongoing, undetected data exposure with legal and trust consequences disproportionate to the size of the code change that caused it.

## Scenario 8 — The Postgres connection pool is exhausted under load

**What happens:**

1. New queries wait for a free connection up to `connectionTimeoutMillis: 10000` (10 seconds), then throw a timeout error.
2. Every route touching the DB (which is nearly all of them) starts returning slow responses, then `500`s, roughly simultaneously — this can look like "everything broke at once" even though the root cause is one resource.
3. `GET /api/health` itself competes for the same pool — under severe saturation, even the health check can time out, which is actually a *correct* signal (the DB layer genuinely isn't keeping up) rather than a false negative.

**How you'd notice:** latency climbing across unrelated-looking endpoints simultaneously, then a wave of `500`s — a classic saturation signature, see [Golden Signals](./golden-signals).

## Related pages

- [Golden Signals](./golden-signals.md)
- [SLIs & SLOs](./slis-slos.md)
- [Runbooks Index](/runbooks/)
- [Security → Threat Model](/security/threat-model)
- [Lab: Tenant Isolation](/labs/lab-tenant-isolation)
