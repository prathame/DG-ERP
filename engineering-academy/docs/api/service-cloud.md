---
sidebar_label: Service Cloud Seats API
title: Service Cloud Seats API
description: Online device slots and company-wide session lock for service cloud tenants.
---

# Service Cloud Seats API

Online-only product for `business_type=service` cloud tenants. **Not** Service Mobile (`DG-SM` / PGlite).

## Tables

- `tenants.client_access_mode` — `mobile` \| `desktop` \| `both`
- `service_cloud_device_slots` — per user, `device_kind` + optional `machine_id`
- `service_cloud_sessions` — **one row per tenant**; `expires_at` ≈ now + 5 minutes

## Super Admin (JWT)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/super-admin/tenants/:id/service-cloud` | Seats payload (users, slots, active session) |
| PUT | `.../service-cloud/access-mode` | Set `clientAccessMode` |
| POST | `.../service-cloud/users` | Create user + slot counts |
| PUT | `.../service-cloud/users/:userId` | Update name/password/slots |
| POST | `.../service-cloud/slots/:slotId/unbind` | Clear machine bind |

## Device / session (tenant JWT)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/service-cloud/claim-device` | Bind free slot (`machineId` 32-hex) |
| POST | `/api/service-cloud/session/acquire` | Take company lock (atomic; 409 if busy) |
| POST | `/api/service-cloud/session/heartbeat` | Extend lock (holder only) |
| POST | `/api/service-cloud/session/release` | Drop lock (holder + machineId required) |
| GET | `/api/service-cloud/session/status` | Busy / holder / mode |

Client kind from `X-DG-Client`: `electron-cloud` → desktop, `capacitor-cloud` → mobile. Browser (`web`) cannot claim or acquire.

## Lock rules

- Acquire uses `INSERT … ON CONFLICT DO UPDATE … WHERE machine_id = EXCLUDED.machine_id` so concurrent claimants cannot overwrite another holder.
- Heartbeat/release require matching `user_id` + `machine_id`.
- No takeover in v1 — wait for release or idle expiry.

## Related

- [Deployment → Service Cloud Seats](/deployment/service-cloud)
- [Service Mobile API](/api/service-mobile) (separate product)
- Manual cases: `tests/cases/service-cloud.md`
