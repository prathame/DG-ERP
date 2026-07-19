---
sidebar_label: Service Mobile
title: Service Mobile (offline phone)
description: Capacitor iOS/Android offline ERP for service business type — SA licenses, PGlite, local user-owned backups.
---

# Service Mobile

Offline **phone** surface for **`business_type=service` only**. Not desktop on-prem.

## Shape

| Piece | Detail |
|-------|--------|
| Shell | Capacitor (`android/`, `ios/`), build `dist-service-mobile` |
| Local data | PGlite (IndexedDB) — source of truth |
| Cloud | License activate / heartbeat / hard sync / Bell only — **no ERP backup storage** |
| SA | Tenants → **Service Mobile** |
| Keys | `DG-SM-…` — **1 license = 1 user = 1 device** |
| Disaster recovery | Staff export encrypted backup **file** on the phone; restore that file after unbind |

## Policy: we do not store business data

Offline Mobile backups are **user-owned**. The phone saves a file (and may open a mailto to the staff Gmail so they can attach it). Cloud backup upload/download APIs return **410**.

## Build & distribute (v1)

```bash
cp .env.service-mobile.example .env.service-mobile
# set VITE_API_ORIGIN to your cloud API
npm run build:service-mobile
npx cap sync
npx cap open android   # sideload APK
npx cap open ios       # TestFlight
```

### Evergreen Android APK (testing)

Public download uses one stable link (rebuilds overwrite the same GitHub release asset):

`https://github.com/prathame/DG-ERP/releases/download/offline-mobile/offline-mobile-service-debug.apk`

That URL is the code default for `service_mobile_app_url` / `/api/download-links` when Super Admin has not set an override. After `assembleDebug`, upload with:

```bash
gh release upload offline-mobile dist-apk/offline-mobile-service-debug.apk --clobber
```

## Mobile UI / safe areas

Capacitor uses edge-to-edge WebViews. The shell CSS (`app-header-safe`, `--safe-top` / `--safe-bottom`, bottom-nav clearance) must keep the status bar and home indicator from covering headers, CTAs, and forms. Rebuild the APK after layout CSS changes.

## Mobile UI density

Offline Mobile sets `html.dg-mobile-dense` (see `src/main.tsx`) for compact type, card padding, header, and bottom nav. Desktop/web builds are unchanged.

## Local ERP APIs

On-device PGlite implements the same `/api/*` paths the cloud UI uses (vendors, invoices, purchases/suppliers, staff, payroll, accounts P&L, invoice-finance, analytics overview, etc.). Responses are camelCase. Login must include `businessType: service` or Finance falls back to manufacturer Vendor Finance.

Analytics **Outstanding Clients** (`topVendors`) is invoice outstanding per party (invoiced − payments), same party keys as Invoice Finance. **Staff Payroll** uses local `staff_payments` (summary + create/list/delete) so Masters “Record payroll payment” works offline.

Masters on Offline Mobile: **Products / Catalog inventory pill** and **Vendor-Customer Map** are hidden (no stock inventory / mapping). **Price List** stays and is the rate book: service Offline shows two scope tabs — **Catalog** (generic rates) and **Clients** (client-specific rates). Add Rule can create a new sellable item inline. Invoice/Quote lines may pick a Price List item (resolve API) **or** a custom free-text line. UI copy uses **Client(s)** via `cfg.labels.vendors` (API remains `/vendors`). Tapping a Client card opens that client’s invoice hub (same `invoice-finance` APIs as Finance); Staff cards open payment history the same way. Back from a hub Staff-row deep-link returns to the Masters hub Staff tab (not full Staff Management). Client **Record Payment** with no outstanding invoice records an **advance** (unallocated `invoice_payments`); creating/opening an invoice FIFO-applies it so bill outstanding drops without double-counting Analytics collections.

See `docs/api-audit-service-mobile.md`.

## Activation (cloud)

Phone calls `POST /api/service-mobile/activate` on `VITE_API_ORIGIN` (baked into the APK). Capacitor WebView origins (`https://localhost`, `capacitor://localhost`, …) must be on the cloud CORS allowlist — see [Headers & CSP](/security/headers-and-csp). Without that, the app shows “Cannot reach activation server” even when the API is up.

## Operator flow

1. SA issues Service Mobile license  
2. Staff activates with key (needs internet once)  
3. Optional: restore from their backup file → or set admin password (fresh)  
4. Work offline; when online, heartbeat applies settings/Bell  
5. Settings → Auto Backup (daily / weekly / monthly) saves a file on the phone  
6. Lost phone: SA **Unbind** → new phone activate → **Restore from backup file**

## Related

- [Product Surfaces](/architecture/four-surfaces)
- Manual cases: `tests/cases/service-mobile.md`
