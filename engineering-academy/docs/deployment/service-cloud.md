---
sidebar_label: Service Cloud Seats
title: Service Cloud Seats Deployment
description: Online Capacitor + Cloud Electron seats for any cloud business type.
---

# Service Cloud Seats Deployment

## Surfaces

| Client | How it enrolls | Header |
|--------|----------------|--------|
| Cloud Electron | `deploymentMode: 'cloud'` or `?desktop=1` | `X-DG-Client: electron-cloud` |
| Online Capacitor | Unified Cap shell with one-time **Online** latch | `X-DG-Client: capacitor-cloud` |
| Browser | Not enrolled | — |

## Public download page

[`/download`](/download) lists **one phone app** (Android + iOS). At first launch the user picks Online (this stack) or Offline (PGlite / `DG-SM-`). Modes do not share login or ERP data.

While testing there are **no versioned GitHub releases** — Super Admin → Analytics can override evergreen URLs (`service_mobile_app_url` / `service_mobile_ios_url`). Public API: `GET /api/download-links`.

Default assets (when unset in `platform_config`):

| Asset | Evergreen URL |
|---------|----------------|
| Android | `https://github.com/prathame/DG-ERP/releases/download/dhandho-mobile/dhandho-mobile-debug.apk` |
| iOS | `https://github.com/prathame/DG-ERP/releases/download/dhandho-mobile/dhandho-mobile-debug.app.zip` |

CI (`.github/workflows/apk-build.yml`) builds the unified phone (Android + iOS) when labeled `mobile` / `offline` / `online` (aliases). Former separate Online Cap app id is retired.

## Builds

```bash
# Desktop wrapper (reuse cloud Electron)
npm run build:electron:desktop:win
npm run build:electron:desktop:mac
# At first launch choose Online

# Unified Cap phone (Online/Offline picker) — one APK
npm run build:service-phone          # → dist-service-phone
npm run cap:sync                     # applicationId in.dhandho.service
# Then: cd android && ./gradlew assembleDebug
```

**One phone APK** (`in.dhandho.service`). Online vs Offline is a first-launch latch, not a second installer. Legacy `cap:sync:cloud` / `in.dhandho.servicecloud` paths are deprecated — see [Cloud mobile companion](./cloud-mobile-companion.md).

## SA onboarding (user-wise)

1. Super Admin → **Cloud** → create/open any cloud company (service, manufacturer, silver, …)  
2. Set **Need mobile app?** → `client_access_mode` `both` or `desktop`; for non-service companions set **mobile features**  
3. Tenant detail → **Cloud app seats**  
4. **Add users** — each card has name/email/password, **Mobile** + **Laptop/Desktop** slot counts  
5. Per user: **Share reset link** (copy for WhatsApp), **Notify** (in-app, that user only), Unbind devices  
6. Staff install the **one** phone app from `/download` → pick **Online** → company slug → login binds the Cap slot (Electron Online binds desktop)

Example (service): 3 users × 1 mobile + 1 laptop each → **one live session** company-wide (Netflix freeze).  
Example (manufacturer): multi-user Cap/Electron; **no** company-wide freeze — device slots + DB locks on money writes.

Password reset is **online/cloud only** (shareable link per user). Tenant-wide notify on tenant detail still blasts everyone; seats **Notify** targets one `user_id`.

## Ops notes

- Lost device → SA **Unbind** on that slot  
- Stuck “In use” → wait for 5‑minute idle or holder release (no force-takeover in v1)  
- Guide: Super Admin → Guide → “Onboard Service Cloud Seats”

## Phone UX (Cap Online)

**First open (no session):** Online Cap and Cloud Electron show **company slug entry** (current host prefix, e.g. `dhandho-2kdx.onrender.com/your-company` → Continue → branded login on the **same origin**). They do **not** show the public marketing LandingPage (that stays for browser `/` only). Last-used company is restored from `dg_last_slug`; **Change company** on login returns to slug entry. Cap and Cloud Electron keep **Share bug report** on that screen (same helper as login / Settings — Cap saves under `Dhandho/bug-reports`; Electron uses clipboard / download).

**API origin:** Hosted web uses same-origin `/api` (no hardcoded `dhandho.app`). Cap Offline/Online builds set `VITE_API_ORIGIN` (see `.env.service-phone.example` → live `https://dhandho-2kdx.onrender.com`). Shared resolver: `src/platforms/shared/apiBase.ts` (`CLOUD_ORIGIN_FALLBACK`). Runtime remaps broken `dhandho.app` and legacy `dg-erp.onrender.com` / `dhandho.onrender.com` to that host; Cap WebView with unset env also falls back there — never relative `/api` on Cap. Electron Cloud uses `DG_CLOUD_URL` or the same default (`electron/shared/constants.ts`). Slug entry UI shows the public app host (`dhandho-2kdx.onrender.com/` on Cap today; `dhandho.app/` only when that is the live page host), preflights `GET /api/tenant/by-slug/:slug`, and reports blocks/failures via `reportActionBlocked` / `reportActionFailed` so Cap bug reports include breadcrumbs. Reserved path slugs: `admin`, `privacy`, `terms`, `download`, `api`, `assets` — `test` is a normal tenant slug.

**Ops note:** Cap/Electron default to `https://dhandho-2kdx.onrender.com`. Set Render `PUBLIC_APP_URL` / `ALLOWED_ORIGINS` to that URL — see [Render](./render.md).

- Online Cap + `businessType=service` → Emergent IA via `isServicePhoneUx()` (Analytics · Masters · Invoice · Quotes · More; Masters Prices-not-Products).
- `ServiceCloudGate` wraps **all** cloud Cap + Cloud Electron clients (not browser). Service = company-wide Netflix session lock; non-service = device claim only (multi-user, no company freeze).
- Non-service Cap Online uses the companion shell filtered by SA `mobile_features` (stock / sales / quotations / collections / reports / chatbot).
- Browser is **not** enrolled in device seats.

**Live · Online** badge on Cap only (desktop Electron UI untouched). Sync Now, demo seed, Show Accounts, and client advances stay Offline-only.

See [Cloud Mobile UX](/frontend/cloud-mobile). Unit: `tests/unit/service-phone-ux.test.ts`.

## Related

- [API → Service Cloud Seats](/api/service-cloud)
- [Cloud Mobile UX](/frontend/cloud-mobile) — phone layout for the cloud SPA / online Capacitor shell
- Manual cases: `tests/cases/service-cloud.md`, `tests/cases/cloud-mobile.md`
