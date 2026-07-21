# Cloud mobile companion (Cap Online)

One Cap APK (`in.dhandho.service`). First launch: **Online** or **Offline**.

| Mode | Product |
|------|---------|
| **Offline** | Service Mobile (`DG-SM-`) — unchanged, service-only |
| **Online** | Cloud Cap for **any** business type via company slug |

## Super Admin

Sidebar:

- **Cloud** — companies; detail has **Cloud app seats** (access mode, seats, Cap features)
- **On-Prem** — desktop offline licenses
- **Offline Mobile** — `DG-SM-` licenses

On create: **Need mobile app?** → `client_access_mode` `both` or `desktop`, plus `mobile_features` for non-service companions.

## Concurrency

| Tenant | Behavior |
|--------|----------|
| **service** | Company-wide session lock (Netflix-style freeze) |
| **other** | Multi-user like other ERPs; invoice payments use DB `FOR UPDATE` |

## Cap Online companion features

Stored in `tenants.mobile_features` (`stock`, `sales`, `quotations`, `collections`, `reports`). Service phone UX stays Emergent IA; manufacturer/silver use this pack to hide tabs.
