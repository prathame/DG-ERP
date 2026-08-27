# Plywood & Hardware Furniture Wholesaler — test data

CSV pack for a **Dealer / Wholesaler** (`business_type=dealer`) tenant: plywood, laminates, MDF, adhesives, and furniture fittings.

Inventory import matches the current product template: **costPrice**, **batchNumber**, and **expiryDate** are optional. Sheets/hardware leave expiry blank; adhesives have a lot + expiry.

## Load order (tenant admin)

1. Create tenant in Super Admin → **Dealer / Wholesaler**
2. Masters → Customers (Vendors) → Import `vendors.csv`
3. Inventory → Import `products.csv`
4. (Optional) Masters → Banks → `banks.csv`, Staff → `staff.csv`
5. Sales / Distribution → create batch → Import `distribution.csv` (product names must match)

## Files

| File | Rows | Notes |
|------|------|--------|
| `vendors.csv` | 8 | Retail shops / carpenters / dealers who buy from you |
| `products.csv` | 24 | Sheets, boards, hardware, adhesives — GST 18%; cost + mill lot; glue has expiry |
| `distribution.csv` | 10 | Sample sales lines against product names |
| `banks.csv` | 3 | Business accounts |
| `staff.csv` | 6 | Warehouse / sales / delivery |

Prices are wholesale-style (INR). Adjust after import if needed.
