# Dhandho — full code review (v8)

**Baseline:** dirty tree on `main` @ `7ee283f` (v7 fixes applied, uncommitted)  
**Date:** 2026-07-15  
**Open:** 9 findings — 0 critical · 4 high · 2 medium · 3 low  

**Skipped (deferred):** FORCE RLS · weak on-prem license key · tokens in localStorage

---

## Prior fixes still hold

Live role refresh · module permission gate · vendor scopes on finance/batches/products/dashboard-stats/sale-bill/CRM · print esc · openExternal http(s) · invoice FOR UPDATE · price-lists / reward counters / backup admin

---

## Open findings

### High

| ID | Location | Finding |
|----|----------|---------|
| H1 | `distribution.ts` bill / einvoice / ewaybill | Vendor IDOR — any `vendorId`/`batchId`; batch detail is scoped, these three are not |
| H2 | `permissions.ts` PATH_MODULE | Unmapped `/banks`, `/staff`, `/suppliers`, `/chatbot` skip the module gate |
| H3 | `dashboard.ts` analytics + rewards-summary | Vendor sees tenant-wide analytics (stats endpoint is scoped) |
| H4 | `invoice-finance.ts` GETs | Vendor can read all B2B invoice finance (mutations already `blockVendors`) |

### Medium

| ID | Location | Finding |
|----|----------|---------|
| M1 | `distribution.ts` list | Unlinked Vendor (`vendorId` null) can list all distributions |
| M2 | `finance.ts` payments | Multi-batch payment allocation race (no `FOR UPDATE`) |

### Low

| ID | Finding |
|----|---------|
| L1 | Chatbot 500 returns `String(err)` |
| L2 | `/masters/counts`, `/categories` also ungated (low sensitivity) |
| L3 | SuperAdminBilling print title missing `esc` (admin-only) |

---

## Recommended next

1. `assertVendorAccess` on dist bill / einvoice / ewaybill  
2. Extend `PATH_MODULE` for banks → settings/accounts, staff → accounts, suppliers → purchases, chatbot → dashboard (or deny Vendor)  
3. Vendor-scope analytics + rewards-summary; `blockVendors` on invoice-finance GETs  
4. 403 unlinked Vendor on distribution list; lock vendor payment allocation  
