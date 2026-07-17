---
sidebar_label: Domain Terms
title: Glossary — Domain Terms
description: Every recurring Dhandho/DG-ERP term — business, technical, and the places where the two vocabularies collide — with the exact code symbol each one maps to.
---

# Glossary — Domain Terms

:::tip Why this page exists
Dhandho's domain language is a mix of retail/distribution business vocabulary (vendor, dealer, distribution, warranty) and generic SaaS/engineering vocabulary (tenant, RLS, JWT) — and occasionally the same underlying concept has *two* names depending on which side of the codebase you're reading. This page is the Rosetta Stone.
:::

## Business & product terms

| Term | Meaning | Where it shows up in code |
|---|---|---|
| **Tenant** | One customer organization using Dhandho — a shop, dealership, or distribution business. The unit of billing and data isolation. | `tenant_id` column on nearly every table; `tenants` table |
| **Vendor** (a.k.a. **Dealer**) | A sub-entity *within* a tenant that products are distributed to and sold through — e.g. a retail outlet or franchise point under one parent business. Product language sometimes says "dealer," code consistently says `vendor`. | `vendors` table, `vendorId`/`vendorScopeId()` |
| **Distribution** | The act of allocating inventory from the tenant's central stock to a specific vendor, creating a `product_distribution` row that tracks which vendor holds which units. | `product_distribution` table, `distribution.ts` routes |
| **Warranty** | A time-bound coverage record created automatically (when applicable) at the point of sale, tracked independently so claims/replacements can reference it later. | `warranties` table, `warranties.ts` routes |
| **Replacement** | A warranty claim resolved by swapping the sold unit for a new one — distinct from a refund; affects inventory counts on both sides of the swap. | `replacements` table |
| **Reward points** | A loyalty mechanic computed at sale time per configurable `reward_rules`, accumulated per customer. | `rewards`, `reward_rules` tables |
| **Plan** | A subscription tier (Trial, Basic, Standard, Professional) that gates feature access and usage limits (seats, invoice volume, storage) via `checkPlanLimit()`. | `plans` table, `server/utils/planLimits.ts` |
| **Business type** | The vertical a tenant operates in (retail electronics, distribution, etc.), used to pick default tab configuration and some workflow defaults at onboarding. | `tenants.business_type`, `tabConfig` |
| **Slug** | A tenant's unique, human-readable identifier used in login URLs (`/t/<slug>/login`) and to scope `localStorage` keys client-side, distinct from the numeric/UUID `tenant_id`. | `tenants.slug`, `scopedKey()` in `App.tsx` |
| **IRN / EWB** | Invoice Reference Number / E-Way Bill — government-issued identifiers for GST e-invoicing and goods-in-transit compliance, obtained from NIC's API. | `server/services/nic-api.ts`, `gst-api.ts` routes |
| **GSTR-2B / GSTR-3B** | Government-defined GST return formats Dhandho helps generate/reconcile — 2B is auto-drafted input tax credit data, 3B is the summary return a business files. | `reports.ts`, `gst-api.ts` |
| **Super Admin** | The platform operator role — outside and above all tenants, manages tenant provisioning, plans, and platform-wide settings. A separate authorization universe from tenant-level roles. | `super_admins` table, `superAdminMiddleware` |
| **On-prem license** | A per-installation license record for the Electron on-prem product, checked via periodic heartbeat rather than continuous connectivity. | `onprem_licenses` table, `onprem.ts` routes |

## Technical / architecture terms

