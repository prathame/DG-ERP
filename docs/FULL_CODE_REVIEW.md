# Dhandho — code review status

**Date:** 2026-07-15 (medium fixes applied)  
**Open must-fix:** **0**  
**Deferred (by design):** 3 (D1–D3)

## Closed this pass (Medium)

| ID | Fix |
|----|-----|
| **M2** | Status `paid` only if payments ≥ grand total; cancel blocked if payments exist |
| **M3** | Delete blocked if payments exist + FK `ON DELETE RESTRICT` |
| **M5** | Payment delete locks payment + invoice `FOR UPDATE`; revert paid → `sent` |

## Earlier closed

H12/H13 · M1 · M4 · GST harden · prior R/N/O sprint

## Deferred only

**D1** FORCE RLS · **D2** license key · **D3** localStorage tokens.
