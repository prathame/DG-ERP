# LOCALIZATION_AUDIT.md

**Date:** 2026-09-01  
**Scope:** Current DG-ERP code + running UI. **No application code was changed.**  
**Live UI:** production tenant login `https://dhandho-2kdx.onrender.com/agro`; local marketing `http://localhost:3000/`.  
**Not used:** Reticle (daemon has never seen a session for this app). Browser IDE tools were used instead.

Logged-in ERP modules (invoices, inventory, GST reports, etc.) were **not driven in Gujarati in this session**: production agro login showed `Invalid email or password`; local `/` is the marketing landing, not a tenant workspace. Those modules are scored from **code** (whether they call `t()` / hardcoded English) and marked **NOT TESTED** in the live column of the matrix where no tenant session was available.

---

## 1. Current language architecture

Hand-rolled React Context. No i18n library.

| Piece | Location | Behavior |
|-------|----------|----------|
| Dictionaries | `src/i18n/{en,hi,gu,mr}.json` | Nested JSON, 531 leaf keys each |
| Lookup | `src/i18n/lookup.ts` `lookup()` | Dot-path walk; **missing key → display the key string** |
| Provider | `src/i18n/index.tsx` `LanguageProvider` | Wraps the app in `src/main.tsx` |
| Hook | `useTranslation()` → `{ lang, setLang, t }` | Default context `t` returns the key |
| English | Static `import en from './en.json'` | Always in the main bundle |
| hi / gu / mr | Dynamic `import()` | Cached after first switch; load failure → English |
| Persistence | `localStorage['dhandho_lang']` | Device-scoped, **not** user, **not** tenant |
| Default / fallback | `'en'` | `getStoredLang()` only accepts `hi`/`gu`/`mr`; else English |
| Detection | **None** | No `Accept-Language`, no tenant default, no `document.documentElement.lang` update |
| `html` | `index.html` `lang="en"` | Never updated when language changes |
| Feature flag | Tenant column `multi_language_enabled` | Returned on login as `multiLanguageEnabled`; Super Admin can toggle. **Settings language picker is not gated** — it always renders |
| Business labels | `src/i18n/businessLabels.ts` `tb()` | Maps English config labels → `business.*` keys at render |
| Landing page | `LandingPage.tsx` `L(en,hi,gu,mr)` | **Second system.** Local React state. Auto-cycles hero every 7s. Does **not** write `dhandho_lang` (observed: clicking EN on landing left `dhandho_lang=gu`) |
| Dates | `formatDate` in `src/lib/utils.ts` | Always `en-IN`, `Asia/Kolkata`, `dd MMM yyyy` (e.g. `01 Sep 2026`) — **not** tied to UI language |
| Currency | `formatINR` / `toLocaleString('en-IN')` | Always ₹ + Indian grouping. Independent of UI language (correct for Indian books) |
| PDF | `src/lib/standaloneInvoicePdf.ts` | jsPDF **Helvetica**; amounts as `Rs.` because Helvetica has no ₹ |
| Print HTML | `src/lib/billTemplates.ts` | `Arial, Helvetica`; **English labels hardcoded** |
| RTL | Not implemented | Not required (see §11) |

Unit contract: `tests/unit/i18n-lookup.test.ts` (key parity + `dhandho_lang`).  
Product test cases: `tests/cases/multi-language.md` (documents **partial coverage by design** for deep forms).

---

## 2. Supported languages

**Four:** English, Hindi, Gujarati, Marathi.

Default: English. Fallback on failed locale load: English.

No Arabic, Urdu, Tamil, etc. in code.

---

## 3. Translation coverage

See `docs/LANGUAGE_COVERAGE.md` for full tables.

Short version:

- Dictionary **shape** is complete (531/531 all locales).
- **161** dictionary keys are never called.
- **33 / 163** TSX files use `useTranslation`.
- **302** product `toast('…')` strings are English literals.
- Gujarati has **27** values still equal to English (mostly Miracle import coverage).
- Login does not use `auth.*` at all.

---

## 4. Missing keys

- English-but-not-Gujarati **file keys:** none.
- Gujarati-but-not-English **file keys:** none.
- **Semantic missing:** large. Entire screens never look up keys (login, sales, distribution, hospitality, GST toolbar, books tables, most toasts).
- Literal key display (`invoice.create`): not observed; static `t()` keys all exist.

---

## 5. Hardcoded UI text (product, not comments/logs)

Confirmed in code and/or live UI:

