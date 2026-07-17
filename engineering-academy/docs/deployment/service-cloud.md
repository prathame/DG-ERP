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

## SA onboarding

1. Create/open a **service** cloud tenant  
2. Tenant detail → **Service cloud seats**  
3. Set access mode → users + mobile/desktop slot counts  
4. Staff install Cloud Electron or online mobile app → login binds device  

## Ops notes

- Lost device → SA **Unbind** on that slot  
- Stuck “In use” → wait for 5‑minute idle or holder release (no force-takeover in v1)  
- Guide: Super Admin → Guide → “Onboard Service Cloud Seats”

## Related

- [API → Service Cloud Seats](/api/service-cloud)
- Manual cases: `tests/cases/service-cloud.md`
