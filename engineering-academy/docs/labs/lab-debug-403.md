---
sidebar_label: "Lab: Debug a 403"
title: "Lab: Debug a 403 — A Systematic Walkthrough"
description: Reproduce, diagnose, and fix three different classes of 403 error in Dhandho — module permissions, route-level role guards, and vendor scoping.
---

# Lab: Debug a 403 — A Systematic Walkthrough

:::tip Why this lab exists
"I'm getting a 403" is one of the most common support/debugging requests in this codebase, and there are **three unrelated systems** that can produce one. This lab teaches you the systematic elimination process instead of guessing.
:::

## Learning objectives

- Given only a 403 response, determine which of Dhandho's three authorization layers produced it
- Read the exact error message format each layer produces and know how to distinguish them
- Fix each class of 403 correctly, without breaking the security boundary that was (correctly) blocking you

## The three sources of a 403, and their fingerprints

| Source | File | Error message shape | When it fires |
|---|---|---|---|
| Module permissions | `server/middleware/permissions.ts` | `Access denied for module "X" (need Y, have Z).` | Every request, checked globally after auth |
| Route-level role guard | `server/middleware/auth.ts` (`requireRole`) | `Access denied. Required role: X or Y. Your role: Z.` | Only on routes that explicitly mount `requireRole`/`requireAdmin` |
| Vendor scoping (IDOR guard) | `server/middleware/auth.ts` (`assertVendorAccess`) | `Access denied for this vendor.` or `Vendor account is not linked to a vendor profile.` | Only on routes that explicitly call `assertVendorAccess`/`assertVendorLinked` |
| Tenant/account status | `server/app.ts` (global auth) | `Account suspended. Contact admin.` / `Subscription expired...` | Every request, before permissions are even checked |

The message format is your first diagnostic clue — **read it exactly**, don't skim past it.

## Scenario A — Module permission 403

**Setup:** Log in as a `Staff`-role user (default preset: `view` on everything). Attempt:

```bash
curl -X POST http://localhost:3001/api/products \
  -H "Authorization: Bearer $STAFF_TOKEN" -H "Content-Type: application/json" \
  -d '{"name":"Test Product","price":100}'
```

**Expected 403:** `{"error":"Access denied for module \"inventory\" (need full, have view)."}`

**Diagnosis path:**
1. Notice the message names a module (`inventory`) and two levels — this is unmistakably [Permissions](/backend/permissions).
2. Confirm `/api/products` maps to `inventory` via `PATH_MODULE` in `permissions.ts`.
3. Confirm `Staff`'s role preset gives `inventory: 'view'`, and `POST` requires `full` (`req.method !== GET/HEAD`).

**Fix (if this Staff user should legitimately be able to add products):** an Admin needs to grant this specific user a custom `permissions` override (`{"inventory": "full", ...}`) via the user-management UI/API — do **not** change the global `Staff` preset unless the intent is for *all* Staff everywhere to gain this right.

## Scenario B — Route-level role guard 403

**Setup:** Log in as a `Manager`-role user (module preset: `full` on everything except `settings`). Attempt an Admin-only destructive endpoint:

```bash
curl -X DELETE http://localhost:3001/api/products/all \
  -H "Authorization: Bearer $MANAGER_TOKEN"
```

**Expected 403:** `{"error":"Access denied. Required role: Admin or Super Admin. Your role: Manager."}`

**Diagnosis path:**
1. Notice the message says "Required role," not "Access denied for module" — this is `requireRole`, a **route-level** guard, not the module-permission layer.
2. Even though Manager has `full` module access to `inventory` (which would satisfy layer 1), this specific route additionally mounts `requireRole(['Admin'])` as an extra, stricter gate.
3. This is by design: some actions (bulk-delete-all) are too destructive to be gated by a general module permission alone.

**Fix:** this is almost never something to "fix" by loosening the guard — a Manager genuinely shouldn't bulk-delete all products. The correct resolution is usually "escalate to an Admin to perform this action," not a code change.

