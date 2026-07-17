---
sidebar_label: Service Mobile
title: Service Mobile (offline phone)
description: Capacitor iOS/Android offline ERP for service business type — SA licenses, PGlite, hard sync, encrypted backup.
---

# Service Mobile

Offline **phone** surface for **`business_type=service` only**. Not desktop on-prem, and not the removed cloud Capacitor invite-queue product.

## Shape

| Piece | Detail |
|-------|--------|
| Shell | Capacitor (`android/`, `ios/`), build `dist-service-mobile` |
| Local data | PGlite (IndexedDB) — source of truth |
| Cloud | License activate / heartbeat / hard sync / encrypted backup only |
| SA | Tenants → **Service Mobile** (separate from On-Prem) |
| Keys | `DG-SM-…` — **1 license = 1 user = 1 device** |
| Disaster recovery | Encrypted backup on sync; restore **same license only** after unbind + re-activate |

## Build & distribute (v1)

```bash
cp .env.service-mobile.example .env.service-mobile
# set VITE_API_ORIGIN to your cloud API
npm run build:service-mobile
npx cap sync
npx cap open android   # sideload APK
npx cap open ios       # TestFlight
```

## Operator flow

1. SA issues Service Mobile license  
2. Staff activates with key (needs internet once)  
3. Optional restore backup → or set admin password (local provision)  
4. Work offline; when online, heartbeat applies settings/Bell and uploads backup  
5. Lost phone: SA **Unbind** → new phone activate → **Restore backup**

## Code map

- Cloud: [`server/routes/service-mobile.ts`](/files/server/routes)  
- Client: [`src/platforms/service-mobile/`](/frontend/platforms)  
- Manual cases: `tests/cases/service-mobile.md`

## Related

- [Product Surfaces](/architecture/four-surfaces)
- [On-Prem API](/api/mobile-onprem) (desktop parallel)
