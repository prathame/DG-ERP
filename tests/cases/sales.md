# Sales — Test Cases

Covers barcode validation, camera scanning, sale completion, invoice printing, GST handling, PDF and WhatsApp sharing, duplicate sale prevention, vendor restrictions, owner sales, warranty auto-creation, and reward points.

| # | Test Case | Steps | Expected Result |
|---|-----------|-------|-----------------|
| 1 | Validate barcode before sale | Enter a valid barcode in the sale form | Product details (name, price, stock) are populated automatically |
| 2 | Camera scan to add product | Click camera icon; scan a product barcode | Scanned product is added to the sale cart |
| 3 | Scanner hidden when Barcode OFF | Disable Barcode feature toggle; open Sales page | Camera scan button is not visible; manual entry only |
| 4 | Complete a sale | Add product(s) to cart; fill customer details; click "Complete Sale" | Sale is recorded; stock is decremented; invoice is generated |
| 5 | Print invoice | After completing a sale, click "Print Invoice" | Browser print dialog opens with formatted invoice |
| 6 | GST invoice format | Complete a sale for a tenant with GST enabled | Invoice includes GSTIN, HSN/SAC codes, tax breakdown (CGST/SGST or IGST) |
| 7 | Non-GST invoice format | Complete a sale for a tenant without GST | Invoice shows total amount without GST breakdown |
| 8 | Download invoice as PDF | After sale, click "Download PDF" | PDF file is downloaded with correct invoice content |
| 9 | Share invoice via WhatsApp | After sale, click "Share on WhatsApp" | WhatsApp opens with pre-filled message and invoice link/attachment |
| 10 | Prevent already-sold product sale | Try to sell a product that is already marked as Sold | Error message: "Product already sold" |
| 11 | Vendor restriction on sale | As a vendor user, try to sell a product not distributed to them | Error message: "Not authorized to sell this product" |
| 12 | Owner can sell any product | As the tenant owner, sell any InStock or Distributed product | Sale completes successfully regardless of vendor assignment |
| 13 | Auto-create warranty on sale | Complete a sale with Warranty toggle ON | Warranty record is created with start date = sale date and correct duration |
| 14 | No warranty when toggle OFF | Complete a sale with Warranty toggle OFF | No warranty record is created; warranty fields are absent |
| 15 | Reward points credited on sale | Complete a sale with Rewards toggle ON | Customer's reward points balance increases by the configured amount |
