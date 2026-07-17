---
sidebar_label: Service Mobile API
title: Service Mobile API
description: Cloud license, heartbeat, hard sync, and encrypted backup endpoints for the offline Service Mobile phone app.
---

# Service Mobile API

Public device endpoints (rate-limited, no JWT — validated by `licenseKey` + bound `machineId`):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/service-mobile/activate` | Bind device; return company + tab preset |
| POST | `/api/service-mobile/heartbeat` | Liveness, settings, pending Bell, version gates |
| POST | `/api/service-mobile/deactivate` | Device-initiated unbind |
| POST | `/api/service-mobile/mark-applied` | Ack settings / clear `forceSyncAt` |
| POST | `/api/service-mobile/mark-notifications-delivered` | Ack Bell delivery |
| POST | `/api/service-mobile/backup` | Upload encrypted dump (bound device only) |
| POST | `/api/service-mobile/backup/latest` | Download latest backup (bound device only) |

Super Admin (JWT):

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/super-admin/service-mobile` | List / issue (`DG-SM-…`, service, maxUsers=1) |
| PUT/DELETE | `/api/super-admin/service-mobile/:id` | Update / delete |
| POST | `.../:id/unbind` | Clear `machine_id` for phone transfer |
| POST | `.../:id/force-sync` | Stamp `settings.forceSyncAt` |
| POST | `.../:id/notify` | Queue Bell message |

**Never** accept ERP business mutations on these routes — local PGlite handles ERP.

## Related

- [Deployment → Service Mobile](/deployment/service-mobile)
- [On-Prem API](/api/mobile-onprem)