**Auth (live on `/agro`):** Login, Email, Password, Forgot Password?, Have a reset token?, Invalid email or password, Back to login, Send Reset Request, Reset token, New password, Confirm password, Reset Password, Powered by Dhandho, Please wait..., Cannot reach server / Company Not Found.

**API-facing (always English):** Session expired / signed in on another device (`src/api.ts`); 403 `Access denied`; rate limits `Too many login attempts…` (`server/app.ts`); Service Cloud overlays Connecting… / In use / No internet / Access blocked / Contact your Super Admin… (`ServiceCloudGate.tsx`); ErrorBoundary “Something went wrong”.

**Modules with little or no `t()`:** Sales, Distribution, Hospitality, Warranty, Replacements, Rewards, Orders, Job-work, Dashboard (legacy), Super Admin, GST e-invoice toolbar, barcode label printer chrome, most Books/Accounts table chrome.

Do **not** translate: developer logs, correlation ids, HSN/GSTIN/IRN/EWB numbers, barcode values, SQL, internal error codes.

---

## 6. Mixed-language screens

### Intentional (product/government terms)

GST, UPI, IFSC, HSN, IRN, E-Way, WhatsApp, Miracle, CSV, PDF, PIN, NIC. Keeping these in Latin is normal for Indian business software.

### Accidental / marketing Gujlish (live on landing, Gujarati selected)

Nav: `વ્યાપાર` + **Features** + `કિંમત` + `સંપર્ક`.  
Hero: `ધંધો ચલાવો, software નહિ।`  
CTA: **Try Free**, **Features જુઓ**.  
FAQ, contact form, Privacy, Terms: **still English**.  
After clicking EN, **nav became English while hero stayed Gujarati** (hero cycle vs nav `lang` are two states).

### Dictionary Gujlish

`Collections ખોલો`, Miracle import body mixing English module names, GST API guide steps that are English UI labels glued with Gujarati.

### Hindi + Gujarati on one ERP screen

Not observed in dictionaries as a combined string. Landing can show Hindi hero while user clicked Gujarati (or vice versa) because of the 7s auto-cycle.

### Translation key + translated text

Not observed live. Unlikely with current static keys.

---

## 7. Gujarati quality (natural business Gujarati)

Evaluated **dictionary strings**, not invented “correct” copy. Recommendations are **for human review** (preferably a Gujarati-speaking accountant). Do not mass-replace.

| English term | Current Gujarati | Assessment | Recommended (review, not applied) |
|--------------|------------------|------------|-----------------------------------|
| Customer | ગ્રાહક | Natural | Keep |
| Vendor | વિક્રેતા | **Ambiguous.** વિક્રેતા = seller. If the party is a **supplier**, this is the wrong direction. If the party is a **dealer** taking dispatch, dealer/વેપારી may be meant | Confirm domain: supplier → પુરવઠાકાર / સપ્લાયર; dealer → ડીલર / વેપારી |
| Invoice | ઇન્વૉઇસ / ઇન્વોઇસ (**two spellings**) | Transliteration; Hindi uses चालान in several keys | Align spelling; consider બિલ / ટેક્સ બિલ in retail, keep ટેક્સ ઇન્વૉઇસ where GST wording is required |
| Purchase | ખરીદી | Natural | Keep |
| Sales | વેચાણ | Natural | Keep |
| Payment | ચૂકવણી | Natural | Keep |
| Outstanding | બાકી | Natural | Keep |
| Expense | ખર્ચ | Natural | Keep |
| Profit / Loss | *(no keys)* | Accounts screens are English | Do not auto-translate P&amp;L without an accountant |
| Stock | સ્ટોક | Common shop loanword | Acceptable |
| Inventory | ઇન્વેન્ટરી | Awkward vs સ્ટોક | સ્ટોક / માલની યાદી |
| Ledger | લેજર | CA-office loanword | Acceptable, or ખાતાવહી |
| Voucher | વાઉચર | Common | Keep |
| Debit | English in import rows | Untranslated | ડેબિટ નોટ (Hindi already does this) |
| Credit | ક્રેડિટ | Loanword | ઉધાર if targeting shop floor |
| GST | GST | Intentional | Keep |
| Tax | ટેક્સ | Mixed | કર where running text |
| Discount | છૂટ | Natural | Keep |
| Total | કુલ | Natural | Keep |
| Balance | બેલેન્સ vs બાકી રકમ | **Inconsistent** (`rewards.balance` vs `finance.balance`) | Pick one: બાકી રકમ for money |
| Receipt | English in import coverage | Untranslated | પાવતી / રસીદ |
| Return | English in import coverage | Untranslated | વેચાણ પરત / ખરીદી પરત |
| Report | રિપોર્ટ્સ | Loanword | અહેવાલ (Marathi already uses अहवाल) |
| Save | સેવ કરો | Mixed/awkward | સાચવો |
| Collections | કલેક્શન્સ | Loanword | વસૂલાત |
| Analytics | એનાલિટિક્સ | Loanword | વિશ્લેષણ |
| Masters | માસ્ટર્સ | Software jargon | માસ્ટર નોંધ / મૂળ નોંધ |
| Books | બુક્સ | | ચોપડા / હિસાબી ચોપડી |
| Accounts | હિસાબ | Natural | Keep |

