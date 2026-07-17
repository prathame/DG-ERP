---
sidebar_label: Utils Catalog
title: Server Utils Catalog
description: Every module under server/utils — purpose, exports, security/perf impact, what breaks if removed.
---

# Server Utils Catalog

**Path:** `server/utils/*` — cross-cutting helpers imported by routes and middleware.

## Inventory

| File | Key exports | Why it exists |
|---|---|---|
| `env.ts` | `assertCriticalEnv` | Fail-fast boot; no half-configured prod |
| `helpers.ts` | `uid`, validators, GST SQL fragments, `logAudit`, `mapProduct`, pagination helpers | Shared tax math + audit |
| `logger.ts` | `logger` | Console + optional Logtail; PII-safe |
| `pii.ts` | `redactPii`, `redactContext`, `safeErrorMessage` | Stop secrets/PII in logs |
| `pagination.ts` | `parsePagination`, `assertBulkSize` | Cap list/bulk abuse |
| `barcode.ts` | existence/range/generation helpers | Inventory identity |
| `authCache.ts` | `getCachedAuth`, `setCachedAuth` | 30s cache for global auth hydrate |
| `planLimits.ts` | `checkPlanLimit` | Fail-closed subscription caps |
| `secret-crypto.ts` | AES-256-GCM encrypt/decrypt | GST API secrets at rest |
| `tenant.ts` | `provisionTenant`, `deleteTenant`, `getTenantStats` | Platform provisioning transactions |

## Deep dives (critical ones)

### `assertCriticalEnv` (`env.ts`)

| Check | Prod rule |
|---|---|
| `DATABASE_URL` | required |
| `JWT_SECRET` | ≥32 chars in prod |
| `ALLOWED_ORIGINS` | required (non-onprem prod) |
| Weak DB passwords | rejected by regex |
| `DATABASE_SSL=false` | forbidden in prod |
| `SUPER_ADMIN_*` | required; password ≥12 |

**What breaks if removed:** Misconfigured Render box serves traffic with `JWT_SECRET=changeme`.

### GST SQL fragments (`helpers.ts`)

Centralized so distribution bills, accounts, and reports cannot drift:

- `DISTRIBUTION_BILL_UNIT_SQL`  
- `DISTRIBUTION_TAXABLE_SQL` / `DISTRIBUTION_TAX_SQL`  
- `PURCHASE_TAXABLE_SQL` / `PURCHASE_TAX_SQL`  
- `splitGst` (CGST/SGST vs IGST by state)

**Analogy:** One recipe card in the kitchen — if every cook invents GST math, the tax office gets three different answers.

### `authCache` (30 seconds)

Keys on `(userId, tenantId, iat)`. Avoids a DB round-trip on every API call after the first.

| Pro | Con |
|---|---|
| Lower latency / DB load | Multi-instance caches diverge for ≤30s |
| Simple in-memory Map | Process restart clears it (fine) |

Demotions still win within 30s worst case — far better than 24h JWT-only.

### `secret-crypto`

AES-256-GCM for `bill_settings` GST password/client secret. Key material from env — never ship ciphertext decryption to the browser.

### `checkPlanLimit`

**Fail-closed:** if the limit query errors, deny the create. Prefer angry customer over silent plan bypass.

### `provisionTenant` (`tenant.ts`)

Single transaction: tenant row → admin user → OWNER vendor → redemption settings (+ mobile invite from SA flow). Rollback on any failure.

## Performance impact

| Util | Cost |
|---|---|
| authCache hit | O(1) memory |
| `redactPii` | O(message length) — cheap vs network |
| barcode range gen | O(n) inserts — keep batches bounded |
| pagination parse | O(1) |

## Security impact

- Logging without `pii.ts` → GDPR/DPDP incident waiting to happen  
- Skipping `secret-crypto` → GST credentials in plaintext DB dumps  
- Disabling plan limits “temporarily” → revenue leakage  

## Common mistakes

1. Duplicating GST CASE expressions in a new report instead of importing fragments  
2. Logging `req.body` wholesale on login  
3. Using `helpers` pagination and `pagination.ts` inconsistently (prefer the stricter newer helper for new code)  
4. Caching auth without including `iat` → password-change edge cases  

## Interview question

*Why is authCache keyed by `iat` as well as user/tenant?*

:::info Answer sketch
So a password change (new login → new `iat`) does not reuse a cache row that still says the old session is valid under stale password_changed checks.
:::

## Related

- [pg-db](/backend/pg-db)  
- [Auth Middleware](/backend/auth-middleware)  
- [Patterns](/backend/patterns)  
- [Logging](/sre/logging)  
