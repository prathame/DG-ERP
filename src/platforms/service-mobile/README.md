# Service Mobile (offline phone)

Capacitor iOS/Android app for **service** business type only.

| Concern | Where |
|---------|--------|
| License / heartbeat / backup | Cloud `/api/service-mobile/*` (`cloud.ts`) |
| ERP data | On-device PGlite (`local/`) |
| SA panel | Super Admin → Tenants → **Service Mobile** |
| Keys | `DG-SM-…` — 1 license = 1 user = 1 device |

## Build

```bash
cp .env.service-mobile.example .env.service-mobile   # set VITE_API_ORIGIN
npm run build:service-mobile
npx cap sync
npx cap open android   # sideload APK
npx cap open ios       # TestFlight
```

## Flow

1. SA issues license  
2. Staff activates on phone (needs internet once)  
3. Optional restore encrypted backup (same license only)  
4. Set admin password → local provision  
5. Work offline; hard sync when online (settings, Bell, backup)