Hindi is generally closer to natural business register for invoices (चालान) than Gujarati transliteration. Marathi mixes इन्व्हॉइस and चलन for the same concept (`dashboard.invoice` vs `sales.invoice`).

---

## 8. English issues

- Marketing copy claims **“4 Languages”** and **“entire UI changes”**. Product behavior is **nav/chrome + settings**, not entire UI. Stats bar also flashed **“2 Languages”** / **“0 Languages”** during counter animation vs “4”.
- `auth.*` keys exist and are unused — duplicate source of truth vs LoginScreen literals.
- Invoice vs चालान vs इनवॉइस inconsistency across Hindi keys.
- Super Admin is English-only (acceptable if operators are English; still a gap for Gujarati SA users).

---

## 9. Other language issues (Hindi / Marathi)

- Marathi landing strings often omitted (`mr ?? hi`) → Hindi shown to Marathi users on marketing.
- Hindi import purchase-return rows still English (4 keys).
- Same UI-wiring gap as Gujarati: login, toasts, GST, hospitality, sales.

---

## 10. Dynamic content

No code path was found that translates **user-entered** customer/product/company names. Names are rendered as stored. **This is correct.** Do not add auto-translation of business data.

Status / payment method / invoice status in many screens are **English literals** (`Paid`, `Draft`, `Sent`) even when `common.paid` etc. exist. Switching UI language will **not** change those until they call `t()`.

Search of Gujarati names: **NOT TESTED** live. Postgres text search/ILIKE would typically match stored Unicode; the product does not claim Gujarati search as a feature.

---

## 11. Numbers / currency

Always Indian locale formatting (`en-IN`), ₹ in HTML, `Rs.` in jsPDF. Independent of `dhandho_lang`. Accounting precision is not locale-switched. **No change recommended** for books.

Negative amounts / GST %: formatting helpers exist; **NOT TESTED** live in Gujarati UI.

---

## 12. Date / time

`formatDate` / invoice PDF `fmtDate`: `en-IN`, IST, `dd MMM yyyy` (month **name**, not `DD/MM/YYYY`). Storage format unchanged. UI language does not change date format.

---

## 13. RTL / LTR

Supported languages are all LTR (Latin, Devanagari, Gujarati).

**RTL NOT REQUIRED CURRENTLY.**

Do not add RTL layout complexity.

---

## 14. PDF / print

| Surface | Language of chrome | Gujarati glyphs |
|---------|--------------------|-----------------|
| jsPDF Cap bills (`standaloneInvoicePdf.ts`) | English labels; `Rs.` | **FAIL** — Helvetica has no Gujarati (and no ₹) |
| HTML print (`billTemplates.ts`) | English (TAX INVOICE, Bank Details, ORIGINAL FOR RECIPIENT, …) | **PARTIAL** — OS font fallback may draw Gujarati **in user-entered names** if the printer/browser has a Gujarati font; labels stay English |
| Reports | English in Accounts/Books panels | Same |
| Barcode HTML | English chrome; names as entered | **PARTIAL** — `Segoe UI`, Arial |

Gujarati **invoice chrome** is not localized. Embedding a Gujarati-capable font in jsPDF is a **functional** gap, not cosmetic, if a tenant prints Gujarati company/product names to Cap PDF.

---

## 15. Barcode / labels

`BarcodeLabelPrinter` + `barcodeLabelRender.ts`: UI strings English (`Print Barcode Labels`, `Show Price on Label`, `HUID`). Product name and company name printed as stored. Barcode **values** not translated (correct). Gujarati sizing/overflow **NOT TESTED** live. Native label printer **NOT TESTED**.

