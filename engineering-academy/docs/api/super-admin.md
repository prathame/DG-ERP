---
sidebar_label: Super Admin API
title: Super Admin / Platform API
description: Platform login, tenants, plans, billing, impersonation, on-prem licenses, mobile invites.
---

# Super Admin / Platform API

**Router:** `server/routes/super-admin.ts` (+ mounts in mobile/onprem for SA subpaths)  
**Auth:** `superAdminMiddleware` — **not** tenant Admin.

## Capability groups

| Group | Examples |
|---|---|
| Auth | `POST /api/super-admin/login` |
| Tenants | CRUD, reset token, export, notify, upgrade plan |
| Impersonation | `POST …/tenants/:id/impersonate` → 15m JWT + audit |
| Plans / billing | Plan CRUD; tenant invoices paid flags |
| Analytics | Dashboard; cloud / on-prem / Offline Mobile (`service-mobile-analytics`) fleet health |
| Versions | `platform_config` latest/min on-prem + Offline Mobile; evergreen download URLs |
| On-prem licenses | via onprem router SA paths |
| Mobile | invites, force-sync, devices; Offline Mobile licenses via service-mobile SA paths |

### Offline Mobile analytics (fleet only)

`GET /api/super-admin/service-mobile-analytics` — aggregates `service_mobile_licenses` heartbeat fields (`last_seen`, `app_version`, `valid_until`, `status`). Online = `last_seen` within ~70 minutes. **Does not** store or return ERP business KPIs (invoices, collections, clients).

Public: `GET /api/tenant/by-slug/:slug` for branded login.

## Impersonation rules

- Short TTL (15 minutes)  
- Claim `impersonatedBy`  
- Client strips query token from URL after consume  
- Always audit-logged  

## Related

- [Authorization](/security/authorization)  
- [Mobile & On-Prem API](/api/mobile-onprem)  
