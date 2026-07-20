# Emergent Five-Check Security Scan — DG-ERP (Dhandho)

**Date:** 2026-07-19  
**Branch:** `security/emergent-five-checks` (baseline: `main`)  
**Scope:** Full repository inspection of server, SPA, Capacitor/Electron clients, CI, env handling  
**Method:** Code inspection (grep + targeted reads); unit tests for env/PII/impersonation/money validation  
**App context:** Custom JWT auth, multi-tenant PostgreSQL ERP, GST billing, vendor portals, Super Admin impersonation, Capacitor/Electron, Render deploy; subscription/plan billing (no Stripe)

---

## Executive summary

The codebase already has strong prior hardening (helmet/CSP/HSTS, CORS allowlist, `assertCriticalEnv`, global + auth rate limits, bcrypt-12, parameterized SQL, PII redaction, live JWT role hydration, impersonation 15m TTL, server-side invoice totals). This pass found **no Critical** issues and **one High** class of money-amount validation bugs (fixed). Remaining High items are known accepted risks (JWT in `localStorage`, `xlsx` CVE with no upstream patch).

**Production readiness for launch:** **Go with checklist** — ~90/100 security posture if Render env vars (`JWT_SECRET`, `ALLOWED_ORIGINS`, `SUPER_ADMIN_*`, DB TLS) are set and secrets rotated if ever leaked.

---

## Compact table — Critical / High

| Severity | Location | Finding | Status |
|----------|----------|---------|--------|
| Critical | — | None found | — |
| High | `server/routes/invoice-finance.ts:208`, `expenses.ts:83`, `payroll.ts:348` | Non-numeric payment/expense amounts bypassed `Number(x) <= 0` (NaN never `<= 0`) | **Fixed** (`Number.isFinite` + max cap) |
| High | `src/lib/session.ts:29-30` | JWT stored in `localStorage` (XSS → session theft) | Documented — redesign to httpOnly cookies |
| High | `package.json` (`xlsx@0.18.5`) | Prototype pollution / ReDoS; no patched release | Documented — keep dynamic-import isolation; track SheetJS |

---

## 01 — Secret leak prevention

### Findings

| Sev | Location | Vulnerability | Exploit sketch | Fix / recommendation |
|-----|----------|---------------|----------------|----------------------|
| Low | Local `.env` (gitignored) | Dev DB password `1234`, test JWT/admin password on disk | Only if machine compromised | Keep gitignored; never copy to Render; rotate if shared |
| Info | `.gitignore:28-32` | `.env` / `.env.*` ignored; examples allowed | — | OK |
| Info | `.env.example` | Placeholders only | — | OK |
| Info | `VITE_*` | Only `VITE_API_ORIGIN`, `VITE_DEPLOYMENT_MODE`, `VITE_APP_VERSION` | — | No secrets in client env |
| Info | `server/utils/logger.ts`, `pii.ts` | Redacts password/token/email/phone/JWT in logs | — | OK |
| Info | Git history | No committed `.env`; no `LocalTestAdmin` in history | — | Low history risk |
| Medium | `.github/workflows/security.yml` (was) | `.env` check used `[ -f .env ]` (disk exists ≠ tracked) | False fail/pass messaging | **Fixed** → `git ls-files --error-unmatch .env` |

### Verdict
No hardcoded production API keys/JWT secrets/DB URLs in source. GST secrets encrypted at rest via `secret-crypto` (AES-GCM keyed from `JWT_SECRET`).

---

## 02 — Personal data flow audit

### Collection map

| Data | Collected where | Stored |
|------|-----------------|--------|
| Email / password | Login, signup (disabled), admin user create, SA login | `users.password_hash` (bcrypt 12); plaintext never stored |
| Name / phone / address | Customers, vendors, users, invoices | Postgres tenant-scoped rows |
| GSTIN | Tenants, bill settings, invoice parties | Postgres; NIC API password/secret encrypted |
| JWT | Auth responses | Client `localStorage` (`session.ts`) |

### Findings

| Sev | Location | Vulnerability | Exploit sketch | Fix / recommendation |
|-----|----------|---------------|----------------|----------------------|
| High | `src/lib/session.ts` | JWT + user profile in `localStorage` | XSS steals Bearer token | Prefer httpOnly Secure cookie + CSRF |
| Low | `sessionStorage` (`sm_slug`, `sm_email`) | Offline onboarding stores email locally | Device access | Acceptable for device-local app |
| Info | `DELETE /api/auth/me` | Account anonymization (email → `deleted-…@invalid.local`, random password) | — | Present |
| Info | Logs | `redactPii` / `redactContext` / auth events strip emails | — | OK |
| Info | SA export | GST API secrets redacted | — | OK |

### Password hashing
`bcrypt` cost **12** everywhere checked (`helpers.hashPassword`, auth, admin, SA, service-cloud, on-prem provision).

---

## 03 — Pre-deploy production audit

| Check | Status | Evidence |
|-------|--------|----------|
| Critical env fail-fast | Pass | `assertCriticalEnv` in `server/index.ts` / `server/utils/env.ts` — JWT length, `ALLOWED_ORIGINS`, weak DB password, `DATABASE_SSL=false` banned, SA password ≥12 |
| Debug / test credentials in prod paths | Pass | Signup returns 410; no debug routers; test secrets only in tests / local `.env` |
| Stack traces to clients | Pass | `createApp` sanitizes ≥500 JSON; error middleware returns generic message + correlationId |
| Helmet / CSP / HSTS | Pass | `server/app.ts` helmet config |
| CORS | Hardened this pass | Allowlist + Capacitor origins; **arbitrary loopback ports no longer allowed in production** |
| Rate limits | Pass | Global 300/min; login 5/min; forgot-password 3/hour; chatbot 30/min; on-prem/SM limiters |
| DB TLS in production | Pass | `pg-db.ts` forces SSL for cloud production; managed Render/Neon may use `rejectUnauthorized=false` |

