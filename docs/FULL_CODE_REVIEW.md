# Dhandho / splender-inventry — full code review

**Scope:** `server/`, `src/`, `electron/`  
**Baseline:** `main` @ `a5791a5` (clean working tree)  
**Date:** 2026-07-15  
**Totals:** 40 findings — 11 critical · 17 high · 10 medium · 2 low

> **Highest leverage:** Stop returning password-reset tokens, fix backup restore SQL injection, reject platform JWTs on tenant APIs, and fix distribution pool double-release before shipping more features.

---

## Summary by area

| Area | Crit | High | Med |
|------|------|------|-----|
| Auth / sessions | 3 | 3 | 1 |
| Tenant isolation / RLS | 2 | 1 | 0 |
| RBAC / Vendor portal | 2 | 1 | 1 |
| SQL / Backup / Finance | 2 | 4 | 2 |
| Concurrency / Pool | 2 | 1 | 1 |
| Frontend (React) | 2 | 2 | 2 |
| Electron / On-prem | 1 | 4 | 1 |

---

## What’s solid

- JWT algorithm pinned to HS256; startup fatals for `DATABASE_URL` / `JWT_SECRET`
- bcrypt cost 12; parameterized SQL on normal CRUD
- Composite PKs `(id, tenant_id)`; tenant JWT overwrites `X-Tenant-ID`
- Helmet + login rate limits
- Distribution stock uses `FOR UPDATE SKIP LOCKED`
- Electron `contextIsolation` + no `nodeIntegration`
- `billTemplates` HTML escaping

Isolation today is almost entirely application `WHERE tenant_id` — treat RLS as aspirational until `withTenantClient` (or a non-owner DB role) is on every path.

---

## Critical

| ID | Area | Location | Finding |
|----|------|----------|---------|
| C1 | Auth | `server/routes/auth.ts:256-280` | **Forgot-password returns live reset token.** Public endpoint returns `resetToken`/`resetUrl` when email exists. Knowing an email = account takeover. Also breaks anti-enumeration. |
| C2 | SQL / Backup | `server/routes/audit.ts:140-146` | **Backup restore SQL injection via column names.** `Object.keys(row)` from JSON body interpolated into INSERT. Any authenticated user can restore; no Admin check. |
| C3 | Tenant isolation | `server/index.ts:145-151` + `pg-db.ts:820-828` | **FORCE RLS does not protect query path.** `setTenantContext` runs fire-and-forget on a different pool connection with transaction-local `set_config`. Handlers use `pool.query()` with no `app.tenant_id`. |
| C4 | Tenant isolation | `server/index.ts:134-154` | **Platform JWT can target any tenant via X-Tenant-ID.** Overwrite only when `decoded.tenantId` exists. Super-admin tokens lack `tenantId`, so a platform JWT can call tenant APIs with an arbitrary header. |
| C5 | Authz | `server/routes/*` (many) | **Incomplete RBAC — Vendor/Staff can mutate.** `permissions` JSON is UI-only. Missing `blockVendors`/`requireAdmin` on customers, banks, warranties, orders, quotations, rewards, backup restore, products/batch, add-stock. |
| C6 | Data integrity | `server/routes/vendors.ts:176-185` | **DELETE /vendors/all wipes tenant-wide data.** Staff can hit it. Deletes ALL `product_distribution` / quotations / orders / payments for the tenant — not scoped to deleted vendors. |
| C7 | Concurrency | `server/routes/sales.ts:79-128` | **Double-sell race on barcode.** SELECT status then UPDATE without `FOR UPDATE` / status guard on UPDATE. Concurrent POSTs on same barcode can both succeed. |
| C8 | Pool / Reliability | `server/routes/distribution.ts:254-269, 326` | **Pool double-release on early exits.** `client.release()` before return, then `finally` releases again — pool corruption under stock/overpay errors. |
| C9 | Frontend | `src/App.tsx:248-273` | **Hooks after early return — crash on /privacy\|/terms.** Privacy/Terms returns before later `useState`/`useEffect`. Navigating to/from those routes changes hook count → React crash. |
| C10 | Electron | `electron/onprem/main.ts:72-80` | **XSS via executeJavaScript + licenseStatus.** Cloud heartbeat strings interpolated into `executeJavaScript`. Compromised heartbeat can run code in renderer with `electronAPI`. |
| C11 | Frontend auth | `src/App.tsx:78-100` | **Super Admin UI gated on unsigned JWT decode.** `decodeJwtPayload` only base64-decodes. Fake localStorage token with `role: super_admin` renders full SuperAdminApp shell. |

