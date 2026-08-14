# DG-ERP Phase 2.6 — Real Environment Validation Audit
> Date: 2026-08-14 | PR: #335
> API baseline: 1,377 tests / 155 files
> Playwright: 88 browser tests added

---

## Executive Summary

Phase 2.6 executed real browser UI validation using Playwright across 4 viewport sizes against a live instance of DG-ERP (frontend + backend + test database). The build was broken and fixed (pre-existing Vite config bug). QA tenants were seeded with realistic data.

**Browser testing: ✅ 88/88 PASS across all 4 viewports**

All environments requiring physical hardware (Android, Electron, iOS, real device) are marked ⏸️ NOT TESTED with exact requirements documented. PDF visual quality cannot be verified without a browser inspector — the generation endpoints return data (API layer verified), but visual rendering is ⚠️ PARTIAL.

---

## Environment

| Item | Value |
|---|---|
| OS | macOS Darwin 25.6.0 |
| Browser | Chromium (Playwright managed) |
| Playwright version | 1.51.0 |
| Frontend | Vite preview (production build, dist/) |
| Frontend URL | http://127.0.0.1:3000 |
| Backend | tsx server/index.ts |
| Backend URL | http://localhost:3001 |
| Database | PostgreSQL 16 (Neon managed, test DB) |
| Node.js | 22.x |

## Test Tenants

| Tenant | Company | Slug | Email | Password | Business Type |
|---|---|---|---|---|---|
| DHANDO-QA-A | Shree Radha Jewellers | qa-srjewel | admin@srjewel.qa | QaTest@2026! | manufacturer |
| DHANDO-QA-B | TechSeva Solutions Pvt Ltd | qa-techseva | admin@techseva.qa | QaTest@2026! | service |

Data seeded: products, vendors, categories, customers, inventory barcodes, distributions, sales, warranties, quotations, orders, invoices, payments, expenses, staff, books COA.

## Viewports Tested

| Configuration | Width | Height | Device equivalent |
|---|---|---|---|
| Desktop Chrome (1440×900) | 1440 | 900 | Standard laptop |
| Desktop Chrome (1280×720) | 1280 | 720 | HD laptop/monitor |
| Mobile Chrome (390×844) | 390 | 844 | iPhone 14 Pro |
| Tablet (768×1024) | 768 | 1024 | iPad portrait |

---

## Browser UI Results

### Build Fix Required (pre-existing bug)

**Bug:** `vite.config.ts` `sharedTsResolve` plugin only handled absolute-style paths (`shared/tabPresets`) but not relative imports between shared modules (`./tabPresets` from `shared/mobileFeatures.ts`). Vite was loading the compiled CJS `shared/tabPresets.js` instead of the TypeScript source, causing Rollup to fail finding ESM named exports. Build had been broken silently.

**Fix:** Extended the resolveId hook to also handle relative `./X` imports when the importer is within `shared/`.

**Status:** 🔧 FIXED — `npm run build` now succeeds.

---

### Authentication — ✅ PASS (all viewports)

| Test | Desktop 1440 | Desktop 1280 | Mobile 390 | Tablet 768 |
|---|---|---|---|---|
| Login page loads at slug route | ✅ | ✅ | ✅ | ✅ |
| Invalid credentials → error shown | ✅ | ✅ | ✅ | ✅ |
| Successful login → navigates to dashboard | ✅ | ✅ | ✅ | ✅ |
| Tenant B login isolated from Tenant A | ✅ | ✅ | ✅ | ✅ |
| No horizontal overflow on login page | ✅ | ✅ | ✅ | ✅ |

**Key finding:** Login flow works correctly. Entering wrong credentials shows an error without navigating away (correct). Tenant B's dashboard shows TechSeva branding, not Shree Radha branding — tenant isolation at UI level confirmed.

---

### Dashboard and Navigation — ✅ PASS (all viewports)

| Test | Desktop 1440 | Desktop 1280 | Mobile 390 | Tablet 768 |
|---|---|---|---|---|
| Dashboard loads with content | ✅ | ✅ | ✅ | ✅ |
| Navigation elements present | ✅ | ✅ | ✅ | ✅ |
| No horizontal overflow | ✅ | ✅ | ✅ | ✅ |
| No critical JS console errors | ✅ | ✅ | ✅ | ✅ |
| Navigate to Customers | ✅ | ✅ | ✅ | ✅ |
| Navigate to Products | ✅ | ✅ | ✅ | ✅ |
| Notifications accessible | ✅ | ✅ | ✅ | ✅ |
| Company name visible | ✅ | ✅ | ✅ | ✅ |

**Key finding:** No critical JavaScript console errors on dashboard load (filtered noise: favicon, CORS dev warnings, Sentry init warning). The company name "Shree Radha Jewellers" is visible in the header/sidebar confirming tenant-scoped branding.

---

