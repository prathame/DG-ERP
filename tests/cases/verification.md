# Verification — Test Cases

Covers product verification by typing and scanning, product state display (InStock, Distributed, Sold), conditional info panels (vendor, customer, warranty, rewards), replacement history, error handling for unknown and cross-tenant barcodes, and feature-toggle visibility.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Verify by typing barcode | Open Verification tab; type a valid barcode in the input; press Enter | Product details are displayed with current status |
| 2 | Verify by scanning barcode | Open Verification tab; scan a barcode using device camera | Product details are displayed with current status |
| 3 | InStock status display | Verify a product that has not been sold or distributed | Status shows "InStock" with a green indicator |
| 4 | Distributed status display | Verify a product that has been distributed to a vendor | Status shows "Distributed" with vendor and distribution date |
| 5 | Sold status display | Verify a product that has been sold to a customer | Status shows "Sold" with sale date and customer info |
| 6 | Vendor info visible when toggle ON | Verify a distributed product with Vendor Portal toggle ON | Vendor name, contact, and distribution details are shown |
| 7 | Vendor info hidden when toggle OFF | Verify a distributed product with Vendor Portal toggle OFF | Vendor information section is not displayed |
| 8 | Customer info visible when toggle ON | Verify a sold product with customer info enabled | Customer name, phone, and purchase date are shown |
| 9 | Customer info hidden when toggle OFF | Verify a sold product with customer info disabled | Customer information section is not displayed |
| 10 | Warranty info visible when toggle ON | Verify a sold product with Warranty toggle ON | Warranty status, expiry date, and claim details are shown |
| 11 | Warranty info hidden when toggle OFF | Verify a sold product with Warranty toggle OFF | Warranty section is not displayed |
| 12 | Rewards info visible when toggle ON | Verify a sold product with Rewards toggle ON | Reward points earned and balance are shown |
| 13 | Rewards info hidden when toggle OFF | Verify a sold product with Rewards toggle OFF | Rewards section is not displayed |
| 14 | Replacement history displayed | Verify a product that has been replaced | Replacement history with dates and reasons is shown |
| 15 | Unknown barcode error | Type a barcode that does not exist in any tenant | Error message: "Product not found" |
| 16 | Cross-tenant barcode error | Type a barcode belonging to a different tenant | Error message: "Product not found" (no cross-tenant data leak) |
| 17 | Verification tab hidden when Barcode OFF | Disable Barcode feature toggle; check navigation | Verification tab is not visible in the sidebar/nav |
