---
sidebar_label: Permissions
title: server/middleware/permissions.ts — Module-Based RBAC
description: How Dhandho maps a URL path to a business "module", computes an access level (hidden/view/print/full), and enforces it globally.
---

# `server/middleware/permissions.ts` — Module-Based RBAC

:::info The core idea in one line
Every path belongs to exactly one **module**; every user has a **permission level per module**; GET needs `view`, everything else needs `full`.
:::

## 1. The four access levels

```ts
export type AccessLevel = 'hidden' | 'view' | 'print' | 'full';
const RANK: Record<AccessLevel, number> = { hidden: 0, view: 1, print: 2, full: 3 };
```

Levels are **ordered**, not just labels — `RANK` lets `enforceModulePermissions` compare "does the caller have at least X" with a simple integer comparison, rather than a big switch statement. `print` sits between `view` and `full` — it exists specifically for the Vendor persona: a vendor might need to **print** a distribution challan (a physical document) without being allowed to edit the underlying record.

## 2. The 13 modules

```ts
const ALL_MODULES = [
  'dashboard', 'sales', 'distribution', 'inventory', 'purchases', 'quotations',
  'orders', 'finance', 'accounts', 'warranty', 'replacements', 'rewards', 'settings',
] as const;
```

Notice this list doesn't 1:1 match the 34 route files or the frontend's `tab_config` keys exactly — several routes map to the *same* module (see the path table below). Modules are a **coarser** grouping than routes, deliberately, because permission granularity at the route level would be unmanageable for a small admin-configured permissions UI.

## 3. Role presets — the default, before any custom override

```ts
const ROLE_PRESETS: Record<string, Record<string, AccessLevel>> = {
  Admin: /* full on everything */,
  'Super Admin': /* full on everything */,
  Manager: /* full on everything except settings: view */,
  Staff: /* view on everything */,
  Warehouse: { dashboard: 'view', distribution: 'print', inventory: 'view', /* rest: hidden */ },
  Vendor: { dashboard: 'view', distribution: 'view', finance: 'view', /* rest: hidden */ },
};
```

| Role | Philosophy |
|---|---|
| Admin / Super Admin | Full trust — owns the tenant |
| Manager | Full operational trust, but can't reconfigure the business (`settings: view`) |
| Staff | Read-only everywhere by default — a common starting point that admins then customize per-user |
| Warehouse | Extremely narrow — dashboard visibility, print-only distribution challans, view-only inventory; everything money/sales/warranty/rewards/settings is `hidden` |
| Vendor | Sees their own dashboard/distribution/finance at `view` level; everything else `hidden` (blockVendors handles the write-side separately for finance) |

`normalizePermissions(perms, role)` handles three legacy/current shapes: a proper `Record<module, AccessLevel>` object (current format, stored as JSONB in `users.permissions`), a bare array of module names (legacy format — treated as `full` for listed modules, `hidden` for the rest), or nothing at all (fall back to the role preset).

## 4. Path → module mapping — the `PATH_MODULE` table

A curated list of `[prefix, module]` pairs, checked in order, **first match wins**:

| Prefix | Module | Notable grouping decision |
|---|---|---|
| `/vendor-finance`, `/invoice-finance` | `finance` | Both finance sub-flows share one permission gate |
| `/accounts`, `/reports`, `/gst`, `/gstr`, `/gstr2b`, `/gstr3b`, `/payroll`, `/staff`, `/expenses`, `/banks` | `accounts` | Everything "back office money/compliance" is gated as one module — a Staff-role bookkeeper either sees all of this or none of it |
| `/dashboard`, `/analytics`, `/chatbot`, `/search` | `dashboard` | Chatbot and global search are treated as dashboard-adjacent conveniences, not their own permission surface |
| `/products`, `/categories`, `/price-lists` | `inventory` | Pricing is bundled with inventory, not with sales |
| `/purchases`, `/suppliers`, `/supplier-finance` | `purchases` | Supplier-side finance is under `purchases`, distinct from vendor-side `finance` |
| `/invoices`, `/customers`, `/mapping`, `/sales` | `sales` | Standalone invoicing lives under `sales`, not `accounts` |
| `/vendors` | `distribution` | Vendor master data is gated by the distribution module, since vendors are primarily a distribution concept |
| `/admin`, `/backup`, `/masters`, `/settings/bill` | `settings` | Admin console + backups + master data config all gated as one "settings" surface |

If a path prefix isn't in the table at all (e.g. `/api/health`, `/api/tenant/by-slug`), `moduleForPath` returns `null` and `enforceModulePermissions` calls `next()` unconditionally — **ungated paths exist by design** for public/health endpoints, but this is also the sharpest edge of this system: forgetting to add a new route's prefix to `PATH_MODULE` silently makes it **permission-unchecked**, not permission-denied.

:::danger The silent-bypass footgun
`enforceModulePermissions` fails **open** for unmapped paths (`if (!mod) return next()`), not closed. Adding a new sensitive route without adding its prefix to `PATH_MODULE` means every authenticated user — regardless of role — gets full access to it. This is the single most important thing to check when reviewing a PR that adds a new route file.
:::

## 5. The enforcement function itself

