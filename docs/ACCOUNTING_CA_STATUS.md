# Accounting / GST — what was fixed vs still not CA-certified

**Date:** 2026-07-15

## Honest status

Improved toward CA conventions. **Still not Ind-AS / GST-portal certified.** Treat as better management books; get CA sign-off before filing.

## Fixed this pass

| Area | Change |
|------|--------|
| P&L | Tax-exclusive revenue; drafts excluded; CDN adjust; COGS ≈ cost of units sold/distributed (not raw purchases) |
| Balance sheet | Inventory at avg purchase cost; AR uses invoice payments; as-of date; GST payable/credit |
| Cash flow | Invoice cash by payment date; OWNER retail cash included |
| Ledger / day book | Cash-book polarity aligned; OWNER sales only; taxable amounts |
| GSTR-3B | Taxable only when GST applied; no fake expense ITC; CN/DN; IGST when GSTIN states differ |
| GSTR-1 | Standalone invoices + CDNR; disclaimer |
| Sales register | Exclusive pricing (matches print) |
| Print | Place of Supply from GSTIN (not hardcoded Gujarat) |

## Still not enough for statutory filing

- No full chart of accounts / journals
- No stock ledger / true opening–closing COGS with cost layers
- GSTR JSON still approximate (doc series, amendments, B2CL, e-com, RCM)
- Expense ITC eligibility / Sec 17(5) not modeled
- Bank balances not from bank master
