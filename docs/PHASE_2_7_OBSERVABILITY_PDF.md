# DG-ERP Phase 2.7A — PDF Security + Production Observability
> Date: 2026-08-14 | PR: #336
> Tests: 1,377 → 1,399 API | 88 Playwright | **1,487 total**

---

## Executive Summary

Phase 2.7A addressed two areas: PDF generation validation and production observability/alerting.

**Key finding:** PDF generation in DG-ERP is entirely **client-side** (browser, using jspdf/html2pdf.js). The server provides JSON data; the browser renders the PDF. This means:
- Visual PDF quality cannot be automated — requires manual browser inspection → ⚠️ PARTIAL
- PDF data security (cross-tenant IDOR) is fully testable via API → ✅ TESTED

All PDF data security tests pass. No cross-tenant IDOR vulnerabilities found. Observability improvements added alert-tag fields to Books failure and circuit breaker events.

---

## PDF Architecture

### How PDF Generation Works in DG-ERP

```
Browser                                    Server
  ↓                                         ↓
  │─── GET /api/distribution/bill ────────→ │
  │    GET /api/sales/:id/bill              │
  │    GET /api/invoices/:id                │
  │    GET /api/settings/bill               │
  │                                         │
  │←── JSON data (company, items, GST) ────→│
  ↓
  jspdf / html2pdf.js renders PDF in browser
  (no server-side PDF binary)
```

### PDF-Related Server Endpoints (data providers, not PDF generators)

| Endpoint | Data Provided | Auth |
|---|---|---|
| `GET /api/distribution/bill?batchId=&vendorId=` | Distribution challan data (items, GST, company) | JWT + tenant |
| `GET /api/sales/:id/bill` | Sale receipt data (product, customer, warranty, company) | JWT + tenant |
| `GET /api/invoices/:id` | Standalone invoice data (items, GST split, customer) | JWT + blockVendors |
| `GET /api/quotations/:id` | Quotation data | JWT + tenant |
| `GET /api/settings/bill` | Bill settings (logo, colors, bank, company details) | JWT + tenant |
| `GET /api/distribution/einvoice` | GSTN e-invoice JSON (not PDF, for NIC API) | JWT + tenant |
| `GET /api/distribution/ewaybill` | E-Way Bill JSON (not PDF, for NIC API) | JWT + tenant |

### Frontend PDF Implementation Files

| File | Purpose |
|---|---|
| `src/lib/billTemplates.ts` | HTML templates for invoice/challan rendering |
| `src/lib/standaloneInvoicePdf.ts` | Standalone invoice PDF generation (jsPDF) |
| `src/lib/printStandaloneInvoice.ts` | Print/share invoice (browser window, WhatsApp) |
| `src/lib/printDistributionDocs.ts` | Distribution challan/bill print |
| `src/lib/capBillPdfCache.ts` | Capacitor mobile PDF cache |
| `src/lib/shareDistributionWhatsApp.ts` | Share via WhatsApp |

---

## PDF Security Results

### Cross-Tenant IDOR — ✅ ALL BLOCKED

| Test | Expected | Actual |
|---|---|---|
| Tenant B JWT → Tenant A sale bill | 403/404 | ✅ Blocked |
| Tenant B JWT → Tenant A distribution bill | 400/403/404 | ✅ Blocked |
| Tenant B JWT → Tenant A invoice | 403/404 | ✅ Blocked |
| Vendor A1 JWT → Vendor A2 batch | 403/404 | ✅ Blocked |
| Manipulated X-Tenant-ID header | JWT overrides | ✅ Scoped to JWT |

**Implementation:** All bill data endpoints use `WHERE tenant_id = $1` (JWT-sourced) in every query. The global auth middleware overwrites `X-Tenant-ID` with the JWT's `tenantId`, making header manipulation ineffective.

### Response Safety — ✅ PASS

| Check | Result |
|---|---|
| No `password_hash` in sale bill response | ✅ Absent |
| No stack traces in any PDF data endpoint | ✅ Absent |
| No internal filesystem paths | ✅ Absent |
| No JWT/bearer tokens in response body | ✅ Absent |
| No database credentials | ✅ Absent |

### PDF Data Quality — ✅ PASS (structure verified)

| Endpoint | Fields Present | GST Split |
|---|---|---|
| Sale bill | `customerName`, `productName`, `salePrice`, `company.name`, `vendor`, `warranty`, `hsnCode`, `billSettings` | Per-product rate |
| Invoice | `invoiceNumber`, `customerName`, `grandTotal`, `gstEnabled`, `items[]` | CGST+SGST for intrastate ✅ |
| Bill settings | `primaryColor`, `footerText`, `tagline`, `logoBase64` | N/A |
| Distribution bill | barcode, product_name, net_price, billed_price, gst_applied | billed-net = GST ✅ |

**GST verification (distribution):** `gst_amount = billed_price - net_price = net_price × rate`. At 3% GST with net=₹1850: `billed = ₹1907`, `gst = ₹57 = round2(1850 × 0.03)` ✅

### PDF Visual Quality — ⚠️ PARTIAL (not automated)

Visual inspection of rendered PDFs requires a browser. The following was NOT automated:

| Document | Visual Status |
|---|---|
| Invoice PDF (1-5 items) | ⏸️ NOT TESTED — requires browser |
| Invoice PDF (20+ items, multi-page) | ⏸️ NOT TESTED |
| Distribution challan | ⏸️ NOT TESTED |
| GST invoice with CGST/SGST | ⏸️ NOT TESTED |
| Quotation PDF | ⏸️ NOT TESTED |
| PDF with company logo | ⏸️ NOT TESTED |
| PDF with long product/customer names | ⏸️ NOT TESTED |
| PDF on mobile viewport | ⏸️ NOT TESTED |

