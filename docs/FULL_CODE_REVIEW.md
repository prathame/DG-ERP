# Dhandho — code review

**Baseline:** `main` @ `b1a42c0` (+ N1–N8 fixes)  
**Date:** 2026-07-15  
**Open:** **0**  
**Deferred:** 3  

---

## Verdict

All open items from the post–R1–R11 pass (**N1–N8**) are fixed. Deferred **D1–D3** remain intentional.

---

## Closed this pass (N1–N8)

| ID | Fix |
|----|-----|
| **N1** | Supplier payments — `FOR UPDATE` + remaining-balance cap (batch and overall) |
| **N2** | Vendor no-`batchId` payments — reject overpay; no more Advance inserts |
| **N3** | Distribution batch edit — only known validation messages returned; else 500 |
| **N4** | Bill templates — `esc()` on prefixes, ids, challan title, `packQuantity` |
| **N5** | `GET /products` — Vendor aggregates scoped to their distribution/sales |
| **N6** | `accounts` + `reports` routers — `blockVendors` |
| **N7** | Sales validate + by-barcode — Vendor JWT scope; invoice next-number denied for Vendor |
| **N8** | Admin create user — verify linked vendor exists |

---

## Deferred

| ID | Finding |
|----|---------|
| **D1** | FORCE RLS not enabled |
| **D2** | Weak on-prem license key derivation |
| **D3** | Tokens in `localStorage` |