```ts
export function enforceModulePermissions(req: AuthRequest, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user?.userId) return next(); // public / platform paths already handled upstream

  const mod = moduleForPath(req.path);
  if (!mod) return next();

  const perms = user.permissions;
  const level = getAccessLevel(perms, user.role, mod);
  const need: AccessLevel = req.method === 'GET' || req.method === 'HEAD' ? 'view' : 'full';
  if (RANK[level] < RANK[need]) {
    return res.status(403).json({ error: `Access denied for module "${mod}" (need ${need}, have ${level}).` });
  }
  next();
}
```

Notice the binary need calculation: **any** mutating verb (`POST`/`PUT`/`PATCH`/`DELETE`) requires `full` — there's no separate "you can create but not delete" granularity at this layer. `print`-level access is meaningful **only** for GET-style needs today, since `need` never resolves to `print` — it exists as an access *level* a role can be granted, but nothing in `enforceModulePermissions` currently asks for exactly `print`. (Print-specific UI gating happens client-side, reading the same `permissions` object.)

## 6. `getAccessLevel` — the actual decision function

```mermaid
flowchart TD
  Start[getAccessLevel(permissions, role, module)] --> Admin{role is Admin/Super Admin/super_admin?}
  Admin -->|yes| Full[return 'full' — unconditional]
  Admin -->|no| HasPerms{permissions object non-empty?}
  HasPerms -->|yes| Lookup[perms[module]]
  HasPerms -->|no| Preset1[ROLE_PRESETS[role] or Staff]
  Lookup --> Valid{is a valid AccessLevel?}
  Valid -->|yes| Return1[return that level]
  Valid -->|no, missing key| Preset2[fall back to ROLE_PRESETS[role][module]]
  Preset2 --> Found{found?}
  Found -->|yes| Return2[return it]
  Found -->|no| Hidden[return 'hidden' — default deny]
```

Admin/Super Admin get an **unconditional bypass** at the very top — no permissions object, however misconfigured, can ever lock out an Admin. Every other role falls through a layered fallback: explicit per-user override → role preset → `hidden`. The default at the bottom of every fallback chain is `hidden`, not `full` — this is the fail-closed design that `PATH_MODULE`'s fail-open behavior notably does **not** share; the inconsistency is worth remembering as an interview talking point.

## 7. Where the frontend reads the same data

The exact same `permissions` object (normalized the exact same way, duplicated logic in `src/App.tsx` and various feature views) drives which tabs render at all, and whether action buttons are disabled. The frontend check is a **UX convenience** — hiding a button a user can't use — never a security boundary; `enforceModulePermissions` on the server is the only check that actually matters. A user could open dev tools and call a hidden-tab's API directly, and the server-side gate is what stops them.

## Hands-on exercise

1. Add a hypothetical new route prefix `/api/service-tickets` to a scratch copy of `permissions.ts` under a new `serviceTickets` module, then add it to `ALL_MODULES` and give it a role preset for every existing role. What decision did you make for `Warehouse` and `Vendor`, and why?
2. Find a route in `server/routes/*.ts` whose path prefix is **not** in `PATH_MODULE`. Is it a legitimately public/health-style endpoint, or is it a gap?
3. Log in as `Staff` and try a `POST` on any module where your preset is `view`. Confirm you get exactly the 403 message format shown above, including the module name and both levels.

## Debugging exercise

A Warehouse-role user reports "I can see the Dashboard tab, but clicking into Analytics gives me a 403." Given `/analytics` maps to the `dashboard` module and `Warehouse`'s preset has `dashboard: 'view'`, is this expected behavior or a bug? Now check whether the *frontend* even renders an Analytics entry point for Warehouse users at all — where does the mismatch between "frontend hides it" and "backend would 403 it anyway" actually matter in practice?

## Optimization challenge

`moduleForPath` does a **linear scan** through `PATH_MODULE` (order-dependent, first-match-wins) on every single authenticated request. Estimate how many prefixes exist today, and propose a data structure (e.g. a trie keyed by path segment, or a `Map` keyed by the first path segment) that would make this O(1) or O(log n) instead of O(n) — and honestly assess whether it's worth doing at Dhandho's current request volume.

## Quiz

1. Why is `PATH_MODULE`'s fail-open behavior for unmapped paths considered the riskiest part of this file?
2. Which role gets an unconditional bypass regardless of any stored permissions object, and why is that safe?
3. What HTTP methods require `full` access, and what do GET/HEAD require?
4. Why does `print` exist as a level between `view` and `full`?

<details>
<summary>Answers</summary>

1. Because forgetting to register a new sensitive route's path prefix means every authenticated user gets unrestricted access to it silently — there's no error, no log line, just an accidentally-open endpoint.
2. `Admin`, `Super Admin`, and `super_admin` — safe because these are the tenant/platform owner roles that are expected to have full access anyway; the bypass just removes a failure mode where a misconfigured permissions object could accidentally lock out the one person who needs to fix it.
3. Any mutating verb (POST/PUT/PATCH/DELETE) requires `full`; GET and HEAD require `view`.
4. To support the Vendor persona's need to print physical documents (e.g. distribution challans) without granting edit rights over the underlying business record.

</details>

## Related pages

- [Middleware Stack](/backend/middleware-stack)
- [Auth Middleware](/backend/auth-middleware)
- [Authorization (Security)](/security/authorization)
- [Multi-tenancy](/architecture/multi-tenancy)
- [Lab: Debug a 403](/labs/lab-debug-403)
- [Quiz: Security](/quizzes/quiz-security)
