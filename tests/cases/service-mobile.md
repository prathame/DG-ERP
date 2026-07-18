# Service Mobile — Manual / E2E Cases

Offline Capacitor phone app for **service** business type. SA keys `DG-SM-…`. Local PGlite is source of truth. **We do not store ERP backups on our servers.**

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Issue license | SA → Tenants → Service Mobile → Issue | Key starts with `DG-SM-`, business type service, max users 1 |
| 2 | Activate first device | Enter key on phone (online) | Activates; device bound; last-seen updates |
| 2b | Activate CORS | Sideload APK → activate with valid `DG-SM-` key while online | Must not show “Cannot reach activation server” (Capacitor `https://localhost` allowed by cloud CORS) |
| 3 | Second device blocked | Activate same key on another phone | Rejected until SA Unbind |
| 4 | Local provision | Set admin password ≥8 chars | Login works offline; only one user |
| 5 | Offline ERP | Airplane mode → create client + invoice | Persists locally; no cloud ERP calls |
| 5b | Local APIs | Purchases, Accounts Generate, Invoice Finance, Staff, Masters | No “not implemented” / “Failed to load”; empty lists OK on fresh install |
| 5c | businessType | After login, Finance tab | Invoice Finance (clients), not Vendor “Distributed Value” |
| 5d | Print / PDF | Invoices → Print / PDF (or Quotes / Price List) | In-app preview opens; system print sheet appears (Save as PDF). No “Pop-up blocked”; Print/PDF is not a no-op |
| 5e | No chatbot | Any screen (sidebar / floating help) | No “May I help you?” widget; chatbot not in Offline Mobile |
| 5f | UI density | Masters hub, Invoices, bottom nav | Smaller titles/body than desktop web; compact header + tab bar; forms not oversized |
| 5g | Invoice create mobile | Invoices → New → Party → Items → Review | Stepper on phone; line items as cards (no sideways scroll); stacked Cancel/Draft/Send |
| 5h | Purchase/Quote lines | Purchases / Quotations create modals | Line items as cards on phone; desktop table unchanged |
| 5i | Drawer + toast | More → drawer; trigger a toast | Settings pinned at bottom; toast below status bar / safe area |
| 5j | Bottom nav IA | Glance at phone tab bar | Analytics · Masters · Invoice · Quotes · More (not Inventory/Finance as primary) |
| 5k | Analytics phone | Analytics tab | Quick actions + dense KPI cards + range pills |
| 5l | Masters pills | Masters → All / Parties / Catalog | Filters list; dense rows open master screens |
| 5m | Invoice hub phone | Invoices list | Outstanding/Collected KPIs; status pills; FAB creates invoice |
| 5n | More shortcuts | More drawer | Shortcut grid includes Stock, Finance, Accounts, Settings |
| 6 | Hard sync settings | SA push tab/settings → phone Sync / wait heartbeat | Settings applied; force sync reloads UI |
| 7 | SA Bell | SA notify on license → phone online | Message appears in in-app Bell |
| 8 | Local backup file | Settings → Save Backup File | JSON file downloads to phone; nothing stored on our cloud |
| 8b | Auto backup schedule | Settings → Auto Backup → daily / weekly / monthly (+ optional Gmail) | When due, saves file on phone; Gmail only opens mail app (staff attach file) |
| 9 | Phone lost restore | SA Unbind → new phone activate → Restore from **their** backup file | Same company data; wrong license key cannot decrypt |
| 10 | Cloud backup API | POST `/api/service-mobile/backup` | 410 Gone |
| 11 | Sideload / TestFlight | Install APK or TestFlight build | App opens; onboarding works |
| 11c | Safe areas / no overlap | Open setup + main app on notched phone | Status bar and bottom nav do not cover title, buttons, or form fields |
| 11b | Public download link | Open `/download` → Offline Mobile Download | Hits evergreen GitHub APK (`…/releases/download/offline-mobile/offline-mobile-service-debug.apk`) unless SA overrode URL |
| 12 | Download page | Open `/download` | **Service Mobile OFFLINE** card present; distinct from Service Cloud ONLINE |

**Automated:** `tests/api/http-service-mobile.test.ts` (license lifecycle; cloud backup disabled) · `tests/api/http-cors-capacitor.test.ts` (Capacitor origins).
