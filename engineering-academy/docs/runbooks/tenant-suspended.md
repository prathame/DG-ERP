---
sidebar_label: Tenant Suspended
title: Runbook — Tenant Suspended / Subscription Expired
description: Diagnosing and resolving the "Account suspended" and "Subscription expired" 403 responses for a specific tenant.
---

# Runbook — Tenant Suspended / Subscription Expired

## Symptoms

- One specific tenant's users get `403` on **every** authenticated API call, with message `"Account suspended. Contact admin."` or `"Subscription expired. Contact admin to renew."`.
- Login itself (`POST /api/auth/login`) still appears to succeed — this is because `/api/auth/login` is a `PUBLIC_PATH` and isn't gated by this check; the block happens on the tenant's very next API call, not at login. **Don't let "the user says login worked" rule this out.**

## Where this check lives

```ts
// server/app.ts — global auth middleware, runs before every route handler
if (row.status === 'suspended') return res.status(403).json({ error: 'Account suspended. Contact admin.' });
const expiresAt = row.status === 'trial' ? row.trial_ends_at
                : row.status === 'active' ? row.subscription_ends_at
                : null;
if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
  return res.status(403).json({ error: 'Subscription expired. Contact admin to renew.' });
}
```

This check runs on **every single request** to `/api/*` for a tenant-scoped user — it's not route-specific, so there's no partial/read-only degraded mode; a suspended or expired tenant is fully blocked everywhere at once.

## Diagnosis

```sql
SELECT id, company_name, slug, status, trial_ends_at, subscription_ends_at
FROM tenants WHERE slug = 'the-affected-slug';
```

| `status` value | Meaning | This tenant's users see |
|---|---|---|
| `active` | Normal | No block (unless `subscription_ends_at` is in the past) |
| `trial` | On a trial plan | Blocked once `trial_ends_at` passes |
| `suspended` | Manually suspended, typically by Super Admin | Always blocked, regardless of any expiry dates |

## Why a tenant might be suspended — check before "fixing"

1. **Deliberate Super Admin action** — payment dispute, abuse report, contractual issue. Check `audit_log` and any internal notes/tickets before reversing this — it may be intentional and you could be undoing a decision made for a reason you don't have context on.
2. **Trial expired naturally** — `trial_ends_at` passed. This is expected product behavior, not an incident. The fix (if the customer wants to continue) is upgrading their plan, not "fixing a bug."
3. **Subscription lapsed** — `subscription_ends_at` passed, likely tied to a billing cycle that wasn't renewed.

## Resolving it (assuming reactivation is the correct action)

Via Super Admin UI (preferred — audited, consistent with how the platform expects this to happen):

1. Log into Super Admin.
2. Find the tenant, open its detail view.
3. Set status back to `active`, and/or extend `subscription_ends_at`/`trial_ends_at` as appropriate for the resolution (e.g. a plan renewal).

Via direct SQL (only if the UI genuinely can't do what's needed, and you understand the consequence of bypassing the audit trail):

```sql
UPDATE tenants SET status = 'active', subscription_ends_at = '2027-01-01' WHERE id = 'T...';
```

**After either path, tell the customer to log out and back in** — while the block itself is checked on every request (not cached beyond the per-request `authCache` window, see `server/utils/authCache.ts`), a fresh login also gives them a clean JWT and confirms end-to-end that the fix worked from their perspective, not just from a database query.

## A subtlety: `authCache` and how fast a status change takes effect

`server/utils/authCache.ts` caches the `(password_changed_at, role, vendor_id, permissions, status, subscription_ends_at, trial_ends_at)` tuple per `(userId, tenantId, iat)` to avoid a DB round-trip on every single request. If you reactivate a tenant, there is a small window where a request already in-flight, or one hitting a still-warm cache entry, could reflect the *old* suspended status until the cache entry naturally expires or a new token (`iat`) is issued. In practice this window is short — but if a customer says "I still see suspended immediately after you told me it's fixed," ask them to wait a moment and retry, or log out/in to force a fresh `iat` and a fresh cache miss, before assuming your fix didn't take.

## What this is NOT the runbook for

- If the tenant reports `401` (not `403`), that's an authentication issue — see [Auth Failures](./auth-failures.md).
- If only *some* of the tenant's users are blocked and others aren't, that's a per-user permission issue, not a tenant-level suspension — see [Auth Failures](./auth-failures.md)'s `403` decision table.
- If the tenant is an **on-prem** install reporting a similar-sounding block, that's driven by `onprem_licenses.status`, a completely separate table and code path — see [On-Prem License](./onprem-license.md).

## Related pages

- [Auth Failures](./auth-failures.md)
- [On-Prem License](./onprem-license.md)
- [File Walkthrough: server/app](/files/server/app)
- [File Walkthrough: server/utils (authCache)](/files/server/utils)
