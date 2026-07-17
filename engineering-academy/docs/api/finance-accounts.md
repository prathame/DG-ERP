---
sidebar_label: Finance & Accounts API
title: Finance and Accounts API
description: Vendor finance, invoice finance, accounts statements, and report registers.
---

# Finance and Accounts API

## Vendor finance (`finance.ts`)

Prefix `/api/vendor-finance/*` — receivables against distribution, reminders, bank statement preview/apply.

## Invoice finance (`invoice-finance.ts`)

Prefix `/api/invoice-finance/*` — collections on standalone invoices (service businesses).

## Accounts (`accounts.ts`)

Behind `blockVendors`:

- Ledger, P&L, balance sheet, cash flow  
- Day book, credit/debit notes  
- `GET /api/gstr3b/compute` (estimate — not portal JSON)  
- `POST /api/gstr2b/reconcile`  

## Reports (`reports.ts`)

Also `blockVendors`: sales/distribution/payment registers, outstanding aging, stock summary, GST summary, **GSTR-1** export.

## Why two “finance” routers?

| | Goods dealers | Service firms |
|---|---|---|
| Primary doc | Distribution batches | Standalone invoices |
| Router | `vendor-finance` | `invoice-finance` |

Business type / `tab_config` picks the UI; APIs still exist — don't expose the wrong one in nav.

## Related

- [Accounts feature](/frontend/features-catalog)  
- [Block vendors pattern](/backend/patterns)  