---

## 16. Validation / errors

Client toasts: overwhelmingly English literals (302).  
Server errors: English (`Too many login attempts…`, `Access denied`).  
HTML5 `required` on login uses browser locale, **not** `dhandho_lang`.  
Live: `Invalid email or password` on agro was English.

---

## 17. Authentication (live)

| Screen | Result |
|--------|--------|
| Login `/agro` | **FAIL** Gujarati — all English |
| Forgot password | **FAIL** Gujarati — all English |
| Reset password | **FAIL** Gujarati — all English |
| Logout | Code: `t('common.logout')` exists in shell — **NOT TESTED** live |
| Session expiry | Hardcoded English in `api.ts` |
| 403 / 404 / 429 / 500 | Hardcoded English |

No language control on the login page.

---

## 18. Language persistence

| Question | Observed |
|----------|----------|
| Where stored? | Browser `localStorage` key `dhandho_lang` |
| User-specific? | **No** |
| Tenant-specific? | **No** (same device, two companies → same language) |
| Role-specific? | **No** |
| Survives refresh? | Yes, for ERP `LanguageProvider` |
| Survives logout/login? | Yes (storage is not cleared on logout for this key — by code) |
| Marketing landing? | **Separate** React state; clicking EN on landing **did not** clear `dhandho_lang=gu` |
| `multi_language_enabled` | Stored on tenant; **does not hide** Settings language buttons |

Intentional model (also documented in engineering-academy): **device preference**. Whether that is the *desired* product model is not assumed; it is the current behavior.

---

## 19. Role / tenant

Not live-tested across Tenant A/B or Owner/Admin/Accountant/Staff.

From code: language is **browser-device**. Two roles on one computer share it. Two tenants in one browser share it. Super Admin English-only UI.

---

## 20. Search / filters

Gujarati input in search: **NOT TESTED**. No dedicated Gujarati tokenizer. Document as “whatever the DB stores, Unicode match likely; not a claimed feature.”

---

## 21. Accessibility

- `html lang` stays `"en"` while Gujarati is shown → screen readers get the wrong language.
- Landing Gujlish and long Gujarati+English strings will wrap; **clipping not measured** at 375px on ERP (landing was 1920×1080).
- Agro login was already a **narrow/mobile layout**; English strings fit. Long Gujarati nav labels in the ERP shell are a known risk (`nav.purchaseExpense` is long) — **NOT TESTED** live.
- Dark login contrast for error text: readable.

---

## 22. Mobile

| Surface | Result |
|---------|--------|
| Production login (narrow viewport, live) | English-only; layout OK |
| Landing at 375×812 | **NOT TESTED** (viewport was 1920×1080) |
| Native iOS/Android Capacitor | **NOT TESTED** |
| Service Mobile localization | **NOT TESTED** |

Do not claim native mobile localization success.

---

## 23. Screen-by-screen

Legend: **PASS** / **PARTIAL** / **FAIL** / **NOT TESTED**.  
“Live” = driven in this audit. “Code” = `t()` vs hardcoded.