## Scenario C — Vendor scoping 403 (IDOR guard)

**Setup:** Log in as Vendor A. Attempt to access Vendor B's distribution data:

```bash
curl http://localhost:3001/api/vendors/VENDOR_B_ID/distribution \
  -H "Authorization: Bearer $VENDOR_A_TOKEN"
```

**Expected 403:** `{"error":"Access denied for this vendor."}`

**Diagnosis path:**
1. This message is terse and specific — no module name, no role list. Grep the codebase for this exact string; you'll land in `assertVendorAccess` in `server/middleware/auth.ts`.
2. Confirm the JWT's `vendorId` claim (Vendor A's own ID) doesn't match the `:id` route parameter (Vendor B's ID).
3. **This 403 is correct and must never be "fixed" by loosening the check** — it's the core IDOR protection discussed in [Multi-tenancy](/architecture/multi-tenancy) and [Authorization](/security/authorization). If Vendor A has a legitimate business reason to see Vendor B's data, that's an escalation to Admin, not a code change.

## Scenario D — It's not even a permissions problem

Sometimes a 403 is neither of the above — it's account-level:

```bash
curl http://localhost:3001/api/dashboard -H "Authorization: Bearer $SOME_TOKEN"
# {"error":"Account suspended. Contact admin."}
```

**Diagnosis path:** this fires in the **global auth middleware itself**, before `enforceModulePermissions` even runs — check `tenants.status` and `subscription_ends_at`/`trial_ends_at` for that tenant directly in the database.

## A general debugging flowchart

```mermaid
flowchart TD
  Got403[Received a 403] --> ReadMsg{Read the exact error message}
  ReadMsg -->|"Account suspended / Subscription expired"| Tenant[Check tenants.status / expiry columns]
  ReadMsg -->|"Access denied for module ..."| Perm[Check PATH_MODULE + role preset in permissions.ts]
  ReadMsg -->|"Required role: X. Your role: Y."| Role[Find the requireRole() call on this exact route]
  ReadMsg -->|"Access denied for this vendor" / "not linked"| Vendor[Check JWT vendorId vs. route param — this is correct behavior, don't loosen it]
  ReadMsg -->|Something else entirely| Grep[grep the exact string across server/ to find the source]
```

## Reflection questions

1. Why does it matter, practically, that these three systems produce visibly different error message shapes rather than a single generic "Access denied"?
2. For Scenario B, what would have happened if `requireRole` had been checked **before** `enforceModulePermissions` in the middleware order, instead of module permissions running globally and route guards running per-route afterward? Would the observable behavior actually differ?
3. Which of the four scenarios above is a bug to fix in code, versus a correctly-functioning security boundary that should be resolved by an operational/business decision instead?

## Quiz

1. What's the fastest way to determine which of the three authorization systems produced a given 403, without reading any code first?
2. Why should `assertVendorAccess` never be "fixed" by loosening it in response to a support ticket?
3. Which 403 fires before permissions are even checked, and why?

<details>
<summary>Answers</summary>

1. Read the exact error message text — each system produces a distinctly shaped message (`Access denied for module "X"`, `Required role: X. Your role: Y.`, `Access denied for this vendor.`), which is enough to identify the source without reading code.
2. Because it's the deliberate IDOR (cross-vendor data access) protection — loosening it to satisfy one support ticket would reopen a real data-leak vulnerability for every vendor on the platform; the correct fix for a legitimate cross-vendor need is an Admin-mediated workflow, not weakening the guard.
3. Account/tenant status checks (`suspended`, expired subscription/trial) — they fire in the global auth middleware in `server/app.ts`, before `enforceModulePermissions` even runs, because an entirely suspended account shouldn't get a module-specific answer at all.

</details>

## Related pages

- [Permissions](/backend/permissions)
- [Auth Middleware](/backend/auth-middleware)
- [Authorization](/security/authorization)
- [Multi-tenancy](/architecture/multi-tenancy)
- [Lab: Tenant Isolation](/labs/lab-tenant-isolation)
