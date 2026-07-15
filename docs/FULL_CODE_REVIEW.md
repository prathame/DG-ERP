# Dhandho — code review status

**Date:** 2026-07-15  
**Open:** **0**  
**Deferred (by design):** 3 (D1–D3)

Security sprint + optional hardening (**O1–O4**) are closed.

| ID | Fix |
|----|-----|
| **O1** | Quote convert / order fulfill — row `FOR UPDATE` + status-conditional UPDATE |
| **O2** | Dist batch delete — lock distribution + inventory rows inside txn |
| **O3** | Warranty→replacement — ordered barcode locks + already-replaced / validity checks |
| **O4** | Invoice print — `esc(customerGstin)` |

**Deferred only:** FORCE RLS · weak license key · localStorage tokens.
