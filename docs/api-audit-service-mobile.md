# API Audit — Offline Mobile (Service Mobile local router)

Date: 2026-07-17  
Scope: Capacitor Offline Mobile (`VITE_DEPLOYMENT_MODE=service-mobile`) local PGlite API.

## Root causes found

1. **Login dropped `businessType`** — UI fell back to `manufacturer`, so Finance opened Vendor Finance (distributed value) instead of Invoice Finance.
2. **Local router returned raw snake_case rows** — Invoices UI expected `customerName` / `grandTotal` → runtime crash (“Something went wrong”).
3. **Missing local endpoints** — Purchases: `GET /suppliers` → “Local API: GET /suppliers not implemented”; Accounts Generate → “Failed to load” or crash on wrong response shapes.
4. **Accounts response shape mismatch** — Balance Sheet / Cash Flow / GSTR-3B stubs used keys the UI does not read (`cash` vs `cashBank`, missing `inflows`/`netCashFlow`/`netPayable`).
5. **Purchase batches incomplete** — UI needs `supplierName`, `billValue`, `amountPaid`, `balanceRemaining`, `productNames`.
6. **Price lists schema wrong** — Local table stored `{name,items}` instead of per-product rule rows the Masters Price List UI expects.

## Broken APIs (before) → fixed

| Call | Before | After |
|------|--------|--------|
| Login → user.businessType | Dropped | Passed through LoginScreen; session restore defaults to `service` offline |
| `GET /invoices` | snake_case | camelCase via mappers |
| `GET /suppliers` | 404 not implemented | Implemented + table |
| `GET /purchases/batches` | Incomplete / 404 | Full PurchaseBatch shape + payments |
| `GET /purchases/batch/:id` | Minimal items | Matches cloud batch detail |
| `GET /supplier-finance/summary` | `[]` stub | Aggregated from local purchases/payments |
| `GET /invoice-finance/summary` | 404 | From local invoices + payments |
| `GET /staff` (+ PUT/DELETE) | Partial | Full list + update/delete |
| `GET /masters/counts` | 404 | Implemented |
| `GET /settings/bill` | Wrong profile stub | Bill settings JSON |
| `GET /accounts/profit-loss` | Missing / wrong | Invoice + expense + purchase P&L |
| `GET /accounts/balance-sheet` | Wrong keys | `cashBank`, `netWorth`, receivables |
| `GET /accounts/cash-flow` | Wrong keys | `inflows` / `outflows` / `netCashFlow` |
| `GET /gstr3b/compute` | Crash shape | Zeroed GSTR-3B payload |
| `GET/POST /price-lists` | Wrong model | Rule rows with product/vendor joins |
| `PUT/DELETE /banks/:id` | Missing | Implemented |
| `PUT/DELETE /products/:id` | Missing | Implemented |
| Vendor-finance paths | 404 | Empty array stubs (service type) |

## Intentionally limited offline

- Full GST filing / GSTR-2B portal reconcile / distribution / stock / barcode inventory — empty safe payloads (not Offline Mobile service features).
- Cloud license routes (`/service-mobile/*`) still hit the real cloud API.
- Dense general ledger / day-book line items remain empty until local journal posting is added; endpoints return valid empty structures (no “not implemented”).

## Files modified

- `src/components/layout/LoginScreen.tsx`
- `src/App.tsx`
- `src/platforms/service-mobile/local/router.ts`
- `src/platforms/service-mobile/local/mappers.ts`
- `src/platforms/service-mobile/local/schema.ts`
- `src/platforms/service-mobile/local/db.ts`
- `tests/unit/service-mobile-mappers.test.ts`
- `tests/cases/service-mobile.md`
- `engineering-academy/docs/deployment/service-mobile.md`
- `docs/api-audit-service-mobile.md`

## Print / PDF (Capacitor)

`window.open` is blocked or useless in the Offline Mobile WebView, so Print/PDF showed “Pop-up blocked”.  
`openPrintWindow()` now uses a fullscreen in-app preview with a **Print / PDF** button (system share sheet → Save as PDF).

## Remaining / ops

- Rebuild Offline Mobile APK after merge for devices to pick up local API + login fix + print overlay.
- Existing devices: log out and log in once so `businessType: service` is stored (or reopen app — session restore now defaults offline).
- iOS build still requires Xcode on a Mac with the Capacitor iOS toolchain.
