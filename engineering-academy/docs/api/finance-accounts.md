---
sidebar_label: Finance & Accounts API
title: Finance and Accounts API
description: Vendor finance, party-linked invoice finance, accounts statements, and report registers.
---

# Finance and Accounts API

## Vendor finance (`finance.ts`)

Prefix `/api/vendor-finance/*` — receivables against distribution, reminders, bank statement preview/apply.

## Invoice finance (`invoice-finance.ts`)

Prefix `/api/invoice-finance/*` — collections on standalone invoices (service businesses and any tenant using the Invoices tab).

### Party keys

Summary and client detail group by a stable **`partyKey`**, not by free-text name alone:

| `partyKey` shape | Meaning |
|---|---|
| `vendor:<id>` | Linked to a `vendors` row via `standalone_invoices.party_type/party_id` |
| `customer:<id>` | Linked to a `customers` row |
| `name:<display>` | Legacy invoices with no party link (grouped by `customer_name`) |

`parsePartyKey()` (exported from `invoice-finance.ts`) accepts URL-encoded keys and rejects empty `vendor:` / `customer:` prefixes. Client detail route: `GET /api/invoice-finance/client/:clientName` — the param is the party key (or plain name for legacy).

### Main endpoints

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/invoice-finance/summary` | Per-party totals: invoice count, invoiced, paid, balance |
| `GET` | `/api/invoice-finance/client/:partyKey` | Invoices + payments for one party |
| `POST` | `/api/invoice-finance/payments` | Record a payment against an invoice |
| `DELETE` | `/api/invoice-finance/payments/:id` | Remove a payment (Admin) |

All require JWT + `x-tenant-id` (or tenant from JWT) and go through `blockVendors`.

## Standalone invoices (`invoices.ts`)

Prefix `/api/invoices` — create/list/update/delete for `standalone_invoices`.

On **create**, optional `partyType` (`vendor` \| `customer`) + `partyId` are validated against the tenant's masters; unknown party → `400`. New invoices may only be `draft` or `sent` — mark paid only after recording payment via invoice-finance.

## Price lists (`price-lists.ts`)

Prefix `/api/price-lists` (module permission: `inventory`).

| Method | Path | Notes |
|---|---|---|
| `GET` | `/api/price-lists` | List rules |
| `GET` | `/api/price-lists/resolve` | `productId`, optional `vendorId`, `quantity` → price + `source` |
| `POST` | `/api/price-lists/bulk` | CSV-shaped `{ rules: [...] }` by product/vendor **name**; max 500 rows |
| `POST` / `PUT` / `DELETE` | `/api/price-lists`… | CRUD single rules |

**Resolve priority:** vendor-specific slab → general (null vendor) slab → `products.price`.

Bulk import is **insert-only** — re-importing the same CSV duplicates rules unless you delete first.

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
| Grouping key | Vendor id | `partyKey` (vendor/customer/name) |

Business type / `tab_config` picks the UI; APIs still exist — don't expose the wrong one in nav.

## Related

- [Accounts feature](/frontend/features-catalog)  
- [Business Workflows — service invoice ledger](/architecture/business-workflows#workflow-5-service-invoice--party-linked-ledger)  
- [Block vendors pattern](/backend/patterns)  
- HTTP coverage: `tests/api/http-invoices-finance.test.ts`, `tests/unit/invoice-finance-party.test.ts`
