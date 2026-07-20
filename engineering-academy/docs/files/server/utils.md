---
sidebar_label: server/utils/*
title: File Walkthrough — server/utils/
description: Logger, PII redaction, env validation, auth cache, tenant helpers, secret encryption, pagination, barcode, and plan limits.
---

# File Walkthrough — `server/utils/`

## Purpose & business value

Ten small, single-purpose files (31 to 158 lines each) that every route file leans on. None of them touch Express directly — they're pure logic or thin wrappers around Node built-ins, which is exactly why they're the most thoroughly unit-tested part of the backend (see [Coverage Gates](/testing/coverage-gates), which specifically scopes its 90%/75% thresholds to this directory).

## File-by-file

### `logger.ts` (31 lines)

A thin wrapper (`logger.info/warn/error/debug`) around `console.*` plus optional Logtail forwarding. Every structured log call takes a message and a metadata object; the wrapper's job is to ensure metadata gets JSON-serialized consistently and, in production, shipped to Logtail if `LOGTAIL_SOURCE_TOKEN` is set. See [SRE → Logging](/sre/logging) for the full pipeline.

### `pii.ts` (38 lines)

Regex-based redaction (`redactPII(obj)`) applied before anything gets logged — strips password fields, masks email/phone-shaped strings, truncates long tokens. This is a **best-effort denylist**, not a guarantee — see [SRE → Logging](/sre/logging) for the explicit caveat that a genuinely novel PII shape (e.g. a GST number embedded in a free-text note field) could slip through.

### `env.ts` (56 lines) — `assertCriticalEnv()`

Fail-fast startup validation. Notably:
- Takes `env: NodeJS.ProcessEnv = process.env` as a **parameter with a default**, not a hardcoded global read — this is what makes it unit-testable with synthetic env objects (see [Unit Testing](/testing/unit)) without mutating real `process.env` between tests.
- Distinguishes production-cloud checks from on-prem (`DEPLOYMENT_MODE === 'onprem'`) — on-prem doesn't need `ALLOWED_ORIGINS` (no CORS concern, it's a local Electron app) or the managed-DB TLS assumptions.
- Has a regex denylist for weak DB passwords (`WEAK_DB_PASSWORD`) — refuses to boot in production against an obviously-default-credentialed database, a cheap guard against the most careless deploy mistake.

### `authCache.ts` (73 lines)

The in-memory, 30-second-TTL, 5,000-entry-capped cache backing `app.ts`'s per-request auth lookup (see [`app.ts` walkthrough](/files/server/app)). Keyed by `userId:tenantId:iat` specifically so a password change (which changes effective `iat` validity) or a new login doesn't accidentally serve pre-change cached data — old cache entries for an old `iat` simply become irrelevant, not wrong. `invalidateAuthCache` is called explicitly after known-stale-triggering actions (e.g. right after a password change) to avoid waiting out the 30s TTL.

### `tenant.ts`

Cross-cutting tenant lifecycle operations that don't belong to any one route file: `provisionTenant()` (creates a new tenant + first Admin user + default vendor + default redemption settings, all in one transaction), `deleteTenant()` (the exact reverse — explicit `DELETE FROM` for ~28 tables in dependency order, then the tenant row itself, all in one transaction), and `getTenantStats()` (dashboard counts via `Promise.all` for parallel independent queries).

Before insert, `provisionTenant` validates `plan_id` exists (throws `INVALID_PLAN`) and builds a non-empty ASCII slug (falls back to email local-part / timestamp when the company name is non-Latin). Cloud SA create also calls `ensureDefaultPlans()` in `pg-db.ts` so a wiped `plans` table cannot turn Create Cloud Tenant into a opaque `500` FK error (same class of bug as on-prem ensuring the `LOCAL` plan).

**Notably:** `deleteTenant`'s table list is a **manually maintained array** — if a new multi-tenant table is added to the schema and this list isn't updated, deleting a tenant leaves orphaned rows in that table forever (not a foreign-key cascade failure, just silent orphan data, since there's no `ON DELETE CASCADE` in play for most of these). This is a real, easy-to-forget maintenance burden — see [Common Mistakes](#common-mistakes) below.

### `secret-crypto.ts` (38 lines)

AES-256-GCM encryption for at-rest secrets (specifically GST NIC API credentials stored per-tenant). Key insight: the encryption key is **derived from `JWT_SECRET`** (via SHA-256 with a fixed salt string), not a separately managed secret — meaning rotating `JWT_SECRET` also invalidates every encrypted GST credential (they'd fail to decrypt with the new derived key). The `enc:v1:` prefix scheme lets old plaintext-stored legacy rows keep working (`decryptSecret` just returns them unchanged if they don't have the prefix) — a backward-compatible migration path rather than a forced backfill.

### `helpers.ts` (158 lines), `pagination.ts` (32 lines), `barcode.ts` (72 lines), `planLimits.ts` (52 lines)

- `helpers.ts` — grab-bag of small pure functions used across routes (ID generation, formatting, calculation helpers) — the honest "utils" catch-all every codebase eventually has.
- `pagination.ts` — standard `limit`/`offset` clamp-and-parse logic (e.g. clamps requested page size to a sane max) shared by every list endpoint that supports pagination.
- `barcode.ts` — barcode/SKU generation and validation logic for the inventory module.
- `planLimits.ts` — maps a tenant's `plan_id` to numeric limits (max users, max products, etc.) — a business/pricing concern implemented as a pure lookup table plus a comparison function, used to enforce plan tiers without embedding pricing logic in every route that creates a resource.

## Common mistakes

1. Adding a new multi-tenant table without adding it to `deleteTenant`'s table list in `tenant.ts` — orphaned rows survive tenant deletion.
2. Bypassing `logger.ts` and calling `console.log` directly for anything that might contain user data — skips PII redaction entirely.
3. Assuming `assertCriticalEnv`'s production checks apply to on-prem — several are deliberately skipped for `DEPLOYMENT_MODE === 'onprem'`; don't "fix" this without understanding why (on-prem is a fundamentally different trust/network model — see [Electron deployment](/deployment/electron)).
4. Rotating `JWT_SECRET` without accounting for `secret-crypto.ts`'s dependency on it — see [Failure Scenarios → JWT_SECRET rotation](/sre/failure-scenarios).

## Related pages

- [SRE → Logging](/sre/logging)
- [Testing → Unit Tests](/testing/unit)
- [Testing → Coverage Gates](/testing/coverage-gates)
- [SRE → Failure Scenarios](/sre/failure-scenarios)
