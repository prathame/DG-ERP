---
sidebar_label: Products & Inventory API
title: Products and Inventory API
description: Categories, products, barcodes, stock add, CSV batch — inventory module endpoints.
---

# Products and Inventory API

**Router:** `server/routes/products.ts` · **Module:** `inventory`

## Endpoints (summary)

| Area | Paths |
|---|---|
| Categories | `GET/POST/PUT/DELETE /api/categories` |
| Products CRUD | `GET/POST/PUT/DELETE /api/products`, `DELETE /api/products/all` |
| Stock | `POST /api/products/:id/add-stock` |
| Barcodes | `GET …/barcode-details`, `…/barcodes`, `verify/:barcode`, `by-barcode/:barcode` |
| Bulk | `POST /api/products/batch` (CSV; admin) |
| Alerts | `GET /api/products/low-stock-count` |

Barcode generation modes on create: prefix / auto / range (see route implementation).

## Invariants

- `(tenant_id, barcode)` unique on `product_inventory`  
- Vendor lists are scoped  
- Plan limits via `checkPlanLimit` on creates  

## Price lists (`price-lists.ts`)

Same **inventory** module permission. Full endpoint table lives under [Finance & Accounts API](/api/finance-accounts#price-lists-price-liststs) (shared resolve used by Distribution and invoice create). Quick map:

| Path | Role |
|---|---|
| `GET /api/price-lists` | List rules |
| `GET /api/price-lists/resolve` | Unit price for product + vendor + qty |
| `POST /api/price-lists/bulk` | CSV import by product/vendor name |
| `POST` / `PUT` / `DELETE /api/price-lists…` | Single-rule CRUD |

## Related purchases note

`POST /api/purchases/batch` can **auto-create inventory barcodes** so purchased stock is sellable — inventory is not only created from the products UI.

## Related

- [Tenant Tables](/database/tenant-tables)  
- [Routes Catalog](/backend/routes-catalog)  
- [Business Workflows — price list](/architecture/business-workflows#workflow-6-price-list-resolve--bulk-import)  