| Module | English | Gujarati | Mixed Text | Missing | UX | PDF |
|--------|---------|----------|------------|---------|----|-----|
| Marketing landing | PASS (live) | PARTIAL (live) | FAIL (live Gujlish + hero/nav desync) | FAQ/form/Privacy English | PARTIAL | n/a |
| Login | PASS (live) | FAIL (live) | n/a | All strings | PASS layout | n/a |
| Forgot / reset password | PASS (live) | FAIL (live) | n/a | All strings | PASS layout | n/a |
| Company not found / 404 | PASS (code) | FAIL (code) | n/a | All strings | PASS | n/a |
| App nav / chrome | PASS (code) | PARTIAL (code; `t('nav.*')`) | PARTIAL if tab labels mix | Deep items | NOT TESTED live | n/a |
| Analytics / dashboard | PASS (code) | PARTIAL (KPI chrome translated; rest English) | likely | many | NOT TESTED | n/a |
| Customers / masters | PASS (code) | PARTIAL | Collections leftover English | form fields | NOT TESTED | n/a |
| Suppliers / vendors | PASS (code) | PARTIAL | વિક્રેતા ambiguity | forms | NOT TESTED | n/a |
| Products / inventory | PASS (code) | PARTIAL | titles vs list chrome | most columns | NOT TESTED | n/a |
| Purchases | PASS (code) | PARTIAL | English form labels | most fields | NOT TESTED | n/a |
| Sales | PASS (code) | FAIL (no `useTranslation`) | n/a | module | NOT TESTED | n/a |
| Distribution | PASS (code) | FAIL (no `useTranslation`) | n/a | module | NOT TESTED | PARTIAL HTML |
| Invoices | PASS (code) | PARTIAL (list chrome) | create modal English | form/toasts | NOT TESTED | FAIL jsPDF GU |
| Payments / finance | PASS (code) | PARTIAL | bill-wise English | toasts | NOT TESTED | n/a |
| Expenses | PASS (code) | FAIL (masters expenses labels mixed) | n/a | screens | NOT TESTED | n/a |
| Accounts / books / GST reports | PASS (code) | PARTIAL (section titles only) | FAIL tables English | reports | NOT TESTED | FAIL chrome EN |
| Settings | PASS (code) | PARTIAL | GST guide mixed | email panel English | NOT TESTED live | n/a |
| Users / roles | PASS (code) | FAIL (English forms) | n/a | most | NOT TESTED | n/a |
| Barcode / labels | PASS (code) | FAIL chrome | names as entered | UI | NOT TESTED | PARTIAL |
| Hospitality | PASS (code) | FAIL (no `useTranslation`) | n/a | module | NOT TESTED | n/a |
| Service Mobile | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED | NOT TESTED |
| Super Admin | PASS English | FAIL (no i18n) | n/a | all | NOT TESTED | n/a |
| Service Cloud gates | PASS (code) | FAIL (hardcoded) | n/a | overlays | NOT TESTED | n/a |

---

## 24. Completeness scores (repeat of coverage file)

| Language | Dictionary parity | Non-English values | UI files using i18n | Login | PDF Gujarati font | Native mobile |
|----------|-------------------|--------------------|---------------------|-------|-------------------|---------------|
| English | 100% | n/a | 20.2% of TSX still have EN literals | PASS | n/a | NOT TESTED |
| Gujarati | 100% keys | 94.9% values | Same 33 files | FAIL | FAIL (Helvetica) | NOT TESTED |
| Hindi | 100% keys | 99.0% values | Same | FAIL | FAIL | NOT TESTED |
| Marathi | 100% keys | 98.5% values | Same; landing often Hindi fallback | FAIL | FAIL | NOT TESTED |

---

## 25. Severity

### P0

None proven that **changes financial/legal meaning of numbers**. Amounts use `en-IN` regardless of language. User-entered names are not auto-translated.

**Near-P0 / treat as P1:** jsPDF Helvetica will **garble or omit Gujarati** in company/product names on Cap PDFs if those names are stored in Gujarati. That is incorrect document output, not just a missing label.

### P1

- Login / session / 403 / rate-limit always English while product is marketed as Gujarati.
- Marketing claim “entire UI changes” is false.
- Sales, distribution, hospitality, GST filing toolbar, books/accounts tables remain English.
- Vendor = વિક્રેતા may reverse supplier vs seller meaning.
- `multi_language_enabled` does not hide the language UI.
- Two language systems (landing vs ERP) + leftover `dhandho_lang`.

### P2

- સેવ કરો, એનાલિટિક્સ, કલેક્શન્સ, spelling ઇન્વૉઇસ vs ઇન્વોઇસ.
- Miracle import coverage left English in Gujarati.
- FAQ/contact form on landing stay English.
- `html lang` not updated.
- Duplicate dictionary values (40 groups).

---

## 26. Verdict

### Is the current localization system production-ready?

**NO**

English as the working ERP language is production-ready.

Hindi / Gujarati / Marathi are **not** production-ready as a complete product language: dictionary parity is a **file** property, not a **screen** property. Chrome (nav, some hub titles, settings language + voice) is translated; login, toasts, GST, sales, hospitality, PDFs, and most forms are not. Marketing currently over-claims this.

If the business explicitly sells “English product, optional translated menu,” that could be **YES WITH CONDITIONS**. The public landing text does not describe that product.

### Conditions that would be required for YES WITH CONDITIONS

1. Stop claiming the entire UI changes.
2. Translate login / session / payment-critical toasts or keep users on English for those flows.
3. Fix jsPDF font if any tenant prints Gujarati names.
4. Gate or honor `multi_language_enabled`.
5. Human review of Gujarati vendor/invoice/save terminology — no AI mass-replace.

---

## TOP 10 LANGUAGE ISSUES

