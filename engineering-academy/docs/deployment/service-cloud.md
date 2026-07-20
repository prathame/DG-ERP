---
sidebar_label: Service Cloud Seats
title: Service Cloud Seats Deployment
description: Online Capacitor + Cloud Electron for service cloud seats.
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

# Unified Cap phone (Online/Offline picker) — preferred
npm run build:service-phone          # → dist-service-phone
# Legacy Online-only Vite mode (deprecated):
npm run build:service-cloud          # → dist-service-cloud (relative base)
npm run cap:sync:cloud               # sync + set applicationId in.dhandho.servicecloud
# Then: cd android && ./gradlew assembleDebug
# Restore Offline android identity: npm run cap:sync
```

Capacitor `sync` alone does **not** change `applicationId` on an existing `android/` project. `scripts/android-set-product.sh` rewrites it after sync so Online (`in.dhandho.servicecloud`) can install beside Offline (`in.dhandho.service`). Do not mix installers.

## SA onboarding (user-wise)

1. Create/open a **service** cloud tenant  
2. Tenant detail → **Service cloud seats**  
3. Set access mode (`mobile` / `desktop` / `both`)  
4. **Add users** — each card has name/email/password, **Mobile** + **Laptop/Desktop** slot counts  
5. Per user: **Share reset link** (copy for WhatsApp), **Notify** (in-app, that user only), Unbind devices  
6. Staff install ONLINE apps from `/download` → login binds the matching slot (Cap vs Electron auto-detected)

Example: 3 users × 1 mobile + 1 laptop each. Still **one live session** for the whole company.

Password reset is **online/cloud only** (shareable link per user). Tenant-wide notify on tenant detail still blasts everyone; seats **Notify** targets one `user_id`.

## Ops notes

- Lost device → SA **Unbind** on that slot  
- Stuck “In use” → wait for 5‑minute idle or holder release (no force-takeover in v1)  
- Guide: Super Admin → Guide → “Onboard Service Cloud Seats”

## Phone UX (service Capacitor)

**First open (no session):** Online Cap and Cloud Electron show **company slug entry** (current host prefix, e.g. `dg-erp.onrender.com/your-company` → Continue → branded login on the **same origin**). They do **not** show the public marketing LandingPage (that stays for browser `/` only). Last-used company is restored from `dg_last_slug`; **Change company** on login returns to slug entry. Online Cap also keeps **Share bug report** on that screen (same helper as login / Settings).

**API origin:** Hosted web uses same-origin `/api` (no hardcoded `dhandho.app`). Cap Offline/Online builds set `VITE_API_ORIGIN` (see `.env.service-phone.example` → Render until `dhandho.app` DNS is live). Runtime remaps a broken `dhandho.app` origin to `https://dg-erp.onrender.com`, and if env is unset on Cap WebView (`https://localhost`) ERP calls also fall back to Render — never relative `/api` on Cap. Slug entry preflights `GET /api/tenant/by-slug/:slug` and reports blocks/failures via `reportActionBlocked` / `reportActionFailed` so Cap bug reports include breadcrumbs. Reserved path slugs: `admin`, `privacy`, `terms`, `download`, `api`, `assets` — `test` is a normal tenant slug.

Online Capacitor + `businessType=service` uses the same Emergent phone IA as Offline Mobile via `isServicePhoneUx()` — bottom tabs Analytics · Masters · Invoice · Quotes · More; Masters shows Prices (not Products); Analytics/bill settings match Offline phone chrome. **Live · Online** badge on Cap only (desktop Electron UI untouched). **Session lock / `ServiceCloudGate` is unchanged.** Sync Now, demo seed, Show Accounts, and client advances stay Offline-only.

Manufacturer cloud phones keep Stock/Finance-style primaries. Browser (non-Capacitor) does not get the service phone IA from type alone.

See [Cloud Mobile UX](/frontend/cloud-mobile). Unit: `tests/unit/service-phone-ux.test.ts`.

## Related

- [API → Service Cloud Seats](/api/service-cloud)
- [Cloud Mobile UX](/frontend/cloud-mobile) — phone layout for the cloud SPA / online Capacitor shell
- Manual cases: `tests/cases/service-cloud.md`, `tests/cases/cloud-mobile.md`
