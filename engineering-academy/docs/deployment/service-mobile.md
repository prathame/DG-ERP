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
npm run cap:sync       # build + sync + applicationId in.dhandho.service
npx cap open android   # sideload APK
npx cap open ios       # Xcode → simulator / device / TestFlight
```

Prefer `npm run cap:sync` over bare `npx cap sync` — after an Online cloud sync, `scripts/android-set-product.sh offline` restores the Offline `applicationId` (Capacitor does not rewrite it itself).

### iOS (Mac + Xcode)

Requires **full Xcode** from the Mac App Store (Command Line Tools alone are not enough). Bundle id: `in.dhandho.service`.

```bash
# 1. Install Xcode, then once:
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
xcodebuild -runFirstLaunch

# 2. Env + sync (refreshes web assets + SPM plugins)
cp .env.service-mobile.example .env.service-mobile   # if needed
# set VITE_API_ORIGIN
npm run cap:ios    # build:service-mobile + cap sync + open Xcode
# or: npm run cap:run:ios   # build, sync, run on simulator
```

In Xcode:

1. Open target **App** → **Signing & Capabilities** → choose your **Team** (Automatic signing; no `DEVELOPMENT_TEAM` is checked into the repo).
2. Run on a simulator or a physical device (device needs a free/paid Apple ID team).
3. For TestFlight: **Product → Archive** → upload to App Store Connect (create the app record for `in.dhandho.service` first).

Plugins after `cap sync ios`: App, Filesystem, Preferences, Share, Capgo Printer (see `ios/App/CapApp-SPM/Package.swift` — Capacitor-managed). There is **no iOS CI** yet; IPA/TestFlight is manual on a Mac.

### Evergreen Android APK (testing)

Public download uses one stable link (rebuilds overwrite the same GitHub release asset):

`https://github.com/prathame/DG-ERP/releases/download/offline-mobile/offline-mobile-service-debug.apk`

That URL is the code default for `service_mobile_app_url` / `/api/download-links` when Super Admin has not set an override. After `assembleDebug`, upload with:

```bash
gh release upload offline-mobile dist-apk/offline-mobile-service-debug.apk --clobber
```

### CI: Offline Mobile + Service Cloud Online APKs

Workflow: [`.github/workflows/apk-build.yml`](../../../.github/workflows/apk-build.yml)

Builds each product **only when selected** (do not mix installers):

| Job | Evergreen release | App id |
|-----|-------------------|--------|
| Offline Mobile | `offline-mobile` / `offline-mobile-service-debug.apk` | `in.dhandho.service` |
| Service Cloud ONLINE | `service-cloud` / `service-cloud-online-debug.apk` | `in.dhandho.servicecloud` |

**Labels (merge → evergreen; add label on open PR → preview):**

| Label | Builds |
|-------|--------|
| `offline` / `offline-mobile` / `service-mobile` | Offline only |
| `online` / `service-cloud` | Online only |
| `mobile` / `apk` / `apk-build` | Both (legacy) |

| Trigger | What happens |
|---------|----------------|
| **Merge PR with a product label** (recommended) | Build matching APK(s) → overwrite matching evergreen release(s) |
| Push to `main` touching product paths | Builds only Offline and/or Online based on which paths changed (shared UI → both) |
| PR comment `apk build` / `apk build offline` / `apk build online` | Preview artifact(s) only — does **not** overwrite evergreen |
| Actions → APK Build (manual) | Choose product: both / offline / online |

Docs-only / server-desktop PRs without a product label do **not** rebuild APKs (unless the push path filter matches).

## Mobile UI / safe areas

Capacitor uses edge-to-edge WebViews. Prefer Capacitor’s injected CSS vars (`--safe-area-inset-*` via `SystemBars` `insetsHandling: css`) over `env(safe-area-inset-*)`, which is often `0` on Android WebView. Shell CSS maps those to `--safe-top` / `--safe-bottom` (`app-header-safe`, bottom-nav clearance). Native shells also get a minimum inset floor (`dg-capacitor-native`) so time/battery never sit under the header. Rebuild the APK after layout CSS or `capacitor.config.ts` SystemBars changes.

## Mobile UI density

Offline Mobile sets `html.dg-mobile-dense` (see `src/main.tsx`) for compact type, card padding, header, and bottom nav. Desktop/web builds are unchanged.

## Shared phone IA with Service Cloud

Bottom nav (Analytics · Masters · Invoice · Quotes · More), Masters Prices-not-Products pills, and related Emergent hubs are driven by `isServicePhoneUx()` — true here always, and also on online Service Cloud Capacitor when `businessType=service`. **Still Offline-only:** Sync Now / hard sync, demo seed, Show Accounts preference, client advances, PGlite, local backup. Online seats use a separate `ServiceCloudGate` (not this build).

See [Cloud Mobile UX](/frontend/cloud-mobile) and [Service Cloud Seats](/deployment/service-cloud).

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