### Findings

| Sev | Location | Vulnerability | Exploit sketch | Fix / recommendation |
|-----|----------|---------------|----------------|----------------------|
| Medium | `server/app.ts` (was) | Production CORS allowed any `http(s)://localhost:*` | Local malicious page + stolen token easier to use from browser | **Fixed** — loopback only when `!isProduction` |
| Low | `GET /api/health` | Confirms DB up/down | Recon | Acceptable for LB; no secrets |
| Info | No swagger / `.git` static | — | — | Static serves `dist` only |

---

## 04 — Deep security (auth, IDOR, payments, SQLi, XSS)

### Auth & impersonation

| Item | Status |
|------|--------|
| Global JWT gate on `/api/*` | Pass (`PUBLIC_PATHS` allowlist) |
| Live role / password_changed_at / subscription | Pass (`app.ts` auth middleware + cache) |
| Impersonation | 15m JWT + `impersonatedBy` + audit (`super-admin.ts`) |
| Password reset | 32-byte hex, 5 min TTL; forgot-password does **not** return token (anti-enumeration); SA/admin retrieve |
| Algorithm | HS256 only (`algorithms: ['HS256']`) |

### IDOR / tenant isolation

Tenant-scoped queries consistently use `tenant_id` from JWT (`x-tenant-id` overwritten from token). Vendor helpers (`assertVendorAccess`, `blockVendors`) present. RLS enabled but not FORCED (pool owner bypass) — app-layer filters remain primary (**Low** accepted risk).

### Money / totals

Standalone invoices recompute line tax/totals server-side (`invoices.ts`). Invoice payments check remaining balance under `FOR UPDATE`. Vendor/supplier payments validate amounts with `isNaN` + caps.

| Sev | Location | Vulnerability | Exploit sketch | Fix / recommendation |
|-----|----------|---------------|----------------|----------------------|
| High | invoice-finance / expenses / payroll | NaN amount accepted | `POST` amount `"abc"` → insert NaN/invalid money row | **Fixed** |
| Medium | Invoice line `rate` when `productId` set | Client may override catalog price | Authenticated staff undercharges | Normal ERP; optional harden: admin-only overrides |

### SQLi / XSS

| Item | Status |
|------|--------|
| Parameterized queries | Dominant pattern; dynamic `UPDATE SET` / table names from allowlists |
| `dangerouslySetInnerHTML` | Absent in `src/` (CI fails if introduced) |
| Bill HTML | `esc()` in `billTemplates.ts` |

---

## 05 — Attacker’s perspective

| Attack | Result |
|--------|--------|
| ID manipulation across tenants | Blocked by JWT tenant + `WHERE tenant_id` |
| Login bypass / alg:none JWT | Rejected (HS256 verify) |
| Privilege escalation via JWT role claim | Role overwritten from DB |
| Staff → Admin | Admin-gated user APIs; cannot self-edit perms |
| Signup abuse | Endpoint disabled (410) |
| Brute force login / reset | Rate limited |
| Negative / over payments | Rejected on finance paths; remaining balance checks |
| Plan / subscription bypass | Expired trial/subscription → 403 on API |
| Content injection (bills/chat) | HTML escaped; chatbot rate-limited |
| Internal exposure | No swagger; health minimal; `.git` not served |
| Feature abuse (public activate) | License+machineId binding + rate limit |
| Support SA RBAC | Login always mints `role: 'super_admin'` — DB `support`/`owner` not enforced (**Medium**) |

---

## Fixes applied this branch

1. **`Number.isFinite` + max amount** on invoice payments, expenses, payroll  
2. **Production CORS** — stop reflecting arbitrary loopback origins  
3. **CI secret job** — detect tracked `.env` via `git ls-files`  
4. **Unit regression** — `tests/unit/money-amount-validation.test.ts`

### Tests run

```text
vitest run tests/unit/money-amount-validation.test.ts tests/unit/env.test.ts \
  tests/unit/pii.test.ts tests/unit/impersonation-token.test.ts
→ 4 files / 12 tests passed
```

(Full API suite needs local Postgres; not all HTTP security tests executed in this environment.)

---

## Remaining (not fixed — document / backlog)

| Sev | Item | Recommendation |
|-----|------|----------------|
| High | JWT in `localStorage` | Auth redesign: httpOnly cookies + CSRF |
| High | `xlsx` CVE | Replace with ExcelJS / server-side parse when feasible |
| Medium | SA role flattening | Mint JWT with real DB role; restrict delete/impersonate to `owner` |
| Medium | Auth cache ≤30s after demotion | Shorter TTL or bust cache on role change |
| Medium | Unpaginated heavy reports | Keep pagination caps; watch memory DoS |
| Low | RLS not FORCE | Optional `FORCE ROW LEVEL SECURITY` for defense in depth |
| Low | `/api/admin/role-presets` any authenticated user | Gate with `isAdmin` |

---

## Launch checklist

- [ ] Render: strong unique `JWT_SECRET` (≥32), `ALLOWED_ORIGINS`, `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (≥12)  
- [ ] Confirm `DATABASE_URL` is managed Postgres with TLS (Render sets this)  
- [ ] No production secrets in git; rotate if any historical leak suspected  
- [ ] Accept or schedule: cookie auth + `xlsx` replacement  
- [ ] Smoke: login rate limit, forgot-password enumeration, tenant isolation, SA impersonate 15m expiry  

**Verdict:** Safe to launch with ops checklist completed; address localStorage JWT and `xlsx` as post-launch High priority.
