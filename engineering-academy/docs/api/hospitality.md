---
sidebar_label: Hospitality
title: Hospitality API — Hotel / Restaurant
description: Floor tables, waiter orders with modifiers, kitchen KOT, and FIFO entry queue for hotel_restaurant tenants.
---

# Hospitality API — Hotel / Restaurant

**Business type gate:** `tenants.business_type === 'hotel_restaurant'`  
**Router:** `server/routes/hospitality.ts`  
**Seed:** `server/utils/hospitalitySeed.ts` (also called from Super Admin when creating/updating a hotel tenant)  
**Permission module:** `hospitality` (path prefix `/hospitality`)  
**Tests:** `tests/api/http-hospitality.test.ts`

Non-hotel tenants receive **403** from every `/api/hospitality/*` handler via `requireHospitality`.

## Tables (`hosp_*`)

| Table | Role |
|---|---|
| `hosp_dining_tables` | Floor tiles (`available` / `occupied` / `billing` / `cleaning`) |
| `hosp_menu_categories` / `hosp_menu_items` | Menu |
| `hosp_modifier_groups` / `hosp_modifiers` / `hosp_item_modifier_groups` | Toppings / spice / cheese links |
| `hosp_orders` / `hosp_order_items` / `hosp_order_item_modifiers` | Open → billed → closed orders; KOT status on items |
| `hosp_queue_entries` | FIFO entry tokens (`waiting` → `called` → `seated` / `no_show` / `left`) |

Partial unique index: **one open order per table** (`idx_hosp_one_open_order`).

## Endpoints (summary)

| Method | Path | Notes |
|---|---|---|
| POST | `/api/hospitality/seed` | Idempotent demo floor + menu |
| GET | `/api/hospitality/tables` | Tables + open order summary |
| PATCH | `/api/hospitality/tables/:id/status` | Manual status |
| POST | `/api/hospitality/tables/:id/open` | Open or resume order; occupies table |
| GET | `/api/hospitality/menu` | Categories, items, nested modifier groups |
| GET/POST | `/api/hospitality/orders/:id` / `.../items` | Detail / add line (+ modifiers) |
| PATCH | `/api/hospitality/order-items/:id/status` | `queued` → `preparing` → `ready` → `served` |
| POST | `/api/hospitality/orders/:id/bill` | Order billed; table `billing` |
| POST | `/api/hospitality/orders/:id/close` | Payment done; table `cleaning` |
| POST | `/api/hospitality/tables/:id/clear` | Mark `available` (does **not** auto-close an open order — callers should close first) |
| GET | `/api/hospitality/kitchen` | Open KOT tickets, oldest first |
| GET/POST | `/api/hospitality/queue` | List / issue token |
| POST | `/api/hospitality/queue/call-next` | Oldest waiting → `called` |
| POST | `/api/hospitality/queue/:id/call` \| `seat` \| `no-show` \| `leave` | Host actions |

Auth: Bearer JWT + `x-tenant-id` (same as other tenant APIs). Vendors are blocked (`blockVendors`).

## UI

`src/features/hospitality/*` — Floor, Waiter Orders (same floor + order drawer), Kitchen, Entry Queue. Shell styling follows desktop glass / Cap mobile glass / classic brand via `hospUi.ts` (same fork as Inventory/Finance).

Realtime: **polling** (~3–4s), not Socket.IO (standalone prototype had sockets; DG-ERP does not).

## Related

- [Product Domain — Hotel / Restaurant](/overview/product-domain#7-hotel--restaurant)
- [Features Catalog — Hospitality](/frontend/features-catalog#hospitality)
- [Business Workflows — Hospitality](/architecture/business-workflows#workflow-7-hospitality-floor--kot--queue)
- Manual product checklist: PR #172 / SA create **Hotel / Restaurant**
