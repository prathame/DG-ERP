# LANGUAGE_COVERAGE.md

Generated from the **current repository** (`src/i18n/*.json`, `src/**/*.tsx`) plus live UI checks on 2026-09-01. No translation files were modified.

Counts are leaf keys (dot paths) in the nested JSON dictionaries.

## Supported languages (discovered, not assumed)

| Code | Language | Native label | File | Load |
|------|----------|--------------|------|------|
| `en` | English | English | `src/i18n/en.json` | Static (main bundle) |
| `hi` | Hindi | हिन्दी | `src/i18n/hi.json` | Lazy `import()` |
| `gu` | Gujarati | ગુજરાતી | `src/i18n/gu.json` | Lazy `import()` |
| `mr` | Marathi | मराठी | `src/i18n/mr.json` | Lazy `import()` |

No other locale files exist. There is no `react-i18next` / `react-intl`. Type `Lang` is `'en' \| 'hi' \| 'gu' \| 'mr'` in `src/i18n/lookup.ts`.

A **second, separate** copy system exists on the marketing landing page (`src/components/layout/LandingPage.tsx`) via inline `L(en, hi, gu, mr)` — it is **not** the JSON dictionaries.

## Totals

| Metric | Count |
|--------|------:|
| English leaf keys | **531** |
| Hindi leaf keys | **531** |
| Gujarati leaf keys | **531** |
| Marathi leaf keys | **531** |
| English keys missing from Hindi | **0** |
| English keys missing from Gujarati | **0** |
| English keys missing from Marathi | **0** |
| Extra keys in hi/gu/mr vs English | **0** |
| Empty string values (any locale) | **0** |
| Values equal to the raw key path | **0** |
| Duplicate English *values* (same string, multiple keys) | **40 groups / 50 extra occurrences** |
| Duplicate JSON *key paths* | **0** (impossible in one object) |

Dictionary **key-shape coverage is 100%** for hi/gu/mr vs English. That is **not** the same as UI coverage.

## Keys used in the running UI vs unused

Static `t('…')` / `st('…')` call sites resolve **314** unique keys.

After expanding known dynamic templates (`nav.${tab}`, `quickAdd.${id}`, `settings.gstApiGuide.*`, `settings.navPosition*`, and `business.*` via `tb()`):

| | Count |
|--|------:|
| Dictionary keys reachable from code | **370 / 531 (69.7%)** |
| Dictionary keys with **no** call site | **161 / 531 (30.3%)** |

Unused by prefix:

| Prefix | Unused keys |
|--------|------------:|
| `common.*` | 30 |
| `dashboard.*` | 18 |
| `settings.*` | 18 |
| `sales.*` | 15 |
| `masters.*` | 14 |
| `distribution.*` | 13 |
| `inventory.*` | 12 |
| `auth.*` | 7 |
| `rewards.*` | 7 |
| `warranty.*` | 7 |
| `finance.*` | 6 |
| `navSections.*` | 6 |
| `replacements.*` | 5 |
| `quotations.*` | 3 |

Notable unused block: **entire `auth.*` dictionary**. Login / forgot / reset screens are hardcoded English and never call `t()`.

`t('missing.key')` would render the literal key. **No `t()` argument was found that is absent from `en.json`.** Literal-key display is therefore unlikely for static calls; it remains possible for `t(\`nav.${activeTab}\`)` if a tab id is not a `nav.*` key.

## English identical in other locales (untranslated dictionary rows)

Counted only when the value contains Latin letters (length ≥ 3), so pure acronyms like `GST` / `UPI` are included.

| Locale | Keys identical to English | Notes |
|--------|--------------------------:|-------|
| Gujarati | **27** | 24 are `masters.importCoverage*` left in English; plus `distribution.gst`, `finance.upi`, `auth.emailPlaceholder` |
| Hindi | **6** | `finance.upi`, four purchase-return import rows, `auth.emailPlaceholder` |
| Marathi | **8** | GST/UPI/UPI ID + same four purchase-return import rows + email placeholder |

Gujarati **dictionary** rows that differ from English: **504 / 531 (94.9%)**.

Hindi dictionary rows that differ from English: **525 / 531 (99.0%)**.

