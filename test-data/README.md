# Test Data for CSV Import

## `valid/` — All should import successfully
| File | Records | What it tests |
|------|---------|---------------|
| vendors.csv | 5 vendors | Agro trade customers — valid names, phones, emails, GSTIN |
| staff.csv | 7 staff | Valid names, phones, roles, salaries, dates |
| products.csv | 14 products | Agro wholesaler pack: pesticides/seeds/fertilizers/equipment plus wheat (Bag), cotton (HSN 1209), spray (Bottle), expired demo seed. Optional **costPrice / batchNumber / expiryDate** match Inventory import. Box/Bag/Bottle/Packet = qty stock; Piece = barcodes. |
| products-restock.csv | 8 products | Same names as `products.csv` — second import adds stock and can refresh cost/lot/expiry |
| banks.csv | 3 banks | Valid account numbers, IFSC codes |
| distribution.csv | 9 rows | Valid product names, with/without custom price, with discount |
| hotel-veg-restaurant/*.csv | veg restaurant | Tables, modifiers, menu dishes, membership plans (vegetarian only) |
| plywood-hardware-wholesaler/*.csv | plywood & furniture hardware wholesaler | 24 products (cost + mill lot; glue expiry), 8 trade customers, distribution sample — Dealer/Wholesaler tenant |

## `invalid/` — All should FAIL with clear error messages
| File | Errors | What it tests |
|------|--------|---------------|
| vendors.csv | Row 2: empty name, Row 3: invalid phone (12345) + bad email + invalid GSTIN, Row 5: empty row, Row 7: duplicate name |
| staff.csv | Row 2: empty name, Row 3: invalid phone (12345), Row 4: invalid phone (555ABC), Row 5: empty row, Row 7: duplicate name |
| products.csv | Row 2: empty name, Row 3: negative price, Row 4: HSN 3 digits (invalid), Row 5: HSN 5 digits (invalid), Row 7-8: duplicate name |
| banks.csv | Row 2: empty name, Row 4: empty row, Row 5-6: duplicate name |
| distribution.csv | Row 2: product not in inventory, Row 3: quantity 0, Row 4: invalid price "abc", Row 5: discount 150% (>100), Row 6: empty product name |

## How to test
1. Import `valid/` files first — all should succeed
2. Import `invalid/` files — all should fail with row-level errors, NO partial imports
3. After invalid import fails, verify no data was added (all-or-nothing)
