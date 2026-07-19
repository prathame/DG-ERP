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
| Online Capacitor | Native Capacitor (not `VITE_DEPLOYMENT_MODE=service-mobile`) | `X-DG-Client: capacitor-cloud` |
| Browser | Not enrolled | — |

## Public download page

[`/download`](/download) lists **Dhando Service Cloud (ONLINE)** separately from **Dhando Service Mobile (OFFLINE)**. Do not mix installers or licenses.

While testing there are **no versioned GitHub releases** — Super Admin → Analytics sets one evergreen URL per app (`service_cloud_app_url` / `service_mobile_app_url`). Rebuild as often as you want; keep the same link and replace the file behind it. Public API: `GET /api/download-links`.

Default Offline Mobile APK (when unset in `platform_config`):  
`https://github.com/prathame/DG-ERP/releases/download/offline-mobile/offline-mobile-service-debug.apk`

## Builds

```bash
# Desktop wrapper (reuse cloud Electron)
npm run build:electron:cloud:win
npm run build:electron:cloud:mac

# Web assets for online mobile shell
npm run build
# Config stub: capacitor.cloud.config.ts (appId in.dhandho.servicecloud, webDir dist)
# Sync into a dedicated Capacitor android/ios project when packaging the APK/IPA
```

Offline Service Mobile uses a **different** Capacitor config (`capacitor.config.ts` → `dist-service-mobile`). Do not mix builds.

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

Online Capacitor + `businessType=service` uses the same Emergent phone IA as Offline Mobile via `isServicePhoneUx()` — bottom tabs Analytics · Masters · Invoice · Quotes · More; Masters shows Prices (not Products); Analytics/bill settings match Offline phone chrome. **Live · Online** badge on Cap only (desktop Electron UI untouched). **Session lock / `ServiceCloudGate` is unchanged.** Sync Now, demo seed, Show Accounts, and client advances stay Offline-only.

Manufacturer cloud phones keep Stock/Finance-style primaries. Browser (non-Capacitor) does not get the service phone IA from type alone.

See [Cloud Mobile UX](/frontend/cloud-mobile). Unit: `tests/unit/service-phone-ux.test.ts`.

## Related

- [API → Service Cloud Seats](/api/service-cloud)
- [Cloud Mobile UX](/frontend/cloud-mobile) — phone layout for the cloud SPA / online Capacitor shell
- Manual cases: `tests/cases/service-cloud.md`, `tests/cases/cloud-mobile.md`
