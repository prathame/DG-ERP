# Service Cloud Seats — Manual / E2E Cases

Online-only seats on a **service** cloud tenant. Clients: Cloud Electron + online Capacitor. **One live session company-wide.** Idle auto-release **5 minutes**. No takeover. Separate from offline Service Mobile (`DG-SM-`).

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Access mode unset | Service tenant → seats panel; leave mode unset; try claim from Electron | Claim rejected until SA sets mobile / desktop / both |
| 2 | Set access mode | SA sets **both** | Mode saved; panel reflects selection |
| 3 | Create user + slots | SA Add user with name/email/password, 1 mobile + 1 desktop | User created; unbound slots listed |
| 4 | Bind desktop | Login Cloud Electron as that user | Device claims desktop slot; session acquire succeeds |
| 5 | Second device busy | Second user/device opens app while first holds session | Freeze overlay “In use by …” — UI unresponsive. Phone Emergent IA (`isServicePhoneUx`) does **not** bypass or change this gate |
| 6 | No takeover | Busy client waits; does not steal | Stays frozen until holder leaves or idle 5m |
| 7 | Holder release | Holder closes app / logout | Second client can acquire within ~15s retry |
| 8 | Idle release | Holder leaves app open but idle >5m (or stop heartbeats) | Session expires; other client can acquire |
| 9 | Offline freeze | Holder online → airplane mode | Overlay “No internet”; UI frozen |
| 10 | Mobile-only mode | SA sets mobile only → open Electron | Claim/acquire blocked |
| 11 | Unbind lost device | SA Unbind on bound slot → new device login | New machine claims free slot |
| 12 | Cannot shrink below bound | Bound 1 desktop; set desktop slots to 0 without unbind | API error; must unbind first |
| 13 | Browser not enrolled | Login in normal browser (no Electron/Capacitor) | No seat gate; claim with web client rejected |
| 14 | Manufacturer tenant | Open manufacturer tenant detail | Cloud app seats panel shown; multi-user (no company freeze); Cap Online features when mode is mobile/both |
| 15 | Not Service Mobile | Compare with Service Mobile licenses | No `DG-SM-` key; uses cloud tenant users |
| 16 | Download page one phone | Open `/download` | **One phone card** (Android + iOS); copy says Online/Offline chosen at first launch — not two separate Cap installers |
| 17 | Set download URL | SA → Analytics → paste phone evergreen URLs → Save → open `/download` | Buttons use those URLs |
| 18 | Default phone APK | Clear `service_mobile_app_url` / `service_mobile_ios_url` → `/download` | Unified phone uses GitHub evergreen APK + `.app.zip` without SA paste |
| 23 | Manufacturer Cap Online | Cloud manufacturer + Need mobile=yes → Cap Online latch → slug → login | Device claim succeeds; companion nav from `mobile_features`; no company-wide freeze |
| 24 | CI builds unified phone | Label PR `mobile` / `offline` / `online` (aliases), merge — or comment `apk build` | Unified `dhandho-mobile` APK + iOS jobs; former separate Online Cap job retired |
| 25 | Unified APK app id | After `npm run cap:sync`, open `android/app/build.gradle` | `applicationId "in.dhandho.service"` (one APK; Online/Offline latch inside app) |
| 19 | Share reset link | Seats user card → Share reset link → Copy | Modal shows link; user can reset on Cap or Electron |
| 20 | Notify one user | Seats → Notify on user A; login as A and B | Only A sees the in-app message |
| 21 | Live badge (Cap) | Online Cap + service tenant logged in | Sidebar shows Live · Online; no Sync control. Desktop Electron chrome unchanged |
| 22 | Airplane Cap | Cap holder → airplane mode | Freeze “No internet”; app unresponsive |
| 26 | Cap / Electron first open → company slug | Fresh Online Cap or Cloud Electron (no session) | **Not** marketing LandingPage. Enter company URL slug → Continue preflights cloud `by-slug` (API origin = `VITE_API_ORIGIN` or Render fallback on Cap localhost) → branded login at `/{slug}`. Failures (invalid / reserved / not-found / network) call `reportSlugOnboardingFailure` → write-through localStorage client logs + Cap `Dhandho/bug-reports` file (Electron: clipboard / download via **Share bug report**); **Share bug report** includes `Last error` and non-empty **Recent client logs**. Same control on login + Settings Help. Returning users with `dg_last_slug` skip to that company. Change company returns to slug entry. Reserved: `admin`/`privacy`/`terms`/`download` show clear error; `test` is allowed |

**Automated:** `tests/api/http-service-cloud.test.ts` (incl. manufacturer Cap claim) · `tests/api/http-notifications.test.ts` (per-user notify, invalid `userId`, read-all isolation) · `tests/unit/service-cloud-mode.test.ts` (Cap-only Live badge surface) · `tests/unit/service-phone-ux.test.ts` · `tests/unit/bill-settings-flags.test.ts` · `tests/unit/android-set-product.test.ts` (legacy dual-id helper; shipping identity is Offline/`in.dhandho.service`)