**Required for manual validation:** Open a real invoice in the browser, click Print/Download PDF, verify layout, totals, GST, company details.

---

## Observability Results

### Current Infrastructure

| Component | Status | Configuration |
|---|---|---|
| Sentry error capture | ✅ Active | SENTRY_DSN in Render Dashboard |
| Logtail / Better Stack | ✅ Active | LOGTAIL_TOKEN in Render Dashboard |
| Structured JSON logging | ✅ Active | All logs are JSON lines |
| Correlation IDs | ✅ Active | X-Correlation-ID on every request |
| Request metadata in logs | ✅ Active | tenantId, userId, method, path, status |
| Slow query logging | ✅ Active | SLOW_QUERY_MS=200 |
| Slow API logging | ✅ Active | SLOW_API_MS=500 |
| Circuit breaker events | ✅ Active | Logged at ERROR level |
| Books failure events | ✅ Active | Logged at ERROR level with alert field |

### Alert Tags Added (Phase 2.7)

New `alert` field added to key log events for rule-based alerting in Sentry/Logtail:

| Alert Tag | Log Level | Event | File |
|---|---|---|---|
| `books_dual_write_failure` | ERROR | Books posting fails in strict mode | `booksStrict.ts` |
| `books_dual_write_failure_permissive` | WARN | Books posting fails in permissive mode | `booksStrict.ts` |
| `circuit_breaker_open` | ERROR | DB circuit breaker opens | `pg-db.ts` |

### Recommended Alert Configuration

Configure in Sentry (Alerts → Rules) and/or Logtail (Alerts):

| # | Alert Name | Condition | Threshold | Action |
|---|---|---|---|---|
| A | 5xx Spike | `statusCode >= 500` | >5 events in 5 minutes | Email/Slack |
| B | Books Failure | `alert: books_dual_write_failure` | Any occurrence | Page on-call |
| C | Circuit Breaker Open | `alert: circuit_breaker_open` | Any occurrence | Page on-call |
| D | DB Pool Wait | Connection timeout errors | >3 in 5 minutes | Email |
| E | Slow API | `durationMs > 2000` | p95 > threshold for 5 min | Email |
| F | Auth Failure Spike | `msg: Authentication failed` | >20 in 5 minutes | Email |

**Status:** ❌ NOT CONFIGURED — alerts must be set up in Sentry/Logtail dashboard before public launch.

### Observability Tests — ✅ PASS (6/6)

| Test | Status |
|---|---|
| Books strict failure → ERROR with `alert` field | ✅ |
| Books permissive failure → WARN | ✅ |
| Logger: no raw passwords in output | ✅ |
| Log entries include service + hostname | ✅ |
| Fatal level is structured JSON | ✅ |
| `alert` field present for rule matching | ✅ |

### Alert Trigger Testing — ⏸️ NOT TESTED

Triggering actual Sentry/Logtail alerts requires:
1. Sentry project DSN configured (✅ done)
2. Sentry alert rules configured (❌ NOT done)
3. Logtail alert rules configured (❌ NOT done)

**Manual test procedure (to verify after configuring rules):**
```bash
# Trigger a controlled Books failure (in staging/dev only)
curl -X POST https://your-app.onrender.com/api/invoices \
  -H "Authorization: Bearer <valid-token>" \
  -H "X-Tenant-ID: <tenant>" \
  -d '{"customerName":"Test","items":[...],...}'
# Check Sentry Issues for books_dual_write_failure event
```

---

## Sentry Warning (cosmetic, non-blocking)

Production logs show:
```
[Sentry] express is not instrumented. This is likely because you required/imported express before calling `Sentry.init()`.
```

**Root cause:** TypeScript static imports are hoisted. Express is loaded before `Sentry.init()` runs. Error capture still works; automatic Express middleware instrumentation (request tracing) does not.

**Impact:** Sentry captures errors correctly. Transaction-level performance tracing for Express routes is not automatically applied.

**Fix (P2):** Restructure `server/index.ts` to use a Sentry-first initialization pattern (e.g., separate `instrument.ts` loaded via `--require` flag, or dynamic imports for Express modules).

---

## Summary

### Tests Added

| File | Tests | Coverage |
|---|---|---|
| `tests/api/phase27-pdf-security.test.ts` | 16 | PDF IDOR security, data quality, response safety |
| `tests/unit/observability.test.ts` | 6 | Alert field logging, log format safety |

### Bugs Fixed

| # | Severity | Fix |
|---|---|---|
| 1 | P2 | Added `alert` field to Books failure log for rule matching |
| 2 | P2 | Added `alert` field to circuit breaker open event |

### Remaining Items

| Item | Severity | Status |
|---|---|---|
| PDF visual quality (manual inspection) | P1 | ⏸️ NOT TESTED |
| Sentry alert rules configuration | P1 | ❌ NOT CONFIGURED |
| Logtail alert rules configuration | P1 | ❌ NOT CONFIGURED |
| Sentry Express instrumentation order | P2 | Open |
| NIC E-invoice sandbox testing | P1 | ⏸️ NOT TESTED |

---

## CONTROLLED FIRST TENANT: **GO ✅**

PDF security is verified. No cross-tenant IDOR. Response safety confirmed. Observability infrastructure is in place with alert-ready log tags.

**Condition before first tenant:** Manually verify at least one invoice PDF renders correctly in browser.

## PUBLIC LAUNCH: **NO-GO ❌**

Sentry/Logtail alert rules not configured, PDF visual quality not tested, NIC e-invoice not tested.

*Phase 2.7A date: 2026-08-14 | PR: #336*
