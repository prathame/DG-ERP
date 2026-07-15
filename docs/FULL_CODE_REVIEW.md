# Dhandho — code review (post R1–R11)

**Baseline:** `main` @ `b1a42c0` (+ uncommitted R1–R11 fixes)  
**Date:** 2026-07-15  
**Open:** **8** — 0 critical · 1 high · 4 medium · 3 low  
**Deferred:** 3  

Fresh pass after closing R1–R11. Prior fixes verified still in place.

---

## Verdict

No critical auth bypass or SQLi. Top remaining issue: **supplier payments** lack lock/balance caps that vendor and invoice paths already have. Rest is print XSS leftovers and Vendor defense-in-depth when custom permissions widen defaults.

---

## Open findings

### High

| ID | Location | Finding |
|----|----------|---------|
| **N1** | `POST /api/supplier-finance/:id/payments` | No `FOR UPDATE`, no remaining-balance check — any positive amount inserts. |

### Medium

| ID | Location | Finding |
|----|----------|---------|
| **N2** | `POST /api/vendor-finance/:id/payments` (no `batchId`) | Leftover after allocation stored as **Advance payment**. Batch + bank-statement paths cap. May be intentional. |
| **N3** | `PUT /api/distribution/batch/:batchId` | Catch returns `err.message` for any `Error` (DB leak). |
| **N4** | `billTemplates.ts` | Body `invPrefix`/`chPrefix`/ids, challan `<title>`, `packQuantity` not fully `esc()`’d. |
| **N5** | `GET /api/products` | Vendor-filtered list still exposes tenant-wide `inv_stock` / `sold_count` / `with_vendors`. Needs `inventory:view` (hidden by default). |

### Low

| ID | Location | Finding |
|----|----------|---------|
| **N6** | `accounts.ts` / `reports.ts` GETs | No vendor scope. Default Vendor has `accounts:hidden`. |
| **N7** | `GET /sales/validate/:barcode`, `GET /products/by-barcode/:barcode` | No Vendor JWT enforcement (optional query only / none). |
| **N8** | `POST /api/admin/users` | Vendor `vendorId` required but existence not checked (update checks). |

---

## Deferred

| ID | Finding |
|----|---------|
| **D1** | FORCE RLS not enabled |
| **D2** | Weak on-prem license key derivation |
| **D3** | Tokens in `localStorage` |

---

## Verified still solid

R1–R11 · PATH_MODULE · `assertVendorLinked` / `assertVendorAccess` · invoice + vendor batch payment locks/caps · bank-statement guards · apply-billing / replacements locks · live role refresh · deleted-user JWT · `openExternal` http(s) · backup `requireAdmin` · bulk-import generic 500s

---

## Recommended fix order

1. **N1** — supplier payment lock + balance cap (mirror invoice/vendor)  
2. **N2** — product decision: forbid advances or document as allowed  
3. **N3 + N4** — error leak + print escaping  
4. **N5** — Vendor-scoped product aggregates  
5. **N6–N8** — accounts/barcode/admin create hardening  
