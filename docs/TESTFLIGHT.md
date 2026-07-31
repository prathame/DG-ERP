# TestFlight — install Dhandho on a real iPhone (no Mac each time)

Apple does **not** allow APK-style sideload. Closest UX: **TestFlight** — testers install from the TestFlight app once invited.

This repo can build a signed **IPA** in CI and upload it to App Store Connect when secrets are set. Until then, `/download` only has a **simulator** `.app.zip` (not for physical iPhones).

## What you need (once)

1. **Paid Apple Developer Program** (~₹8,000 / year) — [developer.apple.com/programs](https://developer.apple.com/programs/)
2. A **Mac once** (or use GitHub Actions `macos-latest` after secrets are set) to create certs
3. App record in **App Store Connect** with bundle id **`in.dhandho.service`**

## One-time Apple Console setup

### A. App Store Connect

1. [App Store Connect](https://appstoreconnect.apple.com) → **My Apps** → **+** → New App  
2. Bundle ID: `in.dhandho.service` (create in Certificates, Identifiers & Profiles if missing)  
3. Name: e.g. **Dhandho Service**  
4. Note the **Apple Team ID** (Membership details)

### B. Distribution certificate + App Store provisioning profile

1. [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources)  
2. Create **Apple Distribution** certificate → export `.p12` + password  
3. Create **App Store** provisioning profile for `in.dhandho.service` → download `.mobileprovision`

### C. App Store Connect API key (for CI upload)

1. App Store Connect → **Users and Access** → **Integrations** → **App Store Connect API**  
2. Generate key with **App Manager** (or Admin)  
3. Download `.p8` once; note **Key ID** and **Issuer ID**

### D. Encode secrets for GitHub

```bash
# On a Mac / Linux:
base64 -i YourDistCert.p12 | pbcopy          # → IOS_CERTIFICATE_BASE64
base64 -i YourProfile.mobileprovision | pbcopy  # → IOS_PROVISION_PROFILE_BASE64
base64 -i AuthKey_XXXXXX.p8 | pbcopy         # → APPSTORE_API_PRIVATE_KEY_BASE64
```

### E. GitHub repo secrets

**Settings → Secrets and variables → Actions** — add:

| Secret | Value |
|--------|--------|
| `APPLE_TEAM_ID` | 10-char Team ID |
| `IOS_CERTIFICATE_BASE64` | base64 of `.p12` |
| `IOS_CERTIFICATE_PASSWORD` | `.p12` password |
| `IOS_PROVISION_PROFILE_BASE64` | base64 of `.mobileprovision` |
| `APPSTORE_API_KEY_ID` | Key ID |
| `APPSTORE_API_ISSUER_ID` | Issuer UUID |
| `APPSTORE_API_PRIVATE_KEY_BASE64` | base64 of `.p8` |
| `VITE_API_ORIGIN` | Cloud API URL (already used for APK) |

Optional: `IOS_EXPORT_METHOD` default `app-store-connect`.

## Build + upload (CI)

1. Actions → **APK Build** → **Run workflow**  
2. Set **product** = `both` (or any)  
3. Set **ios_ipa** = `true`  
4. Set **push_release** as needed  

Job **Build iOS IPA + TestFlight** will:

- `IOS_BUILD_MODE=ipa` via `scripts/ci-build-ios.sh`  
- Upload IPA with `scripts/ci-upload-testflight.sh`  
- Artifact: `dhandho-mobile.ipa`

Or locally on a Mac with the same env vars:

```bash
IOS_BUILD_MODE=ipa MOBILE_PRODUCT=phone npm run ci:ios
bash scripts/ci-upload-testflight.sh dist-apk/dhandho-mobile-debug.ipa
```

(`ci:ios` currently sets `MOBILE_PRODUCT=offline` which is an alias for the unified phone shell.)

## Invite testers (Android-like for users)

1. App Store Connect → your app → **TestFlight**  
2. Wait for processing (often 5–30 min)  
3. Add **Internal** testers (same org) or **External** (needs Beta App Review once)  
4. Testers: install **TestFlight** from App Store → accept invite → Install **Dhandho**

No Mac needed for testers after that.

## Public `/download` link

Super Admin → Analytics → paste **TestFlight public link** (or invitation URL).  
`/download` shows **Install on iPhone (TestFlight)** when that URL is set.

## Checklist

- [ ] Apple Developer enrolled  
- [ ] App + bundle id `in.dhandho.service`  
- [ ] Distribution cert + App Store profile  
- [ ] ASC API key  
- [ ] GitHub secrets set  
- [ ] Workflow run with `ios_ipa=true` succeeds  
- [ ] Build appears in TestFlight  
- [ ] Testers invited  
- [ ] SA TestFlight URL saved for `/download`
