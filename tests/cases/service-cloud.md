# Service Cloud Seats — Manual / E2E Cases

Online-only seats on a **service** cloud tenant. Clients: Cloud Electron + online Capacitor. **One live session company-wide.** Idle auto-release **5 minutes**. No takeover. Separate from offline Service Mobile (`DG-SM-`).

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Access mode unset | Service tenant → seats panel; leave mode unset; try claim from Electron | Claim rejected until SA sets mobile / desktop / both |
| 2 | Set access mode | SA sets **both** | Mode saved; panel reflects selection |
| 3 | Create user + slots | SA Add user with name/email/password, 1 mobile + 1 desktop | User created; unbound slots listed |
| 4 | Bind desktop | Login Cloud Electron as that user | Device claims desktop slot; session acquire succeeds |
| 5 | Second device busy | Second user/device opens app while first holds session | Freeze overlay “In use by …” — UI unresponsive |
| 6 | No takeover | Busy client waits; does not steal | Stays frozen until holder leaves or idle 5m |
| 7 | Holder release | Holder closes app / logout | Second client can acquire within ~15s retry |
| 8 | Idle release | Holder leaves app open but idle >5m (or stop heartbeats) | Session expires; other client can acquire |
| 9 | Offline freeze | Holder online → airplane mode | Overlay “No internet”; UI frozen |
| 10 | Mobile-only mode | SA sets mobile only → open Electron | Claim/acquire blocked |
| 11 | Unbind lost device | SA Unbind on bound slot → new device login | New machine claims free slot |
| 12 | Cannot shrink below bound | Bound 1 desktop; set desktop slots to 0 without unbind | API error; must unbind first |
| 13 | Browser not enrolled | Login in normal browser (no Electron/Capacitor) | No seat gate; claim with web client rejected |
| 14 | Manufacturer tenant | Open manufacturer tenant detail | No Service cloud seats panel |
| 15 | Not Service Mobile | Compare with Service Mobile licenses | No `DG-SM-` key; uses cloud tenant users |
| 16 | Download page split | Open `/download` | **Service Cloud ONLINE** and **Service Mobile OFFLINE** are separate cards; one evergreen URL each (no version list) |
| 17 | Set download URL | SA → Analytics → paste Service Cloud URL → Save → open `/download` | Single Download button uses that URL |
| 18 | Default Offline Mobile APK | Clear `service_mobile_app_url` (or fresh DB) → open `/download` | Offline Mobile Download uses GitHub evergreen APK URL without SA paste |

**Automated:** `tests/api/http-service-cloud.test.ts` · `tests/unit/service-cloud-mode.test.ts`
