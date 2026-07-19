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

### CI: Offline Mobile (GitLab — Android + iOS)

Same pattern as the GitHub Offline APK job: **debug** artifacts, label/path triggers, evergreen package.

Config: [`.gitlab-ci.yml`](../../../.gitlab-ci.yml)  
Scripts: `npm run ci:android` / `npm run ci:ios`

| Job | Runner | Debug artifact | App id |
|-----|--------|----------------|--------|
| `android:offline-mobile` | Linux (+ Android SDK setup) | `offline-mobile-service-debug.apk` | `in.dhandho.service` |
| `ios:offline-mobile` | macOS + Xcode (`IOS_RUNNER_TAG`, default `macos`) | `offline-mobile-service-debug.app.zip` | `in.dhandho.service` |
| `publish:evergreen` | Linux | GitLab generic package `offline-mobile/latest/` | — |

**Labels (MR → preview; main path / manual Run pipeline → evergreen):**

| Label | Builds Offline Android + iOS |
|-------|------------------------------|
| `offline` / `offline-mobile` / `service-mobile` | yes |
| `mobile` / `apk` / `apk-build` | yes |

| Trigger | What happens |
|---------|----------------|
| MR with Offline label or Offline paths | Preview job artifacts (no evergreen) |
| Push to default branch touching Offline paths | Build + overwrite evergreen package |
| **Run pipeline** (`MOBILE_PRODUCT=offline`) | Build + evergreen (`PUSH_EVERGREEN=false` skips publish) |

iOS default is Debug simulator (`IOS_BUILD_MODE=debug`, no Apple certs) — parallel to `assembleDebug`. For a device IPA set `IOS_BUILD_MODE=ipa` plus `APPLE_TEAM_ID`, `IOS_CERTIFICATE_BASE64`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISION_PROFILE_BASE64`.

Plugins after `cap sync ios`: App, Filesystem, Preferences, Share, Capgo Printer (`Package.swift` is Capacitor-managed).

### Evergreen builds (public URLs on `/download`)

GitHub Actions (`apk-build.yml`): **2 product runs** (offline / online), each builds **Android APK + iOS .app.zip** → **4 evergreen assets**:

| Product | Android | iOS (simulator debug) |
|---|---|---|
| Offline Mobile | `…/offline-mobile/offline-mobile-service-debug.apk` | `…/offline-mobile/offline-mobile-service-debug.app.zip` |
| Service Cloud Online | `…/service-cloud/service-cloud-online-debug.apk` | `…/service-cloud/service-cloud-online-debug.app.zip` |

Labels: `offline` → Offline APK+iOS; `online` → Online APK+iOS; `mobile` → both products.

GitLab still mirrors Offline debug assets under **Deploy → Package registry** (`offline-mobile/latest/…`) when a `macos` runner is available.

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
