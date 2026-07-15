# Dhandho — full code review (v9)

**Baseline:** fixes on top of v8 findings (`7ee283f` + uncommitted)  
**Date:** 2026-07-15  
**Open:** 0 from v8 pass (deferred items still skipped)  
**E2E:** `e2e_by_type` **493/493**

**Skipped (deferred):** FORCE RLS · weak on-prem license key · tokens in localStorage

---

## Closed this pass (v8 → fixed)

| ID | Fix |
|----|-----|
| H1 | Dist bill / einvoice / ewaybill use `assertVendorAccess` + forced vendor filter |
| H2 | PATH_MODULE: banks, staff, suppliers, categories, masters, chatbot |
| H3 | Analytics + rewards-summary vendor-scoped |
| H4 | Invoice-finance GETs `blockVendors` |
| M1 | Unlinked Vendor 403 on distribution list |
| M2 | Vendor payment allocation under `FOR UPDATE` on vendor row |
| L1 | Chatbot 500 no longer returns `String(err)`; `blockVendors` |
| L2 | Covered by H2 PATH_MODULE extensions |
| L3 | SuperAdminBilling print escapes invoice number/status |

## Still deferred

FORCE RLS · weak license key · localStorage tokens
