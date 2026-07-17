---
sidebar_label: Day 1 Onboarding
title: Day 1 — Your First Day on Dhandho
description: A guided first day for a new engineer joining the Dhandho / DG-ERP team — what to read, what to run, and what to build before lunch on day two.
---

# Day 1 — Your First Day on Dhandho

:::tip Goal for today
By end of day, you should be able to run the app locally, log in as both a tenant admin and a Vendor, and explain the four-surface architecture to someone else in two minutes.
:::

## Hour 1 — Orient yourself (reading, no coding yet)

Read, in this order:

1. [Business Goals](/overview/business-goals) — who Dhandho is for and why it exists
2. [Tech Stack](/overview/tech-stack) — what's actually in `package.json` and why
3. [System Overview](/architecture/system-overview) — the one diagram that explains everything

Do **not** try to read the entire codebase today. This academy exists so you don't have to.

## Hour 2 — Get it running

Follow [Local Setup](/tutorials/local-setup) exactly. By the end of this hour you should have:

- A local Postgres database with the schema loaded (`initSchema()` ran successfully — you'll see `✓ Database schema ready` and `✓ Row Level Security policies applied` in your terminal)
- `npm run dev:all` running both the Vite dev server (port 3000) and the Express API (port 3001)
- A Super Admin account you can log into

:::info If something fails here, stop and fix it before moving on
Onboarding day is exactly when you want to discover environment problems — not three days from now during a feature deadline.
:::

## Hour 3 — Provision your own test tenant

Use the Super Admin console (or a direct API call) to provision a tenant, mirroring what [Business Goals](/overview/business-goals) described conceptually:

```bash
curl -X POST http://localhost:3001/api/super-admin/tenants \
  -H "Authorization: Bearer $SUPER_ADMIN_TOKEN" -H "Content-Type: application/json" \
  -d '{"companyName":"Onboarding Test Co","adminEmail":"me@onboarding.test","adminName":"New Engineer","planId":"PROFESSIONAL"}'
```

Log in as that tenant's admin at `http://localhost:3000/onboarding-test-co`. Click through every tab. For each tab, name the backend route file it talks to (use [Folder Structure](/overview/folder-structure) as your map).

## Hour 4 — Create a second role and feel the permission boundaries

1. As the Admin you just created, add a second user with role `Staff`.
2. Log in as that Staff user in a different browser profile/incognito window.
3. Confirm: you can *see* most tabs (read-only preset) but cannot save changes anywhere.
4. Try to hit a mutating endpoint directly via curl with the Staff user's token (bypassing the UI entirely) and observe the 403. Read [Permissions](/backend/permissions) if the exact error message surprises you.

## Hour 5 (post-lunch) — Follow one request end to end

Pick the **Inventory** tab. With the server running:

1. Open browser DevTools → Network.
2. Click into Inventory, observe the `GET /api/products` request.
3. Open `server/routes/products.ts` and find the exact handler that served it.
4. Add a temporary `console.log(req.tenantId)` inside that handler, refresh the tab, and watch it print in your terminal.
5. Remove the log. You've now traced a real request through [Request Lifecycle](/architecture/request-lifecycle) with your own hands, not just read about it.

## Hour 6 — Read the security fundamentals

Read [Multi-tenancy](/architecture/multi-tenancy) and [Threat Model](/security/threat-model) in full. This codebase's single most consequential rule is "every query needs `tenant_id`" — internalize it today, because it's the thing that will come up in every single code review you receive or give from now on.

## End of day — Self-check

You should now be able to answer, without looking anything up:

- What are the four client surfaces, and which one has no local database?
- What are the three "locks" that enforce tenant isolation?
- What HTTP status code does a permission-denied request return, and name one of the three systems that can produce it?
- Where does the frontend keep the auth token, and why is that an accepted risk rather than a bug?

If any of these feel shaky, revisit the corresponding page before day two — don't move forward with a shaky foundation on the two topics (multi-tenancy, permissions) that gate almost every PR review in this codebase.

## Day 2 preview

Tomorrow: [First Feature](/tutorials/first-feature) walks you through adding a small, real feature end to end — server route, permission registration, frontend view, and a test — using the exact same playbook a real PR in this codebase follows.

## Quiz

1. Name the one file you should read *before* touching any SQL query in this codebase, and why.
2. What's the fastest way to verify your own understanding of tenant isolation without writing a single line of code?
3. Why does day 1 deliberately avoid "read the whole codebase" as a goal?

<details>
<summary>Answers</summary>

1. `server/middleware/permissions.ts` and the [Multi-tenancy](/architecture/multi-tenancy) page — because every query you write needs to respect both the module-permission gate and the `tenant_id` predicate, and getting either wrong is the most common category of real mistake in this codebase.
2. Log in as two different tenants in two browser sessions and confirm neither can see the other's data anywhere in the UI or via direct API calls — a hands-on check beats a purely conceptual one.
3. Because the codebase is large (34 route files, 19 feature folders, multiple deployment targets) and most of it follows repeating patterns once you understand the core architecture — depth-first exploration of everything on day one would burn the day without building the mental model that makes the rest of the codebase readable quickly.

</details>

## Related pages

- [Local Setup](/tutorials/local-setup)
- [First Feature](/tutorials/first-feature)
- [Mental Models](/tutorials/mental-models)
- [Multi-tenancy](/architecture/multi-tenancy)
- [Permissions](/backend/permissions)