---

## High

| ID | Area | Location | Finding |
|----|------|----------|---------|
| H1 | Authz | `server/routes/auth.ts` + finance/sales | **Vendor portal not scoped to vendorId.** Login returns `vendorId` but JWT omits it. List/finance/sales never filter by vendor — Vendor JWT sees all tenant vendor data. |
| H2 | Auth | `server/middleware/auth.ts:41-86` | **Password-change JWT invalidation is a no-op.** `authMiddleware` checks async after `next()` and does nothing. `authMiddlewareStrict` exists but is never mounted. |
| H3 | Auth | `server/routes/auth.ts:60-71, 262` | **Cross-tenant email collision on login/reset.** Email lookup is global `LIMIT 1` with no tenant/slug. Same email in two tenants → nondeterministic login and reset target. |
| H4 | Auth | `server/index.ts:141-144` vs `auth.ts:86-95` | **Subscription expiry logic disagrees with login.** Global gate uses `subscription_ends_at \|\| trial_ends_at`. Login checks by status. Active tenants with stale `trial_ends_at` get locked out after login. |
| H5 | Concurrency | `server/routes/rewards.ts:114-154` | **Reward redemption race / ledger drift.** Balance check then decrement without txn/`FOR UPDATE` → double-redeem. PUT/DELETE don’t adjust `vendors.total_reward_points`. |
| H6 | Finance | `server/routes/finance.ts:148-183` | **Multi-batch payment not transactional; wrong response id.** Loop of `pool.query` INSERTs without BEGIN. Response id is a new uid, not the inserted payment id(s). |
| H7 | Invoices | `invoices.ts` + `invoice-finance.ts` | **Invoice status vocabulary conflict + overpay.** Create uses `draft`; payments/schema use `unpaid`. Payments can overpay. Invoice numbers via `COUNT+1` race. |
| H8 | Purchases | `server/routes/purchases.ts:129-158` | **Purchases don’t create inventory / stock.** Records `product_purchases` only — no inventory rows or stock increment. Purchased goods aren’t sellable. |
| H9 | Warranties | `server/routes/warranties.ts:75-77, 157-189` | **Wrong barcode lookup; silent replacement failure.** Looks up `products.barcode` not `product_inventory.barcode`. PUT creates replacements with catch-only failure while returning success. |
| H10 | Frontend | `LoginScreen.tsx:80-85` + `App.tsx:236-242` | **Login drops permissions; unknown role → full UI.** Client stores user without permissions until profile refresh. `getAccess` fallthrough returns full for unknown roles. |
| H11 | XSS | InvoicesView / ProductVerificationView / AccountsView | **Print HTML XSS (unsanitized document.write).** Customer/vendor names and terms written raw. `billTemplates` has `esc()` — invoices/verification don’t use it. |
| H12 | Electron | `electron/onprem/main.ts:205-208` | **openExternal with no URL allowlist.** Any `window.open` from renderer (or XSS) opens arbitrary URLs including `file:` / custom schemes. |
| H13 | Electron | `electron/onprem/pg-manager.ts:17-44` | **Hardcoded local Postgres password.** `dg_user:dg_local_pass` on localhost:5433. Any local process can read tenant DB. |
| H14 | Electron | `electron/onprem/license-store.ts:13-36` | **Weak unauthenticated license encryption.** Key = SHA256(hostname\|platform\|username). AES-CBC without HMAC → predictable key + malleable ciphertext. |
| H15 | Electron | `electron/onprem/main.ts:155-178` | **complete-setup trusts renderer license payload.** Wizard can inflate `maxUsers` / alter company fields before provision. Main should re-validate with cloud. |
| H16 | Products | `server/routes/products.ts:306, 489` | **batch / add-stock missing blockVendors.** POST `/products` has `blockVendors`; batch and add-stock do not. Error paths also leak `Error.message`. |
| H17 | Tenancy | `server/utils/tenant.ts:88-102` | **deleteTenant incomplete vs FKs.** Missing `standalone_invoices` / `invoice_payments` (no ON DELETE CASCADE). Delete can fail mid-txn or leave orphans. |