### Mobile UX — ✅ PASS (all viewports)

| Test | Desktop 1440 | Desktop 1280 | Mobile 390 | Tablet 768 |
|---|---|---|---|---|
| Login inputs ≥36px height | ✅ | ✅ | ✅ | ✅ |
| No horizontal overflow on login | ✅ | ✅ | ✅ | ✅ |
| Submit button ≥40×44px | ✅ | ✅ | ✅ | ✅ |
| No horizontal overflow after login | ✅ | ✅ | ✅ | ✅ |
| Navigation mechanism present | ✅ | ✅ | ✅ | ✅ |

**Key finding:** The application does NOT overflow horizontally at any tested viewport. All login form elements meet minimum touch target sizes (WCAG 2.5.8). No text overflow or clipping detected on dashboard.

**Limitations:** These tests verify absence of overflow and minimum element sizes. Full touch UX quality (actual finger ergonomics, scroll feel, form field focus behavior on mobile keyboards) requires a physical device — marked ⚠️ PARTIAL.

---

### PDF / Print — ⚠️ PARTIAL

| Test | Status | Notes |
|---|---|---|
| Invoice list loads | ✅ | Page navigable |
| Distribution section accessible | ✅ | Page navigable |
| Bill settings accessible | ✅ | Color/logo config visible |
| Invoice PDF visual quality | ⏸️ NOT TESTED | Requires manual inspection |
| CGST/SGST in PDF | ⏸️ NOT TESTED | API returns correct values (Phase 2 API tests) |
| Multi-item long invoice PDF | ⏸️ NOT TESTED | |
| PDF on mobile | ⏸️ NOT TESTED | |

**What was tested:** PDF generation endpoints return HTTP 200 with data (verified in Phase 2 API tests). The bill settings page (logo, colors, bank details) is accessible and configurable in the UI.

**What was NOT tested:** The visual quality of the rendered PDF — correct layout, no clipping, correct totals displayed, page breaks. This requires opening the PDF in a browser and visually inspecting it. **Manual QA required before customer-facing invoices are generated.**

---

## Android / Service Mobile — ⏸️ NOT TESTED

**Requirements to test:**
- Android SDK (API ≥26)
- Android emulator or physical device
- `npm run ci:android` → builds `dist-apk/dhandho-mobile-debug.apk`
- ADB for installation

**Architecture verified (code):** Service Mobile ERP data is local-only (PGlite/IndexedDB). Cloud sync is license + settings + notifications only. This matches the documented design.

---

## Electron Desktop — ⏸️ NOT TESTED

**Requirements to test:**
- `npm run build:electron:desktop:mac` or `build:electron:desktop:win`
- electron-builder configured in `electron-desktop.config.cjs`

---

## Electron On-Prem — ⏸️ NOT TESTED

**Requirements to test:**
- `npm run build:electron:onprem`
- PostgreSQL data in `userData/postgres-data/` initialized

---

## NIC E-Invoice / E-Way Bill — ⏸️ NOT TESTED

**Requirements to test:**
- NIC sandbox GSTIN credentials
- NIC sandbox API endpoint
- Valid GSTIN in tenant settings

**Note:** The GSTR-1 JSON structure was tested and verified in Phase 2.9 (gst-compliance.test.ts). IRN/EWB API integration requires live NIC sandbox.

---

## Observability — ⚠️ PARTIAL

| Component | Status | Notes |
|---|---|---|
| Sentry error capture | ✅ VERIFIED | Phase 1 smoke test confirmed |
| Logtail structured logging | ✅ VERIFIED | Production logs flowing |
| Correlation IDs | ✅ VERIFIED | X-Correlation-ID in all responses |
| Slow query logging | ✅ VERIFIED | SLOW_QUERY_MS=200 configured |
| Circuit breaker | ✅ VERIFIED | Phase 2 fix confirmed |
| **Sentry alerts** | ❌ NOT CONFIGURED | No active alerts — P1 |
| **Logtail alerts** | ❌ NOT CONFIGURED | No active alerts — P1 |

**Alert configuration recommendation (must do before marketing launch):**

| Alert | Tool | Threshold |
|---|---|---|
| 5xx spike | Sentry | >5 errors in 5 minutes |
| Books dual-write failure | Sentry | Any (BOOKS_STRICT=1 in production) |
| Circuit breaker open | Sentry + Logtail | Any event |
| DB pool utilization >80% | Render metrics | Sustained >3 min |
| Slow API p95 >2s | Logtail | 5-minute rolling average |
| Auth failure spike | Sentry | >20 failures in 5 min |

---

## Performance Follow-Up — ✅ TESTED (Phase 2.5)

Performance was benchmarked in Phase 2.5. Key results:

| Endpoint | p50 (local) | p99 (local) | Max concurrent | Status |
|---|---|---|---|---|
| settings/profile | ~25ms | ~80ms | 10 | ✅ Safe |
| dashboard/stats | ~80ms | ~220ms | 5 | ✅ Safe |
| notifications (8 seq) | ~200ms | ~500ms | 5 | ⚠️ P1 to optimize |
| analytics/overview | ~250ms | ~700ms | 3 | ⚠️ P1 to optimize |

`DATABASE_POOL_SIZE=20` was added to `render.yaml` in Phase 2. The `notifications` endpoint (8 sequential queries = 32 round-trips) and `analytics/overview` (10 parallel connections) are candidates for `withTenantClient()` migration but not blocking for first tenant.

---

## Bugs Found in Phase 2.6

| # | Severity | Bug | Status |
|---|---|---|---|
| 1 | P1 | Build fails: `sharedTsResolve` plugin misses relative imports between `shared/` modules | 🔧 FIXED |
| 2 | P2 | Seed script: `category_id` column doesn't exist in products table | 🔧 FIXED |
| 3 | INFO | Sentry warning: Express not instrumented (static import hoisting) | Open — cosmetic, error capture works |

---

## Final Release Assessment

### Total Tests

| Suite | Before | After |
|---|---|---|
| API (Vitest) | 1,377 | 1,377 (unchanged) |
| Playwright browser | 0 | **88** |
| **Total** | **1,377** | **1,465** |

### Status Summary

| Area | Status |
|---|---|
| Real browser UI (Desktop) | ✅ PASS — 88/88 |
| Real browser UI (Mobile 390px) | ✅ PASS — no overflow, touch targets OK |
| Real browser UI (Tablet 768px) | ✅ PASS |
| PDF generation (API) | ✅ PASS — endpoints respond |
| PDF visual quality | ⏸️ NOT TESTED — manual required |
| Android Service Mobile | ⏸️ NOT TESTED — no Android SDK |
| Offline functionality | ⏸️ NOT TESTED — requires Capacitor build |
| Electron Desktop/On-Prem | ⏸️ NOT TESTED — no electron-builder |
| NIC E-invoice | ⏸️ NOT TESTED — no credentials |
| Observability (infrastructure) | ✅ PASS |
| Observability (alerts) | ❌ NOT CONFIGURED — P1 |
| Performance (measured) | ✅ PASS — Phase 2.5 |
| Build | 🔧 FIXED |

---

## P0 — Must Fix Before First Tenant

**None.** All P0 items from previous phases are resolved.

## P1 — Must Fix Before Public/Marketing Launch

| Item | Status |
|---|---|
| Sentry/Logtail alerts not configured | Open |
| PDF visual quality not tested | Open — manual QA needed |
| Service Mobile offline not tested | Open — requires Capacitor + Android |
| Electron Desktop/On-Prem not tested | Open — requires electron-builder |
| Mobile real device UX | Open — requires physical device |
| NIC E-invoice not tested | Open — requires NIC sandbox |
| Desktop builds unsigned | Open |
| notifications 32 round-trips (perf) | Open — withTenantClient migration |

## P2 — Post-Launch

| Item |
|---|
| analytics/overview withTenantClient migration |
| API versioning |
| Service Mobile offline test harness |
| Frontend React component test coverage |

---

## A. CONTROLLED FIRST TENANT: **GO ✅**

**Evidence:**
- 88/88 browser tests pass (login, navigation, mobile UX, dashboard)
- Zero horizontal overflow on any viewport
- Tenant isolation confirmed at UI level (Tenant B shows different branding)
- Login flow works correctly including error states
- No critical JS console errors
- All P0 items resolved, 0 P0 remaining

**Condition:** Manually inspect at least one invoice PDF in a browser before the first tenant generates customer-facing invoices.

---

## B. PUBLIC / MARKETING LAUNCH: **NO-GO ❌**

**Reason (P1 blockers for public launch):**

1. Service Mobile offline not tested — if marketed as offline ERP, this is required
2. Electron Desktop/On-Prem not tested — if distributed as desktop app, required
3. PDF visual quality not tested — customer-facing invoices unverified
4. Mobile real device UX not tested — touch experience unknown
5. NIC E-invoice not tested — GST e-invoice compliance required for Indian B2B
6. Sentry/Logtail alerts not configured — no monitoring for production incidents

**To achieve GO for public launch:** Complete the untested P1 areas above.

---

### Reproduce Browser Tests

```bash
# Prerequisites: servers must be running
npm run build                    # build frontend
npm run server &                 # backend on :3001
npm run preview -- --port 3000 --host 127.0.0.1 &  # frontend on :3000

# Seed QA tenants (first time only)
npx tsx scripts/seed-qa-tenants.ts

# Run Playwright tests
npx playwright test -c playwright.phase26.config.ts

# Expected: 88 tests, all passing
```

*Phase 2.6 audit date: 2026-08-14 | PR: #335*
