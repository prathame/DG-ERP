---
sidebar_label: Service Mobile API
title: Service Mobile API
description: Cloud license, heartbeat, and hard sync for Offline Mobile — no ERP backup storage on our servers.
---

# Service Mobile API

Public device endpoints (rate-limited, no JWT — validated by `licenseKey` + bound `machineId`):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/service-mobile/activate` | Bind device; return company + tab preset (`hasBackup` always `false`) |
| POST | `/api/service-mobile/heartbeat` | Liveness, settings, pending Bell, version gates |
| POST | `/api/service-mobile/deactivate` | Device-initiated unbind |
| POST | `/api/service-mobile/mark-applied` | Ack settings / clear `forceSyncAt` |
| POST | `/api/service-mobile/mark-notifications-delivered` | Ack Bell delivery |
| POST | `/api/service-mobile/backup` | **410** — cloud ERP backups disabled |
| POST | `/api/service-mobile/backup/latest` | **410** — restore from staff local file instead |

Super Admin (JWT):

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/api/super-admin/service-mobile` | List / issue (`DG-SM-…`, service, maxUsers=1) |
| PUT/DELETE | `/api/super-admin/service-mobile/:id` | Update / delete |
| POST | `.../:id/unbind` | Clear `machine_id` for phone transfer |
| POST | `.../:id/force-sync` | Stamp `settings.forceSyncAt` |
| POST | `.../:id/notify` | Queue Bell message |

**Never** accept ERP business mutations on these routes — local PGlite handles ERP.

## User-owned backups (client)

Staff export/restore encrypted JSON on the phone (`src/platforms/service-mobile/localBackup.ts`). Optional Gmail opens their mail app only — we do not store or email the file ourselves. Schedule: Settings → Auto Backup (daily / weekly / monthly).

## Related

- [Deployment → Service Mobile](/deployment/service-mobile)
- [On-Prem API](/api/mobile-onprem)
- Manual cases: `tests/cases/service-mobile.md`