---

## Medium

| ID | Area | Location | Finding |
|----|------|----------|---------|
| M1 | Auth | `server/routes/auth.ts:18-47` + `tenant.ts:52-56` | **Bootstrap signup dead / race.** `provisionTenant` always inserts Admin, so signup rejects. Token clear not atomic with insert → concurrent claim race. |
| M2 | Plans | `server/utils/planLimits.ts` | **Plan limits incomplete + fail-open.** `checkPlanLimit` only on product create. Vendors/users unconstrained. `catch` returns null (allow). |
| M3 | Distribution | `server/routes/distribution.ts:276-289` | **Bulk INSERT not chunked (~5.4k units).** 12 params/row hits 65535 limit. Products path already chunks at 5000. |
| M4 | Super-admin | `server/routes/super-admin.ts:826-830` | **Reset password missing tenant_id.** `UPDATE users WHERE id = $2` only. Composite PK `(id, tenant_id)` — same id across tenants all get new hash. |
| M5 | On-prem | `server/routes/onprem.ts` | **Weak keys, no rate limit, provision ignores key.** ~48-bit license keys; activate/heartbeat public; provision only checks localhost + `DEPLOYMENT_MODE`. |
| M6 | API client | `src/api.ts:134-202, 296-306` | **15s GET cache + experimental QUERY method.** Stale UI after mutations. Analytics uses method `QUERY` — fails silently on older browsers/proxies. |
| M7 | Payroll | `server/routes/payroll.ts:15-206` | **Payments keyed by staff name string.** Rename orphans history; delete removes by name. GET `/staff` has 4 correlated subqueries per row. |
| M8 | Security headers | `server/index.ts:59, 74-78` | **CSP unsafe-inline; CORS reflects Origin off-prod.** Weak XSS containment. Non-production CORS allows any Origin with credentials if `NODE_ENV` mis-set. |
| M9 | DB TLS | `server/pg-db.ts:44-46` | **rejectUnauthorized: false for managed DB.** Disables cert verification for Render/Neon/`DATABASE_SSL` — MITM if network hostile. |
| M10 | Frontend | `src/lib/session.ts` + views | **Tokens in localStorage; racey list loads.** XSS steals session. Feature views lack AbortController — stale responses overwrite newer state. |

---

## Low

| ID | Area | Location | Finding |
|----|------|----------|---------|
| L1 | UX / Docs | LoginScreen / PrivacyPolicy / Settings | **Remember-me no-op; privacy copy wrong; password min mismatch.** Remember me never written. Privacy claims localStorage clears on tab close. Settings allows 6-char vs 8-char reset. |
| L2 | Architecture | `App.tsx` payroll lazy import | **PayrollView loaded but never routed.** Dead nav path; easy to assume payroll is in main tabs and ship incomplete RBAC. |

---

## Recommended fix order

### P0 — Ship blockers

1. Forgot-password: no token in response
2. Backup restore: column allowlist + `requireAdmin`
3. Reject platform JWT on tenant APIs
4. Distribution double-release
5. `App.tsx` hooks before early returns
6. Electron `executeJavaScript` → ipc send

### P1 — Next sprint

7. Consistent `blockVendors` / `requireAdmin` on all mutations
8. `vendorId` in JWT + server filters
9. Sales `FOR UPDATE`; reward redeem txn
10. Wire `authMiddlewareStrict` or token version
11. Print HTML escape everywhere
12. Align expiry checks; login by tenant slug

---

## Related files

- Interactive canvas (Cursor): `docs/full-code-review.canvas.tsx`
- Also available in Cursor canvases: open beside chat from the IDE canvases folder
