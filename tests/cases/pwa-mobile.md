# PWA & Mobile — Test Cases

Covers Capacitor mobile app (Android/iOS), Super Admin invite onboarding, heartbeat sync, `/download` links, PWA install, bottom navigation, camera, touch targets, and safe areas.

**Engineering doc:** [`docs/MOBILE.md`](../../docs/MOBILE.md)

## Capacitor app & Super Admin onboarding (12)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Create tenant issues mobile invite | Super Admin → Create Tenant → complete form | Credentials screen shows `DG-M-…` invite code |
| 2 | WhatsApp share includes download | On credentials screen, click WhatsApp | Message includes `/download`, invite code, slug, email/password |
| 3 | Issue invite from tenant detail | Tenant → Mobile panel → Issue / Rotate invite | New code + expiry; QR image shown |
| 4 | Redeem invite in app | Install/run mobile app; enter invite on onboarding | Company resolved; navigates to branded login |
| 5 | Company slug fallback | Onboarding → Company code tab; enter valid slug | Same as invite → branded login |
| 6 | Invalid invite | Enter expired/wrong invite | Clear error; stay on onboarding |
| 7 | Change company | On login screen tap Change company | Returns to onboarding; saved slug cleared |
| 8 | Device registers after login | Login on phone; open SA Tenant → Mobile → devices | Device row with platform, version, user, Online |
| 9 | Force sync | SA → Force sync now; wait ≤60s on phone | App reloads / offline cache cleared |
| 10 | Version policy | Set min version above app version; heartbeat | App receives force-update signal |
| 11 | Offline queue | Airplane mode; attempt a write; go online | Banner shows offline; mutation syncs when back |
| 12 | Offline banner | Toggle network while logged in | Banner: Offline → Syncing → Back online |

## Download page (4)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 13 | Mobile section visible | Open `/download` | Mobile block with Android / iOS rows |
| 14 | APK from GitHub | Attach `.apk` to latest release; open `/download` | Direct APK download link appears |
| 15 | Store URLs | Set `VITE_ANDROID_STORE_URL` / `VITE_IOS_STORE_URL`; rebuild | Links open Play / App Store |
| 16 | Desktop sections still work | Open `/download` | On-Prem + Cloud Electron downloads listed |

## PWA / responsive shell (10)

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 17 | Install PWA on Android | Chrome → Add to Home Screen | Icon on home screen |
| 18 | Install PWA on iOS | Safari → Share → Add to Home Screen | Icon on home screen |
| 19 | PWA opens to tenant URL | Launch installed PWA | Opens tenant context / dashboard |
| 20 | Full-screen mode | Launch PWA from home screen | Standalone, no browser chrome |
| 21 | Offline fallback page | Disconnect; open PWA | Offline fallback or app offline banner |
| 22 | Bottom navigation on mobile | Narrow viewport / phone | Bottom nav with primary tabs + More |
| 23 | Camera access | Sales or Verification → camera scan | Permission + camera feed |
| 24 | Touch targets ≥ 44px | Inspect buttons on phone | Min height ~44px |
| 25 | Responsive tables | Inventory / Sales on phone | Horizontal scroll or reformatted |
| 26 | iPhone safe area | Notch / Dynamic Island device | No overlap with status bar / home indicator |
