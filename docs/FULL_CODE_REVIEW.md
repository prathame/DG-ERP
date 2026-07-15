# Dhandho — code review status

**Date:** 2026-07-15 (GST High/Medium + cloud retry fixed)  
**Open must-fix:** **0**  
**Deferred:** 3 (D1–D3)

## Closed this pass

| ID | Fix |
|----|-----|
| **N-H1** | No silent mock — mock only when `gst_api_mode=mock`; live needs creds |
| **N-H2** | Live crypto fail-closed (PEM via env); RSA PKCS1; AES-256-ECB cleaned |
| **N-H3** | IRN/EWB generate locks batch rows in a transaction |
| **N-M1** | Create invoice only `draft`/`sent` |
| **N-M2** | Real pincode required for live; mock may default |
| **N-M3** | B2B vs B2C from buyer GSTIN |
| **N-M4** | Warranty replace fails with 4xx; barcode set only after stock txn |
| **N-M5** | Dist batch delete blocked if IRN/EWB present |
| **Cloud** | Banner copy fixed; GET 3× retry, mutations 1× |

## Deferred

**D1** FORCE RLS · **D2** license key · **D3** localStorage tokens.

## Live GST setup

Set `GSTN_SANDBOX_PUBLIC_KEY` or `GSTN_PRODUCTION_PUBLIC_KEY` (PEM from NIC portal) before leaving `mock` mode.