Marathi dictionary rows that differ from English: **523 / 531 (98.5%)**.

## Mixed-script dictionary values (Gujarati + Latin)

**32** Gujarati values mix Gujarati script with English words (Miracle, Collections, WhatsApp, GSTIN, Chrome, NIC, IRN, etc.). Sample:

- `nav.bookImport` → `Miracle ઇમ્પોર્ટ`
- `masters.openCollections` → `Collections ખોલો`
- `settings.howToGuideFooter` → chatbot `“how to…”` + `Accounts` + `Help`
- `settings.gstApiGuide.*` → almost entirely mixed English product terms + Gujarati glue

Some mixing is **intentional** (GST, UPI, IFSC, WhatsApp, Miracle). `Collections ખોલો` and leftover English Miracle coverage rows are **accidental incomplete translation**.

## File-level i18n wiring

| | Count |
|--|------:|
| `src/**/*.tsx` files | **163** |
| Files importing `useTranslation` | **33 (20.2%)** |

Feature directories with **zero** `useTranslation`:

- `dashboard`
- `distribution`
- `hospitality`
- `job-work`
- `orders`
- `replacements`
- `rewards`
- `sales`
- `super-admin` (operator English is expected)
- `warranty`

Feature directories that **do** call `t()` (usually chrome/titles, not every field): accounts, analytics, books (partial), finance, inventory, invoices, masters, purchases, quotations, settings, verification.

## Hardcoded user-visible English (bypass i18n)

Heuristic scan (JSX text starting with a capital letter, `toast('…')`, `placeholder="…"`). Super-admin included in the first column, excluded from toasts.

| Source | Count |
|--------|------:|
| Unique-per-file hardcoded hits (all `src`, noisy) | **2178** |
| of which `super-admin` | 394 |
| `toast('…')` string literals **excluding** super-admin | **302** |

This scanner over-counts table headers and legal pages. It does **not** under-count: login, GST toolbar, hospitality, books, accounts, and most forms are English literals.

Live-confirmed hardcoded (production `/agro` login, 2026-09-01):

- Login, Email, Password, Forgot Password?, Have a reset token?
- Invalid email or password
- Back to login, Send Reset Request
- Reset token, Paste reset token, New password, Confirm password, Reset Password
- Powered by Dhandho
- Loading... (`LoadingSpinner`, not `t('common.loading')`)

`auth.*` keys exist for several of these and are unused.

## Coverage scores (not manufactured)

These are **different** measurements. Do not collapse them into one fake “Gujarati 92%”.

### English

| Score | Value |
|-------|-------|
| Dictionary completeness (source of truth) | 100% (531/531) |
| Login / auth using dictionaries | **0%** (hardcoded) |
| Hardcoded toasts (product UI) | 302 English literals |
| Missing dictionary keys | 0 |

### Gujarati

| Score | Value |
|-------|-------|
| Dictionary key parity vs English | **100%** (531/531) |
| Dictionary values actually Gujarati (not copy-pasted English) | **94.9%** (504/531) |
| Dictionary keys wired into UI | **69.7%** (370/531) |
| TSX files using i18n | **20.2%** (33/163) |
| Login / forgot / reset | **0%** (English only, live) |
| jsPDF bill font for Gujarati glyphs | **0%** (Helvetica only) |
| Marketing claim “entire UI changes” | **False** |

### Hindi

| Score | Value |
|-------|-------|
| Dictionary key parity | 100% |
| Values not identical to English | 99.0% (525/531) |
| Same UI-wiring limits as Gujarati | 33 files / login unused |

### Marathi

| Score | Value |
|-------|-------|
| Dictionary key parity | 100% |
| Values not identical to English | 98.5% (523/531) |
| Landing `L()` often omits Marathi and **falls back to Hindi** (`mr ?? hi`) |

## Missing keys (English exists, other language file missing)

**None.** All 531 English paths exist in hi, gu, and mr.

## Reverse missing (Gujarati exists, English does not)

**None.**

## Keys that would display as `customer.name` / `invoice.create`

No such keys exist in the dictionaries. Missing lookup returns the key string. Current static `t()` keys all exist. Risk is limited to dynamic tab ids and future key drift (unit test `tests/unit/i18n-lookup.test.ts` guards parity).
