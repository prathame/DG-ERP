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
npm run cap:sync       # build + sync + Offline applicationId
npx cap open android   # local sideload
```

### CI (GitLab — Android + iOS debug)

Same shape as Android `assembleDebug`:

| Job | Artifact |
|-----|----------|
| `android:offline-mobile` | `dist-apk/offline-mobile-service-debug.apk` |
| `ios:offline-mobile` | `dist-apk/offline-mobile-service-debug.app.zip` |

Label: `mobile` · Manual: `MOBILE_PRODUCT=phone` · Evergreen: GitLab package `dhandho-mobile/latest/`.

```bash
npm run ci:android
npm run ci:ios          # or IOS_BUILD_MODE=ipa …
```

See [Service Mobile deploy docs](../../../engineering-academy/docs/deployment/service-mobile.md).

## Flow

1. SA issues license  
2. Staff activates on phone (needs internet once)  
3. Optional restore encrypted backup (same license only)  
4. Set admin password → local provision  
5. Work offline; hard sync when online (settings, Bell, backup)
