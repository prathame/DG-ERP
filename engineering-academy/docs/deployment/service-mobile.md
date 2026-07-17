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
