---
title: OWASP Top 10 Mapping
description: Where each OWASP Top 10 (2021) risk category is addressed in the Dhandho codebase, with concrete controls and known gaps.
---

# OWASP Top 10 Mapping

This document walks the [OWASP Top 10 (2021)](https://owasp.org/Top10/) categories and maps each to concrete controls already covered in depth elsewhere in these docs. Think of this as an index with a specific lens, not a duplicate — every "✅" links to the document that actually explains the *why*.

## A01:2021 — Broken Access Control

| Control | Detail |
|---|---|
| ✅ Global module-permission gate | `enforceModulePermissions` on every `/api/*` request — see [Authorization](./authorization.md) |
| ✅ Vendor-portal IDOR guards | `vendorScopeId`, `assertVendorLinked`, `assertVendorAccess` — see [Authorization](./authorization.md) |
| ✅ Tenant isolation | `WHERE tenant_id = $N` convention + RLS safety net — see [Tenant Isolation](./tenant-isolation.md) |
| ⚠️ Known gap | Unmapped API path prefixes bypass module-permission gating entirely (fail-open, not fail-closed) — see [Authorization](./authorization.md)'s discussion of `moduleForPath` |

## A02:2021 — Cryptographic Failures

| Control | Detail |
|---|---|
| ✅ Password hashing | bcrypt, cost factor 12 — see [Authentication](./authentication.md) |
| ✅ At-rest encryption for GST credentials | AES-256-GCM, random IV per encryption, authenticated tag — see [Secrets](./secrets.md) |
| ✅ TLS enforced in production | `NODE_ENV=production` always enables TLS for the database connection; HSTS with `preload: true` forces HTTPS at the browser level — see [Headers & CSP](./headers-and-csp.md) |
| ⚠️ Accepted risk | `JWT_SECRET` doubles as the GST-secret encryption key source — a single-secret compromise affects both — see [Secrets](./secrets.md) and [Accepted Risks](./accepted-risks.md) |

## A03:2021 — Injection

| Control | Detail |
|---|---|
| ✅ Parameterized SQL everywhere | The `pg` library's `$1, $2, ...` placeholders are used for all user-supplied values across `server/routes/*.ts` — no string-interpolated user input into SQL |
| ✅ Dynamic identifiers restricted to hardcoded arrays | The only places table/column names are interpolated (e.g., the `rlsTables` loop in `pg-db.ts`, admin backup/restore code) draw exclusively from **hardcoded, compile-time-known lists** — never from request bodies or query strings |
| ✅ No `eval`/`Function()` on user input | No dynamic code execution paths exist for request-derived strings |
| ⚠️ Discipline-dependent | This protection holds only as long as every future contributor keeps following the parameterized-query convention — there's no static-analysis gate enforcing it beyond code review |

## A04:2021 — Insecure Design

| Control | Detail |
|---|---|
| ✅ Threat modeling performed | See [Threat Model](./threat-model.md) — STRIDE analysis grounded in actual architecture |
| ✅ Fail-closed startup | `assertCriticalEnv` refuses to boot without `JWT_SECRET`/`DATABASE_URL`/etc.; production refuses to boot without `ALLOWED_ORIGINS` — see [Secrets](./secrets.md) |
| ✅ Time-boxed, audited impersonation | 15-minute super-admin impersonation tokens, fully logged — see [Authentication](./authentication.md) |
| ✅ Anti-enumeration login/reset responses | Identical error messages for "wrong email" vs "wrong password"; forgot-password always responds `{ ok: true }` — see [Authentication](./authentication.md) |
| ✅ Signup disabled by design | `410 Gone` on `/api/auth/signup` — all provisioning is admin-mediated — see [Authentication](./authentication.md) |

## A05:2021 — Security Misconfiguration

| Control | Detail |
|---|---|
| ✅ Explicit CORS allowlist | Never reflects `*` or an unrecognized `Origin` — see [Headers & CSP](./headers-and-csp.md) |
| ✅ Comprehensive `helmet` config | CSP, HSTS, `frameguard`, `noSniff`, `referrerPolicy` all explicitly set (not left at framework defaults) — see [Headers & CSP](./headers-and-csp.md) |
| ✅ Stack traces stripped in production | 500 responses rewritten to `{ error: 'Internal server error', correlationId }`; full detail only in server-side logs when `!isProduction` |
| ✅ Verbose request logging gated to dev-only | The colorful per-request console logger in `app.ts` only runs when `!isTest && !isProduction` |
| ⚠️ Known drift | `.env.example` documents `JWT_EXPIRES_IN` as configurable but no code reads it — a config surface that doesn't actually exist — see [Secrets](./secrets.md) |

## A06:2021 — Vulnerable and Outdated Components

| Control | Detail |
|---|---|
| ⚠️ Known accepted risk | `xlsx@0.18.5` has publicly known CVEs (prototype pollution, ReDoS) with no patched version currently published by the maintainer for the free/npm distribution — see [Accepted Risks](./accepted-risks.md) for the specific mitigating usage pattern |
| ✅ Scoped blast radius | `xlsx` is used only for **reading** user-uploaded import files and **generating** export downloads — not for parsing untrusted data from an unauthenticated network path, and only reachable by already-authenticated, already-permissioned users |

## A07:2021 — Identification and Authentication Failures

| Control | Detail |
|---|---|
| ✅ Rate limiting on auth endpoints | 5 login attempts/min/IP, 3 forgot-password requests/hour, 5 reset attempts/hour — see [Threat Model](./threat-model.md) DoS section |
| ✅ Generic error messages | Same message for wrong email vs wrong password — see [Authentication](./authentication.md) |
| ✅ Session invalidation on password change | `password_changed_at` vs. JWT `iat` comparison invalidates all existing tokens instantly — see [Authentication](./authentication.md) |
| ✅ Short-lived sensitive tokens | 5-minute password reset tokens, 15-minute impersonation tokens |
| ⚠️ Accepted risk | 24-hour JWT expiry with no refresh-token rotation or server-side revocation list (beyond the password-change check) — a stolen, unexpired token remains valid for up to 24h — see [Accepted Risks](./accepted-risks.md) |

## A08:2021 — Software and Data Integrity Failures

| Control | Detail |
|---|---|
| ✅ Authenticated encryption for stored secrets | AES-256-**GCM**'s auth tag detects tampering with encrypted GST credentials — see [Secrets](./secrets.md) |
| ✅ JWT signature verification | HS256 signature checked on every request; algorithm pinned (`algorithms: ['HS256']`) to prevent algorithm-confusion attacks | 
| ✅ CI bundle-size gate | While primarily a performance control, a CI gate that fails on unexpected bundle-size growth (see [../performance/bundle.md](../performance/bundle.md)) also acts as a coarse tripwire against unexpectedly large/unexpected dependency changes slipping through |

## A09:2021 — Security Logging and Monitoring Failures

| Control | Detail |
|---|---|
| ✅ Audit log for sensitive actions | `audit_log` table records logins, password changes, impersonation, admin resets, deletions — see [Threat Model](./threat-model.md) Repudiation section |
| ✅ PII redaction before logs are written | `redactPii`/`redactContext` strip emails, phones, JWTs, `Bearer` tokens, password-like fields — see `server/utils/pii.ts` |
| ✅ Correlation IDs | Every request gets a correlation ID surfaced in error responses (`correlationId`), letting an operator trace a specific user-reported error back to server logs without needing the full (potentially PII-containing) request logged client-side |
| ⚠️ Known gap | Actions taken *during* an impersonated session aren't separately tagged with `impersonatedBy` per-action, only at the grant — see [Authentication](./authentication.md) |

## A10:2021 — Server-Side Request Forgery (SSRF)

| Control | Detail |
|---|---|
| ✅ No user-controlled outbound URL fetches | The application's outbound HTTP calls (GST NIC APIs) hit fixed, hardcoded government endpoints — not URLs supplied by request bodies or query parameters |
| ✅ `connect-src` CSP directive | Even client-side, `fetch`/`XHR` targets are restricted to an explicit allowlist (`'self'`, `wa.me`, `mail.google.com`) — see [Headers & CSP](./headers-and-csp.md) |

## Quiz

1. Which OWASP category does the `xlsx@0.18.5` dependency risk fall under, and what specific factor limits its real-world severity in this codebase despite the CVE existing?
2. Name one control that appears under *both* A01 (Broken Access Control) and A04 (Insecure Design) in this mapping, and explain why it's relevant to both categories.
3. Why does pinning `algorithms: ['HS256']` in `jwt.verify()` matter for A08 (Software and Data Integrity Failures), specifically?

<details>
<summary>Answers</summary>

1. A06 (Vulnerable and Outdated Components). The severity is limited because `xlsx` in this codebase only processes files from already-authenticated, already-permissioned users (import uploads) or generates exports from server-controlled data — it's never exposed to unauthenticated network input, which is the more dangerous exposure pattern for a parsing-library CVE.
2. Tenant isolation (`WHERE tenant_id = $N` + RLS) appears under both: it's an access-control mechanism (A01, restricting *who* can read *what* row) but is also a foundational design decision made early and deliberately (A04, "insecure design" is about architecture-level choices, and choosing application-layer scoping plus a DB-layer safety net is exactly that kind of upfront design decision, including the documented trade-off of not forcing RLS).
3. Some JWT libraries historically had vulnerabilities where an attacker could submit a token with `alg: none` or switch from an asymmetric algorithm (RS256) to a symmetric one (HS256) using the public key as the HMAC secret, tricking the verifier into accepting a forged token. Explicitly restricting `jwt.verify()` to only accept `HS256` prevents any algorithm-confusion attack from being effective — a forged token using a different `alg` header is rejected outright before signature verification is even attempted with the wrong logic.

</details>

## Related reading

- [Threat Model](./threat-model.md), [Authentication](./authentication.md), [Authorization](./authorization.md), [Tenant Isolation](./tenant-isolation.md), [Secrets](./secrets.md), [Headers & CSP](./headers-and-csp.md), [Accepted Risks](./accepted-risks.md)
