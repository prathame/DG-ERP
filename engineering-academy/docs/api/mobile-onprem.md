---
sidebar_label: On-Prem API
title: On-Prem API
description: Electron on-prem license, heartbeat, provision, and settings/notification push endpoints.
---

# On-Prem API

Cloud Express routes used by the **Electron on-prem** desktop app (license activation, heartbeat, local provision). Capacitor mobile APIs have been removed from the product.

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/onprem/activate` | Public + rate limit | Bind license key ↔ machine id |
| `POST /api/onprem/heartbeat` | Public | Telemetry + `settings` + `pendingNotifications` (SA Bell queue) |
| `POST /api/onprem/deactivate` | Public | Unbind |
| `POST /api/onprem/mark-applied` | Public; `machineId` required when bound | Ack settings push |
| `POST /api/onprem/mark-notifications-delivered` | Public; `machineId` required when bound | Ack Bell messages delivered |
| `GET /api/onprem/tab-config` | **Localhost only** | Pull tab config |
| `POST /api/onprem/apply-settings` | Localhost + `DEPLOYMENT_MODE=onprem` | Deep-merge pushed settings |
| `POST /api/onprem/apply-notifications` | Localhost + `DEPLOYMENT_MODE=onprem` | Insert SA Bell rows into local `tenant_notifications` |
| `POST /api/onprem/provision` | Localhost + `DEPLOYMENT_MODE=onprem` | Create local tenant |
| `/api/super-admin/onprem` | SA | License CRUD |
| `POST /api/super-admin/onprem/:id/notify` | SA | Queue Bell message for one license |

:::danger X-Forwarded-For is ignored for localhost checks
Localhost gates use `req.socket.remoteAddress`. Do not “fix” them by trusting proxy headers — that would let the internet hit provision.
:::

## Related

- [Four Surfaces](/architecture/four-surfaces)  
- [Deployment: Electron](/deployment/electron)  
- [Runbook: On-Prem License](/runbooks/onprem-license)  
