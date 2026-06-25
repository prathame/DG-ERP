# Inventory — Test Cases

Covers product creation (barcode and SKU modes), barcode overlap detection, CSV import workflow, label printing options, product deletion, search, stock adjustment, and feature-toggle visibility.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Add product in Barcode mode | Open Inventory > Add Product with Barcode toggle ON; fill name, price, barcode; save | Product is created with barcode; appears in product list |
| 2 | Add product in SKU mode | Open Inventory > Add Product with Barcode toggle OFF; fill name, price, SKU; save | Product is created with SKU; barcode field is not shown |
| 3 | Barcode overlap detection | Enter a barcode that already exists for another product; save | Validation error: "Barcode already in use" |
| 4 | CSV import — download template | Click "Import CSV" > "Download Template" | CSV template file with correct column headers is downloaded |
| 5 | CSV import — upload valid file | Upload a correctly formatted CSV file | File is accepted; preview table shows parsed products |
| 6 | CSV import — validation errors | Upload a CSV with missing required fields or invalid data | Validation errors are listed per row; import is blocked until fixed |
| 7 | CSV import — preview and confirm | After successful validation, review preview; click Confirm | Products are imported; success count is shown |
| 8 | Label printer — A4-24 layout | Select products; choose A4-24 label format; print | Print preview shows 24 labels per A4 page with barcodes |
| 9 | Label printer — A4-40 layout | Select products; choose A4-40 label format; print | Print preview shows 40 labels per A4 page with barcodes |
| 10 | Label printer — QR code | Select products; choose QR code label option; print | Labels show QR codes instead of barcodes |
| 11 | Label printer — hide price | Select products; check "Hide Price" option; print | Labels are printed without price information |
| 12 | Label printer — select specific barcodes | Multi-select specific products from list; click Print Labels | Only selected product labels are generated |
| 13 | Delete product | Click Delete on a product; confirm deletion | Product is removed from inventory list |
| 14 | Search products | Type product name or barcode in search bar | Product list filters to matching results in real time |
| 15 | Add stock to existing product | Open a product; click "Add Stock"; enter quantity; save | Product stock count increases by entered amount |
| 16 | Edit product details | Open a product; modify name or price; save | Product details are updated in the list |
| 17 | Label printing hidden when Barcode OFF | Disable Barcode feature toggle; open Inventory | Label printing button/option is not visible |
