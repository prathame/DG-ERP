---
title: Accepted Risks
description: Formally acknowledged trade-offs — JWT in localStorage, the xlsx CVE, and RLS not forced on the pool owner — with the reasoning behind accepting each.
---

# Accepted Risks

Every real system has residual risk after mitigations are applied — the question is never "is this system perfectly secure" but "which risks were consciously accepted, why, and what would change the calculus." This document is the honest ledger. Each entry follows the same shape: **what the risk is, why it exists, what would eliminate it, and why that trade-off wasn't taken.**

> [!NOTE]
> **Why write this document down at all?** An *unacknowledged* risk is one nobody is watching — it might silently get worse (a dependency ages further, a workaround gets copy-pasted into a new context that doesn't hold the same assumptions) without anyone re-evaluating it. Writing it down here means every future engineer touching these areas inherits the context instead of re-discovering (or worse, never discovering) the trade-off.

## 1. JWT stored in `localStorage`, not an httpOnly cookie

**The risk:** Any successful XSS on the frontend can read `localStorage` and steal the JWT directly via `document.localStorage` or Electron storage APIs — an httpOnly cookie would be invisible to JavaScript entirely, closing off this specific theft vector.

**Why it exists:**

- Dhandho runs across **two client shells** — a plain browser and Electron (cloud + on-prem). Cookie-based auth (with `httpOnly`, `SameSite`, `Secure` attributes) works cleanly in a browser talking to a single origin, but gets substantially more complicated across Electron's custom/`file://`-adjacent origins talking to a remote API host — cross-origin cookie handling in embedded WebViews has historically been inconsistent across platforms and OS versions.
- A Bearer-token-in-header model is **origin-agnostic** by construction: the same `api.ts` code that attaches `Authorization: Bearer <token>` works identically whether the JS is running in a browser tab or an Electron renderer process — no per-platform cookie-jar handling needed.
- Bearer tokens also sidestep CSRF entirely (see [threat-model.md](./threat-model.md)'s Spoofing section) — a real, and arguably larger, class of attack that cookie-based auth has to defend against with separate CSRF-token machinery.

**Mitigations already in place that reduce this risk's severity:**

- Strict `script-src: 'self'` CSP in production — no inline scripts execute at all, closing off the most common XSS injection vector ([Headers & CSP](./headers-and-csp.md)).
- No `dangerouslySetInnerHTML` usage anywhere in the codebase (enforced by convention/review).
- 24-hour token expiry bounds the exposure window of any single stolen token.
- Password-change invalidation (comparing `password_changed_at` to token `iat`) gives users a way to kill a stolen token immediately upon suspecting compromise, without waiting for natural expiry.

**What would eliminate it:** Moving to httpOnly, `SameSite=Strict` cookies for the web target specifically, with a separate token-passing mechanism retained for Electron — a genuinely more complex, dual-mode auth architecture. **Not currently planned**, given the CSP mitigations already in place and the added complexity of maintaining two auth transport mechanisms across browser and Electron.

## 2. `xlsx@0.18.5` — known CVEs, no upstream fix on the free channel

**The risk:** The `xlsx` (SheetJS) npm package pinned in `package.json` has publicly disclosed vulnerabilities (prototype pollution in older versions, and a regular-expression denial-of-service issue) that the free/community distribution channel has not patched with a newer npm-published version — SheetJS's fixes for some of these live only in their paid/Pro distribution or a non-npm CDN-hosted "next" build.

**Why it exists:** `xlsx` is a mature, widely-used library for reading/writing spreadsheet formats, and rewriting Excel import/export from scratch is a substantial, low-value engineering investment for a business-logic team — spreadsheet import (bulk product catalogs, bulk customer lists) and export (GST reports, sales summaries) are genuinely valuable features that customers depend on.

**What limits the real-world severity here:**

- `xlsx` is invoked in exactly two shapes in this codebase: (a) **exporting** server-generated data to a file for download (no attacker-controlled input reaches the vulnerable parsing code at all in this path), and (b) **importing** a file that an already-authenticated, already-permissioned tenant user explicitly uploads through the UI. The attack surface for a parsing-library CVE is "can an attacker get a malicious file parsed by this library" — and here, that requires an attacker to already have valid, sufficiently-privileged credentials for a specific tenant and to convince (or be) that tenant's user into uploading a crafted file. This is a **much narrower** exposure than, say, accepting arbitrary uploaded spreadsheets from unauthenticated internet traffic.
- `CsvImport.tsx` — the more commonly used bulk-import path in the UI — is a **hand-rolled, minimal CSV parser** (see [../frontend/ui-kit.md](../frontend/ui-kit.md)) specifically **not** using `xlsx`, further reducing how often the vulnerable code path is actually exercised in practice.

**What would eliminate it:** Migrating fully off `xlsx` to an alternative library, or restricting its use exclusively to the export direction (never accepting user-uploaded `.xlsx` files at all, funneling all imports through the CSV path). **Tracked as a backlog item**, not yet executed — the cost of a migration is weighed against the narrow, authenticated-only exposure window described above.

## 3. Row-Level Security enabled but not forced on the pool-owner role

**The risk:** Because the application's database connection uses the table-owner role, and `FORCE ROW LEVEL SECURITY` was deliberately *not* applied, Postgres RLS provides **no protection whatsoever** against the application's own code forgetting a `WHERE tenant_id = $N` clause — the single most likely real-world tenant-isolation failure mode in day-to-day development.

**Why it exists:** This is explained in full mechanical detail in [Tenant Isolation](./tenant-isolation.md) — the short version is that most route handlers use ad-hoc `pool.query()` calls on connections pulled from a shared pool, without wrapping every request in a transaction that sets `app.tenant_id` first. Forcing RLS under that connection pattern would silently turn "forgot the `WHERE` clause" bugs into "returns zero rows" bugs instead of catching them — a worse failure mode (silent data loss, indistinguishable from "this tenant has no data") than the one it would nominally prevent.

**What this risk actually buys as a mitigation, honestly:** RLS-as-implemented protects against a narrower but still real set of scenarios: direct database access by a non-owner role (an analytics/reporting connection, a future support tool), or a SQL-injection payload executing under a non-owner credential. It does **not** protect against the application's own primary query path.

**What would eliminate it:** Restructuring the connection-handling layer so every request is wrapped in a transaction with `setTenantContext` called immediately upon connection checkout — before any handler code runs — then safely enabling `FORCE RLS`. This is a real architectural change (not a config flag flip) with correctness risk of its own (a bug in that wrapper would now silently zero out queries application-wide instead of erroring loudly). **Not currently planned** — the team judged the comprehensive application-layer `WHERE tenant_id` convention, enforced through code review, to be the more reliable primary control, with RLS-as-implemented serving its narrower, still-valuable role as a defense against out-of-band access paths.

## Risk register summary

| Risk | Severity if realized | Primary compensating control | Status |
|---|---|---|---|
| JWT in `localStorage`, readable by XSS | High (session takeover) | Strict CSP (`script-src 'self'` in prod), no `dangerouslySetInnerHTML`, 24h expiry, password-change invalidation | Accepted, monitored |
| `xlsx@0.18.5` CVEs | Medium (requires authenticated attacker to upload a crafted file) | Narrow exposure (authenticated-only, export path unaffected), `CsvImport` avoids `xlsx` for the common case | Accepted, tracked for future migration |
| RLS not forced on pool owner | High if application-layer filter is ever missed | Code review discipline on the `WHERE tenant_id` convention; RLS still active against non-owner/out-of-band access | Accepted, documented in source comments |
| Spoofable `X-DG-Client` for service cloud seats | Medium — browser can claim to be Electron/Capacitor | Still requires valid JWT + free device slot for that kind; web body `client: web` is rejected; real device bind is the seat control | Accepted for v1 (no client attestation) |

> [!TIP]
> **The common thread:** none of these are "we didn't think about it" risks — each has a specific, documented reason the more theoretically-secure alternative was rejected, and each has a compensating control that meaningfully reduces (without eliminating) the practical exposure. That's the difference between an accepted risk and a security gap.

## 4. Spoofable `X-DG-Client` on service cloud seats

**The risk:** Client kind (`electron-cloud` / `capacitor-cloud`) is taken from a request header (or body). A browser with a stolen/valid JWT could spoof the header and enroll as desktop/mobile if the user has free slots.

**Why accepted for v1:** True client attestation (signed Electron/Capacitor identity) is a larger platform project. Compensating controls: JWT required, slot inventory is SA-controlled, company-wide session lock still applies, and browser is not auto-gated into the seat UX. Revisit if browser-first service tenants become a product requirement.

## Quiz

1. For each of the three accepted risks, name the one factor that most reduces its real-world severity today.
2. Why would "just force RLS, it's more secure" be bad advice to give this team without also changing the connection-handling architecture?
3. Under what circumstance would the JWT-in-localStorage risk assessment need to be revisited?

<details>
<summary>Answers</summary>

1. JWT-in-localStorage: the strict production CSP (`script-src 'self'`) makes the XSS precondition for exploiting it much harder to achieve in the first place. `xlsx` CVEs: exploitation requires an already-authenticated, already-permissioned user to upload a malicious file — not reachable by unauthenticated traffic. RLS-not-forced: the application-layer `WHERE tenant_id` convention is comprehensive and code-review-enforced, so RLS is a backstop for a narrower set of out-of-band scenarios, not the primary control anyway.
2. Because the application connects as the RLS-bypassing table owner and most handlers use bare `pool.query()` calls without setting `app.tenant_id` first. Forcing RLS without first restructuring every request to run inside a transaction with tenant context set would make `current_setting('app.tenant_id', true)` evaluate to `NULL` for nearly every query, causing RLS policies to match zero rows — turning the app into one that silently returns empty results for legitimate requests, a worse and harder-to-detect failure than the isolation gap it targets.
3. If the frontend's CSP were ever relaxed (e.g., `script-src` reverting to allow `'unsafe-inline'` in production for some new requirement), or if a new feature introduced a `dangerouslySetInnerHTML`-style raw HTML rendering path, the XSS precondition this risk depends on being "hard to achieve" would weaken significantly, and the localStorage-vs-httpOnly-cookie trade-off should be re-evaluated.

</details>

## Related reading

- [Threat Model](./threat-model.md), [Authentication](./authentication.md), [Tenant Isolation](./tenant-isolation.md), [Secrets](./secrets.md), [OWASP Top 10 Mapping](./owasp.md)
