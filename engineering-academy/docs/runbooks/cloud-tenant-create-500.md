---
sidebar_label: Cloud Tenant Create 500
title: Cloud Tenant Create Returns 500
description: Diagnose Internal server error when Super Admin creates a cloud tenant on Render.
---

# Cloud Tenant Create Returns 500

## Symptom

Super Admin → **Cloud** → **Create Cloud Tenant** fails with `Internal server error` (HTTP 500). Health check may still be green.

## Likely causes (fresh / wiped DB)

1. **Missing `plans` rows** — `tenants.plan_id` FK to `plans(id)`. Create defaults to `BASIC`. If plans were never seeded or were deleted, Postgres raises `23503` → was surfaced as 500.
2. **Empty slug** — company names with only non-Latin characters used to produce `slug = ''`.
3. **Invalid custom `planId`** — UI/API sent a plan id that does not exist.

Self-serve `/api/auth/signup` is disabled (`410`); cloud companies are created only via `POST /api/super-admin/tenants`.

## Fix in code (current)

- `ensureDefaultPlans()` runs on boot and again immediately before SA tenant create.
- `provisionTenant` rejects unknown plans with `INVALID_PLAN` (400) and never inserts an empty slug.
- FK `23503` on create maps to 400 with a clear message.

## Manual recovery on Render (if old deploy)

1. Open Render → service **dg-erp** → Logs; search `Tenant create failed` / `23503` / `tenants_plan_id_fkey`.
2. Redeploy a build that includes `ensureDefaultPlans` on create (or restart so boot seed runs).
3. Confirm plans: Super Admin → Plans should list Trial / Basic / Standard / Professional.
4. Retry Create Cloud Tenant with a unique admin email.

## Retry checklist

1. Log in at `https://dg-erp.onrender.com/super-admin` (or your `PUBLIC_APP_URL`).
2. Cloud tab → Create Cloud Tenant.
3. Fill company, admin name/email, pick a plan, business type → submit.
4. Share the returned login URL `/{slug}` plus temp password with the customer.
