# Mobile (Capacitor)

Phone / tablet app built with `npm run cap:sync` → `android/` + `ios/`.

**Full documentation:** [`docs/MOBILE.md`](../../../docs/MOBILE.md)

| Folder | Responsibility |
|--------|----------------|
| `online/` | Native bootstrap, **Super Admin invite onboarding**, heartbeat / force-sync |
| `offline/` | Survive flaky networks: cache, mutation queue, banner |

### Onboarding (via Super Admin — same idea as on-prem licenses)

```
Super Admin creates tenant
  → auto mobile invite DG-M-XXXX-XXXX
  → WhatsApp / QR share (+ /download link)
Customer opens app
  → enter invite (or company slug)
  → POST /api/mobile/redeem-invite
  → branded login
Heartbeat every 60s
  → register device, receive force-sync + version policy
SA Tenant detail → Mobile panel
  → rotate invite, Force sync, version min/latest, device list
```

Config: `capacitor.config.ts`, `.env.mobile` (`VITE_MOBILE=1`, `VITE_API_ORIGIN=...`).
Optional store URLs for `/download`: `VITE_ANDROID_STORE_URL`, `VITE_IOS_STORE_URL`.
