---
sidebar_label: Metal / Silver Casting API
title: Metal and Silver Casting API
description: Weigh-to-barcode intake, jewellery tags, weight-based sales, and fine metal ledger for silver_casting tenants.
---

# Metal and Silver Casting API

**Router:** `server/routes/metal.ts` · **Module permission:** `inventory`  
**Business type gate:** `tenants.business_type === 'silver_casting'`

Tab presets live in `shared/tabPresets.ts`. Feature flags / labels: `src/lib/businessTypeConfig.ts` (`metalInventory`, `weighScale`, `jewelleryTags`).

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/metal/intake` | Weigh one piece → unique barcode → `product_inventory` row with metal fields |
| GET | `/api/metal/fine-ledger` | Fine in (intake) / fine out (sold) / on-hand by purity |

Related (existing routers, metal-aware when type is `silver_casting`):

| Method | Path | Behavior |
|---|---|---|
| GET | `/api/products/:id/barcodes` | Includes `netWeight`, `purity`, `fineWeight`, `huid`, … |
| GET | `/api/sales/validate/:barcode` | Returns `metalPricing`, weights, suggested `price` |
| POST | `/api/sales` | Auto price from weight × rate + making; **skips** warranty + rewards |

## Intake body (`POST /api/metal/intake`)

| Field | Required | Notes |
|---|---|---|
| `productId` | yes | Must belong to tenant |
| `netWeight` | yes* | Grams; or use `grossWeight` alone |
| `grossWeight` | no | Defaults to net |
| `purity` | no | Parts per thousand (default `999`); must be `0 < p ≤ 1000` |
| `metalRate` | no | ₹/g; defaults to `products.price` |
| `makingRate` / `makingAmount` | no | Making ₹/g or absolute |
| `barcodePrefix` | no | Default `AG`; sanitized alphanumerics |
| `barcode` | no | Explicit piece code if unique |
| `huid` | no | Hallmark id string |

\* At least one of `netWeight` / `grossWeight` must be a positive number.

**Fine weight:** `fine = round(net × purity / 1000, 3)` (`shared/metal.ts`).  
**Suggested sale:** `net × metalRate + makingAmount`.

## AuthZ / isolation

- JWT + `x-tenant-id` required  
- `blockVendors` — vendors cannot intake  
- Module `inventory`: GET needs `view`, POST needs `full`  
- Non-`silver_casting` tenants → `403`  
- Product lookup is always `tenant_id`-scoped  

## Fine ledger (`GET /api/metal/fine-ledger`)

Query: optional `from`, `to` (dates).

```json
{
  "intake": [{ "purity": 925, "pieces": 2, "netWeight": 20, "fineWeight": 18.5 }],
  "sold": [...],
  "inStock": [...],
  "totals": { "fineIn": 18.5, "fineOut": 9.25, "fineOnHand": 9.25 }
}
```

- **intake** filtered by `product_inventory.created_at`  
- **sold** filtered by `product_sales.purchase_date`  
- **inStock** is current snapshot (not date-filtered)

## UI entry points

- Inventory → **Metal Intake** (`MetalIntakeModal`) + scale bridge (`src/lib/scaleBridge.ts`)  
- Jewellery tag print via `BarcodeLabelPrinter` `jewelleryMode`  
- Counter Sale → weight-based suggested price  
- Accounts → **Fine Metal Ledger**

## Phase 2+ (not in API yet)

Casting/melting jobs, bullion, sauda / bhav-cut / havala, ZPL/TSPL printers.

## Related

- [Product Domain — Silver Casting](/overview/product-domain#5-silver-casting)  
- [Products & Inventory API](/api/products-inventory)  
- [Sales & Distribution API](/api/sales-distribution)  
- Manual QA: `tests/cases/silver-casting.md`  
