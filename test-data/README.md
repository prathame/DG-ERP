# Test Data for CSV Import

## `valid/` — All should import successfully
| File | Records | What it tests |
|------|---------|---------------|
| vendors.csv | 5 vendors | Valid names, phones, emails, GSTIN |
| staff.csv | 7 staff | Valid names, phones, roles, salaries, dates |
| products.csv | 10 products | Mix of pesticides/seeds/fertilizers/equipment, GST Y/N, Box/Bag/Piece, 5%/18% GST |
| banks.csv | 3 banks | Valid account numbers, IFSC codes |
| distribution.csv | 6 rows | Valid product names, with/without custom price, with discount |

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