| Term | Meaning | Where it shows up in code |
|---|---|---|
| **RLS** | Row-Level Security — Postgres feature that can restrict which rows a query sees, based on a policy. Enabled on ~30 tables here as a backstop, **not** the primary tenant-isolation mechanism (the app connects as the table owner, which bypasses RLS by default). | `initSchema()` in `pg-db.ts`, `ENABLE ROW LEVEL SECURITY` statements |
| **Pool owner** | The Postgres role the application's connection pool authenticates as — typically also the table-owning role, which is why RLS doesn't restrict the app's own queries. | `pg.Pool` config, `DATABASE_URL` |
| **`initSchema()`** | The idempotent, code-defined schema bootstrap that runs on every server boot — `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, index creation, and RLS policy application. Functions as this codebase's migration system. | `server/pg-db.ts` |
| **`assertCriticalEnv()`** | Fail-fast environment variable validation run before anything else on boot — refuses to start with a missing `JWT_SECRET`, a weak `DATABASE_URL` password (in production), etc. | `server/utils/env.ts` |
| **`authCache`** | A short-lived (30s TTL) in-memory cache of a user's role/permissions/status, used by the global auth middleware to avoid a full DB round-trip on every single request while still staying reasonably fresh. | `server/utils/authCache.ts` |
| **`fetchApi()`** | The single client-side function every network call in the frontend goes through — handles auth headers, in-memory caching, retries, offline queuing (mobile), and 401/403 redirects. | `src/api.ts` |
| **Correlation ID** | A per-request unique identifier generated in the first middleware, attached to logs and included in every 5xx error response, used to trace one request's full server-side journey. | `server/app.ts` (first middleware), `server/utils/logger.ts` |
| **`safeErrorMessage()`** | The function that strips internal error detail before it reaches a client response or a log line intended for less-trusted consumption, preventing stack traces/SQL text from leaking. | `server/utils/helpers.ts` (or equivalent) |
| **`logAudit()`** | Writes an immutable row to `audit_log` recording who did what to which resource — the paper trail used for compliance and incident investigation. | `server/utils/helpers.ts`, `audit_log` table |
| **PII redaction** | Regex-based scrubbing of email addresses, phone numbers, JWTs, and passwords from log lines before they're written, so structured logs remain safe to search/export. | `server/utils/pii.ts`, `redactPii()` |
| **Module permission** | The *global*, module-based access layer — one of `hidden`/`view`/`print`/`full` per business module (Sales, Inventory, Finance, etc.), independent of route-level role checks. | `server/middleware/permissions.ts` |
| **Route-level guard** | The *second*, independent authorization layer — `requireRole()`, `requireAdmin()`, `blockVendors()` — checked inside individual route handlers regardless of module permission outcome. | `server/middleware/auth.ts` |
| **`vendorScopeId()` / `assertVendorAccess()`** | Data-level (row-level) scoping functions that prevent one vendor from accessing another vendor's data within the same tenant — the IDOR defense beneath the module/route layers. | `server/middleware/auth.ts` |
| **`manualChunks`** | Vite build config that explicitly assigns specific large/situational dependencies (React, Motion, scanner libs, `xlsx`, icons) to their own downloadable chunks, independent of feature-based code splitting. | `vite.config.ts` |
| **Platform seam** | The `src/platforms/{shared,desktop,mobile}` boundary that lets the same feature code run across Web/Electron/Capacitor without each feature file needing its own platform-detection branches. | `src/platforms/` |
| **Offline queue** | Mobile-only durable storage of pending mutations made while offline, flushed once connectivity returns — not present on Web/Electron, which assume continuous connectivity. | `src/lib/offline/queue.ts` |

## Where business language and code language diverge

:::warning Watch for these mismatches
When a support ticket, a product spec, or a stakeholder conversation uses one of these terms, translate mentally before touching code.
:::

| Business says | Code says | Note |
|---|---|---|
| "Dealer" | `vendor` | Never renamed in code after an early product pivot; consistently `vendor` in schema and routes |
| "Customer" (end buyer) | `customers` table | Distinct from "customer" in a B2B SaaS sense — here it's the retail end-buyer of physical goods |
| "Store"/"Shop" | `tenant` | The whole tenant *is* the shop in the simplest case; larger tenants have multiple `vendors` under one tenant |
| "Return"/"Exchange" | `replacements` | No separate refund-tracking table; a replacement swaps the physical unit and adjusts inventory |
| "Points"/"Loyalty" | `rewards` | Computed, not manually entered, per `reward_rules` configuration |

## Hands-on exercise

1. Pick three terms from the business table above and, for each, find the exact SQL table or route file, then read one full route handler that touches it end-to-end.
2. Interview (or imagine interviewing) someone unfamiliar with the codebase using only business language — try translating three of their sentences into the corresponding code-level vocabulary from this page.
3. Find one place in the actual route/service code where a variable or comment uses "dealer" instead of "vendor" (or any other business/code mismatch) — is it a documentation risk worth flagging?

## Quiz

1. What's the difference between a "vendor" and a "tenant" in this system?
2. Why does `initSchema()` count as this project's migration system, even though it isn't a traditional migration framework?
3. Name the two independent authorization layers referenced in this glossary, and one data-level scoping mechanism beneath both of them.

<details>
<summary>Answers</summary>

1. A tenant is the top-level customer organization (the unit of billing and data isolation); a vendor is a sub-entity *within* a tenant — a specific outlet/dealer that inventory gets distributed to and sold through.
2. Because it's the mechanism that actually creates and evolves the database schema on every boot, using idempotent `IF NOT EXISTS`/`ADD COLUMN IF NOT EXISTS` statements instead of a chain of numbered migration files — it plays the same *role* even though it lacks rollback history or per-environment migration tracking.
3. Module permissions (`server/middleware/permissions.ts`, global per-module `hidden`/`view`/`print`/`full`) and route-level guards (`server/middleware/auth.ts`'s `requireRole`/`blockVendors`); beneath both, `vendorScopeId()`/`assertVendorAccess()` provide row-level (data-level) scoping to prevent IDOR between vendors.

</details>

## Related pages

- [System Overview](/architecture/system-overview)
- [Multi-tenancy](/architecture/multi-tenancy)
- [Permissions](/backend/permissions)
- [Authorization](/security/authorization)
- [Schema Overview](/database/schema-overview)
