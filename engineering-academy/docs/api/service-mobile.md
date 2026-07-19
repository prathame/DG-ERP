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
| GET | `/api/super-admin/service-mobile-analytics` | Fleet/license health (online/offline/versions/expiry/status) — **not** ERP KPIs |

**Never** accept ERP business mutations on these routes — local PGlite handles ERP.

### Local ERP Masters contract (on-device router)

One router (`src/platforms/service-mobile/local/router.ts`) — not a separate codebase. Contract tests: `tests/unit/service-mobile-local-api-contract.test.ts`.

| Masters tab | Endpoints (must return UI camelCase arrays/objects; never “not implemented”) |
|-------------|-------------------------------------------------------------------------------|
| Clients | `GET/POST /vendors`, `POST /vendors/bulk`, `PUT/DELETE /vendors/:id` |
| Prices | `GET/POST /price-lists`, `POST /price-lists/bulk`, `DELETE /price-lists/:id`, `GET /price-lists/resolve` (+ silent product create when Catalog pill hidden) |
| Banks | `GET/POST /banks`, `POST /banks/batch`, `PUT/DELETE /banks/:id` (`ifscCode`) |
| Staff | `GET/POST /staff`, `POST /staff/batch`, `PUT/DELETE /staff/:id` |
| Global search (⌘K / header) | `GET /search?q=` — same JSON buckets as cloud (`products`, `customers`, `vendors`, `barcodes`, `challans`, `staff`); challans empty offline; **no** verify |

Local ERP (on-device router) also implements payroll and analytics overview:

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/analytics/overview` | Money KPIs, recent activity, `topVendors` (client invoice dues), master counts |
| GET | `/api/payroll` | List `staff_payments` (optional `month`/`year`/`staffName`) |
| GET | `/api/payroll/summary` | Year totals + `byStaff` / `byMonth` + lifetime `advanceOutstanding` |
| GET | `/api/payroll/staff` | Aggregate paid by staff name |
| POST | `/api/payroll` | Record salary/advance/bonus/…; mirrors into `expenses` (non-deduction) |
| DELETE | `/api/payroll/:id` | Delete a payment |

### Client advance payments (Offline)

When a client has **no invoice** or **no outstanding**, Masters / Invoice Finance **Record Payment** may post an **advance** (unallocated cash):

| Method | Path | Body | Behavior |
|--------|------|------|----------|
| POST | `/api/invoice-finance/payments` | `{ partyKey, amount, … }` (no `invoiceId`) | Inserts `invoice_payments` with `invoice_id NULL`, `is_advance=true`, party columns set |
| POST | `/api/invoice-finance/payments` | `{ invoiceId, amount, … }` | Unchanged — must not exceed remaining; rejects fully paid invoices |
| POST | `/api/invoices` | (create) | Auto-applies oldest unallocated advances (FIFO) onto the new bill |
| GET | `/api/invoice-finance/client/:partyKey` | — | Applies advances to open invoices; returns `advanceBalance`, per-invoice `advanceApplied` |

Cash is counted **once** in Analytics `collections` (row exists from record time). Applying only sets/splits `invoice_id` — it does not insert a second cash row. Cloud still requires `invoiceId` (no advance path yet).

## User-owned backups (client)

Staff export/restore encrypted JSON on the phone (`src/platforms/service-mobile/localBackup.ts`). Optional Gmail opens their mail app only — we do not store or email the file ourselves. Schedule: Settings → Auto Backup (daily / weekly / monthly).

## Related

- [Deployment → Service Mobile](/deployment/service-mobile)
- [On-Prem API](/api/mobile-onprem)
- Manual cases: `tests/cases/service-mobile.md`
