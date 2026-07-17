# Dhandho Mobile App

Capacitor (Android / iOS) client for **cloud tenants**. It is not an on-prem offline desktop — data lives on the cloud API; the phone keeps a light offline queue/cache for flaky networks.

Full platform map: [`src/platforms/README.md`](../src/platforms/README.md)  
Developer notes: [`DEVELOPER.md`](../DEVELOPER.md) § Mobile App

---

## Product overview

| Piece | Role |
|--------|------|
| **Super Admin** | Creates tenant → auto invite `DG-M-XXXX-XXXX` → WhatsApp / QR share |
| **`/download`** | Mobile + desktop installers (APK / Play / App Store / Electron) |
| **App onboarding** | Invite code or company slug → branded login |
| **Heartbeat** | Registers device; receives force-sync + version policy |
| **Offline** | Mutation queue + GET cache (`platforms/mobile/offline`) |

---

## End-to-end flow

```
Super Admin
  POST /api/super-admin/tenants
    → provisionTenant + auto mobile invite
  WhatsApp: /download + invite code + email/password

Customer
  Opens https://…/download → installs Android/iOS app
  First launch → MobileOnboarding
    → POST /api/mobile/redeem-invite  (or GET /api/tenant/by-slug/:slug)
    → navigate to /{slug} → LoginScreen
  Logged in → heartbeat every 60s
    → POST /api/mobile/heartbeat
    → device listed under Tenant → Mobile panel

Super Admin (later)
  Tenant detail → Mobile panel
    → Rotate invite / Force sync / Version policy / Devices
```

---

## Super Admin

### Create tenant
1. **Tenants → Create Tenant**
2. Credentials screen shows **Mobile invite code** (`DG-M-…`)
3. If **business type = service**, also auto-issues one **offline seat** (`DG-MS-…`)
4. **WhatsApp / Email** includes:
   - Download URL: `{origin}/download`
   - Invite code + company slug
   - Offline seat key (service only)
   - Admin email / password

### Tenant detail → Mobile panel
| Action | Effect |
|--------|--------|
| **Issue / Rotate invite** | New `DG-M-…` code + expiry (default 30 days) + QR |
| **WhatsApp** | Pre-filled share text with download + invite |
| **Offline seats (service only)** | Issue `DG-MS-…` seats; suspend / revoke / transfer (clear device) / WhatsApp |
| **Force sync now** | Sets `mobile_force_sync_at`; phones clear offline cache and reload on next heartbeat |
| **Min / Latest version** | Heartbeat returns `forceUpdate` / `updateAvailable` |
| **Devices table** | Platform, app version, user, online if `last_seen` &lt; 20 min |

### Service offline seats (on-prem-style)

Seats live on the **cloud service tenant** (not a separate fleet). Data stays on cloud; the phone gets a stronger offline cache/queue when a seat is bound to its `deviceId`.

| Step | Who |
|------|-----|
| Issue seat | Super Admin (create-tenant auto or Mobile panel) |
| Activate | Phone → `POST /api/mobile/activate-seat` binds device |
| Entitlement | Heartbeat returns `seatValid` + `offlineEnabled` |
| Transfer | SA clears `device_id` → new phone can activate |
| Suspend/revoke | SA → offline writes blocked on device |

Non-service tenants: invite + light cache only (no seats UI).

---

## Customer (phone)

1. Install from `/download` (Play Store / App Store / APK when published).
2. Open app → **Invite code** (preferred) or **Company code** (slug).
3. **Service tenants:** activate **offline seat key** (`DG-MS-…`) when prompted (or skip for online-only).
4. Login with credentials from Super Admin / tenant Admin.
5. **Change company** on login clears saved slug and returns to onboarding.
6. Offline (service + valid seat): cache invoices/quotes/finance; queue invoice create + payments.

---

## Download page (`/download`)

| Section | Content |
|---------|---------|
| **Mobile** | Android APK (from GitHub release if present), Play Store, App Store |
| **On-Prem** | Electron offline `.dmg` assets |
| **Cloud desktop** | Electron online `.dmg` assets |

Store URLs (optional env, Vite):

```bash
VITE_ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=app.dhandho.mobile
VITE_IOS_STORE_URL=https://apps.apple.com/app/idXXXXXXXX
```

Also documented in `.env.example` / `.env.mobile`.

---

## API reference

Public (no JWT):

