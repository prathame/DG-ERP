# Cloud Mobile UX — Manual / E2E Cases

Phone usability for the **cloud** tenant app + Super Admin (320–430px). Desktop must stay unchanged. See also `docs/mobile-ui-audit.md`.

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Notch / header | Open tenant app on notched phone | Header clear of status bar; title readable |
| 2 | Bottom nav clearance | Scroll a long list (Invoices / Inventory) | Last rows not hidden under bottom tabs + home indicator |
| 3 | SA drawer | Super Admin on phone → hamburger | Drawer opens; content full width; desktop rail unchanged ≥1024 |
| 4 | Invoice cards | Invoices tab on phone | Cards with actions; tap summary opens detail; actions do not nest as a button-in-button |
| 5 | Invoice desktop table | Invoices ≥640px | Same table layout as before mobile work |
| 6 | Tall modal scroll | Create Invoice / Distribution / Record Payment | Modal fits viewport; body scrolls; keyboard does not trap forever |
| 7 | Chat dismiss | Open chatbot on phone | **X** in header closes; Escape closes; can return to app |
| 8 | Confirm sheet | Trigger delete / Send WhatsApp confirm on phone | Bottom sheet Cancel/Confirm fully above system nav + home indicator (not clipped); safe-area + min bottom padding |
| 9 | Sales barcode row | Sales Entry on 320px | Input + Verify wrap; no horizontal page scroll |
| 10 | Table overflow | Orders create line items / Quotation detail | Horizontal scroll inside table only, not whole page |
| 11 | Touch targets | Tap print/status/delete icons on phone | Targets ≥44px; succeed without zoom |
| 12 | Service Cloud gate | Busy/offline overlay on phone | Sheet fits screen; readable; does not clip home indicator |
| 13 | Invoice stepper | Create Invoice on phone | Party → Items → Review; item cards; no horizontal modal scroll; footer actions stack |
| 14 | Purchase/Quote editors | New Purchase / New Quotation on phone | Line item cards; sticky modal footer; desktop table at ≥640px |
| 15 | Toast safe area | Trigger success/error toast on notched phone | Toast below status bar; does not cover header title |
| 16 | Bottom nav IA | Service Cloud Capacitor (`businessType=service`) phone tab bar | Analytics · Masters · Invoice · Quotes · More (same Emergent IA as Offline Mobile via `isServicePhoneUx`). Manufacturer cloud phone may keep Stock/Finance primaries. Session lock / “In use” unchanged |
| 17 | Shell hubs / Masters pills | Analytics / Masters / Invoices / Quotes on service phone | Dense pills, KPIs, FAB where applicable; Masters pill set = Clients · Prices · Banks · Staff · **Expenses** · … — **no Products / Vendor-Customer Map** (inline filter in `MastersView` via `servicePhoneUx`; no separate unit extract). **Expenses** navigates to the shared Purchases tab. Desktop ≥640px unchanged |
| 18 | More shortcuts | Open More drawer | Stock / Finance / Accounts shortcuts; full nav below. No Sync Now, demo seed, Show Accounts toggle, or advances on cloud (Offline-only) |
| 19 | Header global search | Tap header Search icon; type client/product name | Modal lists pages + entity results; product hits open Price List on service phone UX (`servicePhoneUx` / deprecated `serviceMobile` alias); tap navigates (no verify) |
| 20 | Android system back (Cap) | Detail/modal → Back; list root → Back → Back again within ~2s; switch several tabs then Back | Overlay/detail closes first; root shows “Press back again to exit” then minimize; tab switches do not require many Back presses to leave |

**Automated (related):** `tests/unit/service-phone-ux.test.ts` (`isServicePhoneUx` Offline + Capacitor×businessType) · `tests/unit/global-search-nav.test.ts` (`servicePhoneUx` / `serviceMobile` → Price List) · `tests/unit/useEscapeKey.test.ts` (Escape) · `tests/unit/android-back-button.test.ts` (back stack + double-back window). UI layout / Masters pill ordering is CSS/manual — not under Vitest coverage gates (`server/utils` / `server/services`).
