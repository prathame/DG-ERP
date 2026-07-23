---
sidebar_label: Service Mobile
title: Service Mobile (offline phone)
description: Capacitor iOS/Android offline ERP for service business type — SA licenses, PGlite, local user-owned backups.
---

# Service Mobile

Offline **phone** stack for **`business_type=service` only**. Not desktop on-prem.

Ships inside the **unified Cap shell** (`dist-service-phone`): first launch picks Online or Offline once. Offline mode is this stack (PGlite + `DG-SM-`). Online mode is cloud seats — separate auth/data.

## Shape

| Piece | Detail |
|-------|--------|
| Shell | Capacitor (`android/`, `ios/`), unified build `dist-service-phone` |
| Local data | PGlite (IndexedDB) — source of truth **only when Offline is chosen** |
| Cloud | License activate / heartbeat / hard sync / Bell only — **no ERP backup storage** |
| SA | Tenants → **Service Mobile** |
| Keys | `DG-SM-…` — **1 license = 1 user = 1 device** |
| Disaster recovery | Staff export encrypted backup **file** on the phone; restore that file after unbind |

## Policy: we do not store business data

On the Cap phone app (**Online and Offline**), files are written under a fixed **Documents/Dhandho/** folder (no path picker):

| Subfolder | Contents |
|-----------|----------|
| `Documents/Dhandho/backups/` | Offline: encrypted local backup `.json`. Online: cloud backup download `.json` |
| `Documents/Dhandho/invoices/` | Invoice / quote PDFs |
| `Documents/Dhandho/bug-reports/` | Bug report `.txt` (manual Share + **auto** after Cap unexpected stop / freeze) |

**Unexpected stop (Cap):** While the app is foregrounded, a dirty session flag is set; on pause/background it is cleared (clean shutdown). If the process dies without that clean mark (crash, WhatsApp/WebView freeze kill), the next launch silently writes `dhandho-bug-report-unexpected-*.txt` under `Documents/Dhandho/bug-reports/`. Client breadcrumbs and the log ring are write-through to `localStorage` so WhatsApp/PDF steps survive process death (sessionStorage alone would be empty). OS background kills after a normal pause do **not** create a report.

Both platforms use Capacitor `Directory.Documents` (Android public Documents; iOS app Documents + Files sharing). On Samsung/Android open **My Files → Internal storage → Documents → Dhandho → backups**. Settings → Backup shows **Backup started…** then **Backup done — saved to Documents/Dhandho/backups/…** only after `Filesystem.stat` confirms a non-empty file. Restore shows **Restore started…** plus a determinate **0–100%** progress bar (Offline: stage + per-table apply; Online Cap: stage-mapped around `/api/backup/restore`).

Offline Mobile backups are **user-owned** (phone file + optional mailto to staff Gmail). Cloud backup upload/download APIs for Offline return **410**.

## Build & distribute (v1)

```bash
cp .env.service-phone.example .env.service-phone
# set VITE_API_ORIGIN to your cloud API
npm run cap:sync       # build service-phone + sync + applicationId in.dhandho.service
npx cap open android   # sideload APK
npx cap open ios       # Xcode → simulator / device / TestFlight
```

Evergreen downloads: tag `dhandho-mobile` (`dhandho-mobile-debug.apk` / `.app.zip`). Label `mobile` on merge.

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

Plugins after `cap sync ios`: App, Filesystem, Preferences, Share, Local Notifications, Capgo Printer (`Package.swift` is Capacitor-managed).

### OS notifications (Local Notifications)

Cap shows real system notifications (shade / lock screen / Notification Center) via `@capacitor/local-notifications`:

| Event | When |
|-------|------|
| SA / control-panel Bell messages | Offline heartbeat applies `pendingNotifications` |
| High-priority Bell digests (Online) | After `GET /notifications` poll |
| Scheduled local backup saved | Offline sync after file write |

Permission is requested on Cap boot (`POST_NOTIFICATIONS` on Android 13+). Channel id: `dhandho_alerts`.

**Not included yet — remote push:** There is no `google-services.json` / Firebase project in-repo. FCM (Android) + APNs (iOS) need Firebase config, `@capacitor/push-notifications`, and a server that stores device tokens and sends when the app is killed. Local Notifications cover offline/on-device events only.

### Evergreen builds (public URLs on `/download`)

GitHub Actions (`apk-build.yml`) builds **one unified phone** (Android APK + iOS .app.zip) → evergreen `dhandho-mobile` assets. Labels `mobile` / `offline` / `online` are aliases for that single product. Online vs Offline is chosen inside the app (first-launch latch), not via a second APK.

| Product | Android | iOS (simulator debug) |
|---|---|---|
| Dhandho phone (unified) | `…/dhandho-mobile/dhandho-mobile-debug.apk` | `…/dhandho-mobile/dhandho-mobile-debug.app.zip` |

See [Cloud mobile companion](./cloud-mobile-companion.md).

GitLab still mirrors Offline debug assets under **Deploy → Package registry** (`offline-mobile/latest/…`) when a `macos` runner is available.

## Mobile UI / safe areas

Capacitor uses edge-to-edge WebViews. Prefer Capacitor’s injected CSS vars (`--safe-area-inset-*` via `SystemBars` `insetsHandling: css`) over `env(safe-area-inset-*)`, which is often `0` on Android WebView. Shell CSS maps those to `--safe-top` / `--safe-bottom` (`app-header-safe`, bottom-nav clearance). Native shells also get a minimum inset floor (`dg-capacitor-native`) so time/battery never sit under the header. Rebuild the APK after layout CSS or `capacitor.config.ts` SystemBars changes.

## Mobile UI density

Offline Mobile sets `html.dg-mobile-dense` (see `src/main.tsx`) for compact type, card padding, header, and bottom nav. Desktop/web builds are unchanged.

## Shared phone IA with Service Cloud

Bottom nav (Analytics · Masters · Invoice · Quotes · More), Masters Prices-not-Products pills, and related Emergent hubs are driven by `isServicePhoneUx()` — true here always, and also on online Service Cloud Capacitor when `businessType=service`. In the More / sidebar drawer, **Quotes & Orders** sits under **Finance & Reports** (beside Invoices), not Supply Chain. Quote list/detail show colored status chips; the status filter defaults to **Draft** (All remains available). **Still Offline-only:** Sync Now / hard sync, demo seed, Show Accounts preference, client advances, PGlite, local backup. Online seats use a separate `ServiceCloudGate` (not this build).

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
3. Optional: restore from their backup file → or set admin password (fresh). Restore needs the **same DG-SM key** that created the file (activation can succeed while restore fails if the file was encrypted under a different key, or if the file is corrupt). Cap Offline re-activate on the same unbound/same device is allowed; one active machine binding still applies.  
4. Work offline; when online, heartbeat applies settings/Bell  
5. Settings → Auto Backup (daily / weekly / monthly) saves a file on the phone  
6. Lost phone: SA **Unbind** → new phone activate → **Restore from backup file**

## Related

- [Product Surfaces](/architecture/four-surfaces)
- Manual cases: `tests/cases/service-mobile.md`
