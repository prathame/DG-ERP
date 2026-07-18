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
| 5c2 | Invoice Finance | Create unpaid invoice → Finance | Client card shows invoiced / received / due; open → Pay records payment offline; Mark Paid also shows received |
| 5d | Download PDF | Invoices → Download PDF (or Quotes / Price List) | PDF downloads directly (or share/save sheet on device). No system print dialog; no “Pop-up blocked” |
| 5e | No chatbot | Any screen (sidebar / floating help) | No “May I help you?” widget; chatbot not in Offline Mobile |
| 5f | UI density | Masters hub, Invoices, bottom nav | Smaller titles/body than desktop web; compact header + tab bar; forms not oversized |
| 5g | Invoice create mobile | Invoices → New → Party → Items → Review | Stepper on phone; line items as cards (no sideways scroll); stacked Cancel/Draft/Send |
| 5h | Purchase/Quote lines | Purchases / Quotations create modals | Line items as cards on phone; desktop table unchanged |
| 5i | Drawer + toast | More → drawer; trigger a toast | Settings pinned at bottom; toast below status bar / safe area |
| 5j | Bottom nav IA | Glance at phone tab bar | Analytics · Masters · Invoice · Quotes · More (not Inventory/Finance as primary) |
| 5k | Analytics phone | Analytics tab | Quick actions + dense KPI cards + range pills |
| 5k2 | Analytics outstanding | Create unpaid invoice for a client → Analytics | Outstanding Clients lists that client with balance; View All opens Invoice Finance |
| 5k3 | Analytics payroll | Masters → Staff → Record salary payment → Analytics | Staff Payroll shows Total Paid / staff row; Advances if advance type used |
| 5l | Masters hub | Masters tab on phone | Icon pills (**Clients**, Prices, Banks, Staff, …) — **no Products/Catalog inventory pill**; list cards for selected pill; circular + FAB “Add Client” opens manage |
| 5l1 | Client wording | Masters / Invoice create / Quotes / Analytics | UI says **Client(s)** not Vendor(s). API paths remain `/vendors`. Cloud manufacturer still says Vendor |
| 5l1b | Client email optional | Masters → Clients → Add Client with name + phone only (no email); CSV import without email | Saves successfully; email field/CSV column marked optional; duplicate-email check only when email provided |
| 5l2 | Masters no Products | Masters pills / desktop cards | **Products / Catalog inventory** absent Offline. **Price List** kept with **Catalog** + **Clients** tabs (rate book). Cloud manufacturer Masters still show Products → Inventory |
| 5l2b | Price List tabs Offline | Masters → Prices | **Catalog** and **Clients** scope tabs both work; Add Rule can create a new item; rules list/filter correctly |
| 5l2d | Masters Offline CRUD | Masters → Prices / Banks / Staff — list, add, edit/delete, CSV if shown | No Local API 404; Banks IFSC shows/saves (`ifscCode`); Price CSV creates missing items; Staff list maps without crash |
| 5l2f | Staff payment detail | Masters → Staff → tap a staff card (or hub Staff row) | Opens **that staff’s** payment history + summary (salary/paid/advance); **Add payment** records via POST `/payroll` offline; Edit/Delete icons do **not** open payments; Back returns to staff list |
| 5l2g | Client invoice hub | Masters → Clients → tap a client card (or hub Client row) | Opens **that client’s** detail (outstanding / received / invoices); empty state if none; **New Invoice** opens create with client prefilled; **Record Payment** / Pay uses Invoice Finance APIs offline; Edit/Delete icons do **not** open hub; Back returns to Clients list |
| 5l2e | Local API contract | `npm test -- tests/unit/service-mobile-local-api-contract.test.ts` | Banks/Staff/Vendors/Price-lists GET arrays + critical POSTs pass |
| 5l2c | Invoice custom or Price List | Invoice create → Items | Can pick Price List item (rate resolves) **or** Custom item (description + qty + rate). Neither path mandatory alone |
| 5l4 | Masters no ErrorBoundary | Hard refresh → Masters (Chrome localhost OK) | Hub loads Clients/Banks/Staff/Prices — no “Something went wrong”. Stale Products pill/state must not crash |
| 5l3 | Masters no Vendor-Customer Map | Masters pills / desktop cards | **Vendor-Customer Map** absent Offline (no mapping routes). Cloud manufacturer Masters still show Mapping |
| 5m | Invoice hub phone | Invoices list | Outstanding/Collected KPIs; status pills; FAB creates invoice |
| 5n | More shortcuts | More drawer | Shortcut grid includes Stock, Finance, Accounts, Settings |
| 5o | Accounts tab toggle | Settings → Appearance → Show Accounts off/on | Off: Accounts gone from More / sidebar / command palette; On: Accounts returns. Preference survives reload (localStorage) |
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
