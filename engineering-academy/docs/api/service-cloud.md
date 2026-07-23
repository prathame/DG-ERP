---
sidebar_label: Service Cloud Seats API
title: Service Cloud Seats API
description: Online device slots for cloud Cap / Electron; company session lock for service tenants only.
---

# Service Cloud Seats API

Online Cap + Cloud Electron device seats for **any** cloud business type (`assertCloudTenant`). **Not** Service Mobile (`DG-SM` / PGlite). Company-wide Netflix session lock applies only when `business_type=service`; other types are multi-user (claim + access mode, no company freeze).

## Tables

- `tenants.client_access_mode` — `mobile` \| `desktop` \| `both`
- `tenants.mobile_features` — Cap Online companion pack (non-service)
- `service_cloud_device_slots` — per user, `device_kind` + optional `machine_id`
- `service_cloud_sessions` — **one row per tenant** when company lock applies; `expires_at` ≈ now + 5 minutes

## Super Admin (JWT)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/super-admin/tenants/:id/service-cloud` | Seats payload (users, slots, active session) |
| PUT | `.../service-cloud/access-mode` | Set `clientAccessMode` |
| POST | `.../service-cloud/users` | Create user + slot counts |
| PUT | `.../service-cloud/users/:userId` | Update name/password/slots |
| POST | `.../service-cloud/slots/:slotId/unbind` | Clear machine bind |
| POST | `/api/super-admin/tenants/:id/reset-token` | Shareable password reset link (per user email) |
| POST | `/api/super-admin/tenants/:id/notify` | In-app message; optional `userId` targets one seat user |

`tenant_notifications.user_id` — `NULL` = whole tenant; set = that user only (Bell feed filters accordingly).

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

- **Service:** Acquire uses `INSERT … ON CONFLICT DO UPDATE … WHERE machine_id = EXCLUDED.machine_id` so concurrent claimants cannot overwrite another holder. Heartbeat/release require matching `user_id` + `machine_id`. No takeover in v1 — wait for release or idle expiry.
- **Non-service:** Acquire/heartbeat succeed after device claim with `companySessionLock: false` (no `service_cloud_sessions` row). Release is a no-op success.

Client phone IA (`isServicePhoneUx` — Emergent bottom nav / Masters pills) is **frontend-only** and does not change these seat or session APIs. `ServiceCloudGate` still claims/acquires/heartbeats for Cap Online + Cloud Electron; browser clients cannot enroll.

## Related

- [Deployment → Service Cloud Seats](/deployment/service-cloud)
- [Cloud Mobile UX](/frontend/cloud-mobile) (shared service phone shell)
- [Service Mobile API](/api/service-mobile) (separate product)
- Manual cases: `tests/cases/service-cloud.md`