| Method | Path | Body / notes |
|--------|------|----------------|
| `POST` | `/api/mobile/redeem-invite` | `{ code }` → slug + branding + `requiresSeat` |
| `POST` | `/api/mobile/activate-seat` | `{ seatKey, deviceId, slug?, platform?, appVersion? }` → bind seat (`slug` required by app; rejects wrong company) |
| `POST` | `/api/mobile/heartbeat` | `{ deviceId, platform, appVersion, slug? }` — optional Bearer. Returns `seatValid` / `offlineEnabled` for service. |

Authenticated:

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/mobile/register-device` | After login; upserts `mobile_devices` |

Super Admin (JWT `super_admin`):

| Method | Path | Notes |
|--------|------|--------|
| `POST` | `/api/super-admin/tenants/:id/mobile-invite` | Issue / rotate invite |
| `GET` | `/api/super-admin/tenants/:id/mobile-invite` | Current invite + sync/version |
| `GET/POST` | `/api/super-admin/tenants/:id/mobile-seats` | List / issue seats (service only) |
| `PUT` | `/api/super-admin/tenants/:id/mobile-seats/:seatId` | `{ status, clearDevice, rotateKey, validUntil }` |
| `POST` | `/api/super-admin/tenants/:id/mobile-force-sync` | Push force sync |
| `PUT` | `/api/super-admin/tenants/:id/mobile-version` | `{ minVersion, latestVersion }` |
| `GET` | `/api/super-admin/tenants/:id/mobile-devices` | Device list |

Tenant create response also includes `mobileInviteCode` / `mobileInviteExpiresAt` / `mobileSeatKey` (service).

---

## Database

On `tenants`:

- `mobile_invite_code`, `mobile_invite_expires_at`
- `mobile_force_sync_at`
- `mobile_min_version`, `mobile_latest_version`

Table `mobile_devices`:

- `tenant_id`, `user_id`, `device_id`, `platform`, `app_version`, `last_seen`

Table `mobile_seats` (service tenants only):

- `seat_key` (`DG-MS-…`), `status`, `device_id`, `valid_until`, `activated_at`, `last_seen`
- Invariants: slug match on activate, conditional bind, one active seat per device; heartbeat is source of truth for `offlineEnabled`
- Engineering deep-dive: `engineering-academy/docs/architecture/mobile-service-seats.md`

Schema init: `server/pg-db.ts`.

---

## Client code layout

```
src/platforms/
├── shared/apiBase.ts          # origin / native fetch patch
├── mobile/
│   ├── online/
│   │   ├── bootstrap.ts       # Capacitor + start heartbeat
│   │   ├── MobileOnboarding.tsx
│   │   ├── MobileSeatActivation.tsx
│   │   ├── seatStorage.ts     # DG-MS seat + offline entitlement flag
│   │   ├── companyStorage.ts
│   │   ├── mobileSync.ts      # heartbeat / force-sync / seatValid apply
│   │   └── isMobileClient.ts
│   └── offline/
│       ├── cache.ts, queue.ts, network.ts
│       └── OfflineBanner.tsx
└── desktop/                   # Electron helpers (not Capacitor)
```

SA UI: `src/features/super-admin/MobileTenantPanel.tsx`  
Download UI: `src/components/layout/DownloadPage.tsx`  
Routes: `server/routes/mobile.ts`

---

## Build & run

```bash
# Configure API host for the WebView
# .env.mobile → VITE_MOBILE=1, VITE_API_ORIGIN=https://dg-erp.onrender.com

npm run build:mobile          # Vite → dist-mobile/
npm run cap:sync              # copy into android/ + ios/
npm run cap:android           # open Android Studio
npm run cap:ios               # open Xcode (macOS)
```

App id: `app.dhandho.mobile` (`capacitor.config.ts`).

**Deploy cloud API** after schema/route changes so invite + heartbeat work in production.

---

## Offline behaviour

| Layer | Behaviour |
|-------|-----------|
| GET cache | Products / vendors / tenant (+ service: invoices/quotes/finance/price-lists) in `localStorage` |
| Mutation queue | Service + valid seat: invoice create + payments; flush on reconnect; drop permanent 4xx |
| Entitlement | Heartbeat `offlineEnabled`; local flag is cache only |
| Force sync | Clears cache + reloads so tabConfig / features refresh |
| Banner | Top strip: offline / syncing / back online |

---

## Relation to on-prem

| | Mobile (cloud) | On-prem desktop |
|--|----------------|-----------------|
| Data | Cloud Postgres | Local embedded Postgres |
| Onboard | Invite `DG-M-…` | License `DG-…` |
| Sync | Heartbeat force-sync / versions | Heartbeat settings push |
| SA UI | Tenant → Mobile panel | On-Prem tab |

Do **not** reuse `onprem_licenses` for phones unless you intentionally build a separate offline-local mobile product.