1. Login, forgot password, and reset password are hardcoded English (live).
2. Session expiry, 403, 429, and Service Cloud “Access blocked” are hardcoded English.
3. Only 33/163 TSX files use `useTranslation`; sales/distribution/hospitality/warranty have none.
4. 302 English `toast()` literals in product UI.
5. 161 dictionary keys unused, including all `auth.*`.
6. `html lang="en"` never follows the selected language.
7. Dates/currency ignore UI locale (dates stay `en-IN` month names).
8. Tenant flag `multi_language_enabled` does not control the Settings picker.
9. Landing `L()` is a second i18n system; hero auto-cycle desyncs from nav (live).
10. Landing/FAQ still English in Gujarati mode; Marathi often falls back to Hindi.

## TOP 10 GUJARATI ISSUES

1. સેવ કરો instead of સાચવો.
2. વિક્રેતા for Vendor (seller vs supplier).
3. ઇન્વૉઇસ vs ઇન્વોઇસ inconsistent; Hindi uses चालान.
4. 24 Miracle `importCoverage*` strings left in English.
5. Collections / Masters / Analytics / Inventory as raw loanwords.
6. GST API guide is English UI glued with Gujarati.
7. `finance.balance` = બાકી રકમ vs `rewards.balance` = બેલેન્સ.
8. Debit/credit notes and receipts untranslated in import coverage.
9. No Gujarati on login despite `auth.loginTitle` existing.
10. jsPDF Helvetica cannot render Gujarati on Cap bills.

## TOP 10 UX ISSUES CAUSED BY LOCALIZATION

1. Mixed landing: Gujarati nav + English FAQ + Gujarati hero after clicking EN.
2. User can have `dhandho_lang=gu` while marketing shows English (and the reverse).
3. After language switch, most of the ERP still looks English → appears “broken” not “partial”.
4. Long Gujarati labels vs compact nav (risk of overflow; not live-measured).
5. Screen readers told `lang=en` on Gujarati text.
6. HTML5 validation messages follow **browser** language, not app language.
7. “4 Languages” vs animated “2” / “0 Languages” on the landing stats row.
8. PDF `Rs.` vs on-screen `₹`.
9. Feature flag off in Super Admin still shows language buttons in-app.
10. Device-wide language: accountant and shop staff on one PC cannot keep different languages.

## TOP 10 MISSING TRANSLATIONS (highest-traffic English walls)

1. Login / Forgot / Reset (and `Invalid email or password`).
2. Session expired / signed in on another device.
3. Sales entry form (`SalesEntryView` — no i18n).
4. Distribution create/list (no i18n).
5. GST e-invoice / e-way toolbar toasts and buttons.
6. Invoice create modal columns (Item, Qty, Rate, Disc%, GST…).
7. Accounts report names (P&amp;L, Trial Balance, GSTR-1, …).
8. Hospitality floor/waiter/kitchen chrome.
9. Barcode label printer chrome.
10. Service Cloud seat overlays (Connecting / In use / Access blocked).

## TOP 10 RECOMMENDED FIXES (do not apply in this audit)

1. Wire `LoginScreen` to existing `auth.*` + `common.*` keys; add missing reset/forgot keys.
2. Translate `api.ts` session/403 messages via a small shared map (or keep English and stop marketing full i18n).
3. Embed a Gujarati-capable font in jsPDF **or** document Cap PDF as English-only.
4. Honor `multiLanguageEnabled` in Settings; document device-scoped `dhandho_lang`.
5. Set `document.documentElement.lang` when `setLang` runs.
6. Unify landing with `dhandho_lang` **or** isolate marketing language so it cannot confuse persistence.
7. Human-review Gujarati: Vendor, Invoice, Save, Collections; fix ઇન્વૉઇસ spelling.
8. Translate or explicitly leave English the 24 Gujarati Miracle coverage rows (Hindi already translated most).
9. Replace hardcoded toasts in invoice/payment/GST with `t()` incrementally (highest-traffic first) — no AI dump.
10. Change landing copy from “entire UI changes” to “menu and common actions” until coverage is real.

---

## What was not tested

- Logged-in ERP in Gujarati/Hindi/Marathi (no successful tenant session this run).
- Native mobile apps.
- 375×812 / 390×844 landing overflow.
- Gujarati search of customer/product names.
- Print/PDF glyph rendering with a real Gujarati company name.
- Role/tenant matrix for language preference.
- Reticle in-app verification (no connected session).
