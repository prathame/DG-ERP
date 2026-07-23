# Cloud mobile companion (Cap Online)

**One Cap APK** (`in.dhandho.service`). First launch latches **Online** or **Offline** (not a second installer). Offline latch stays service-only; Online serves any cloud tenant with mobile access.

| Mode | Product |
|------|---------|
| **Offline** | Service Mobile (`DG-SM-`) — unchanged, service-only |
| **Online** | Cloud Cap for **any** business type via company slug + seats |

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

Stored in `tenants.mobile_features` (`stock`, `sales`, `quotations`, `collections`, `reports`, `chatbot`). Service phone UX stays Emergent IA; manufacturer/silver use this pack to hide tabs / chatbot. Chatbot defaults **off** on companion; SA can enable.

## Refresh config (not data sync)

Cloud Online already loads invoices/stock from the API when you open a screen — no timer sync.

Cap Online sidebar has **Refresh config** (manual). It reloads from `GET /api/settings/profile`:

- `mobileFeatures` / `clientAccessMode` (SA toggles, e.g. hide Quotations)
- `tabConfig`, permissions, business type flags

Use after Super Admin changes mobile features. Full **Settings** stays desktop; phone is companion only.
