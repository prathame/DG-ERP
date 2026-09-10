# Agro Wholesaler — test data

CSV pack for **Shree Kisan Agro Wholesale** (`business_type=dealer`): pesticides, seeds, fertilizers, and farm equipment. Gujarat-based APMC trader buying from agrochemical companies and selling to retail shops and farmers.

## Upload order

| # | File | Where to upload | What it does |
|---|------|----------------|-------------|
| 1 | `01-products.csv` | Inventory → Import CSV | 14 products: pesticides (18% GST), seeds (5%), fertilizers (5%), sprayers (18%). Creates stock with barcodes, HSN, batch/lot, expiry dates. |
| 2 | `02-vendors.csv` | Masters → Clients → Import CSV | 5 trade customers (shops/dealers you sell to) with GSTIN. These are your buyers. |
| 3 | `03-banks.csv` | Masters → Banks → Import CSV | 3 bank accounts: SBI (business), BoB (savings), HDFC (UPI collections). |
| 4 | `04-staff.csv` | Masters → Staff → Import CSV | 7 staff: driver, helper, warehouse manager, accountant, delivery, sales exec, packing. |
| 5 | `05-distribution.csv` | Sales → Create Batch → pick a client → Import CSV | 10 sale lines dispatched to a client. Product names must match step 1. |
| 6 | `06-products-restock.csv` | Inventory → Import CSV (again) | Restock 8 products with new batch numbers. Same product names = adds stock. |
| 7 | `07-suppliers.csv` | Purchases → Import CSV (upload icon) | 5 suppliers (companies you buy from) with GSTIN. These are your sellers. |
| 8 | `08-purchases.csv` | Purchases → Record Purchase → Import CSV | 10 purchase items: quantities, cost prices, GST, lot/batch, expiry. Product names must match step 1. |

## Manual steps (no CSV import)

These steps are done in the UI after CSV uploads:

| # | Step | Where | What to do |
|---|------|-------|------------|
| 9 | Scan a bill (optional) | Purchases → Record Purchase → Scan Bill | Upload a supplier bill image/PDF to auto-fill items. Uses Gemini (online) or Tesseract OCR (offline). |
| 9 | Create invoice | Invoices → New Invoice | Pick client, add items, GST auto-splits into CGST/SGST. Send/print. |
| 10 | Record payment | Payments → Record | Against invoice or advance. Cash/cheque/UPI/bank transfer. |
| 11 | Check GST | Accounts → GSTR-1 / GSTR-3B / ITC Ledger | Review output tax, input credit, file returns. |

## Full test flow (end to end)

```
Step 1:  Upload 01-products.csv       → 14 products in inventory
Step 2:  Upload 02-vendors.csv        → 5 trade clients ready
Step 3:  Upload 03-banks.csv          → 3 bank accounts
Step 4:  Upload 04-staff.csv          → 7 staff members
Step 5:  Upload 05-distribution.csv   → sell to a client (pick Patel Kirana)
Step 6:  Upload 06-products-restock   → more stock from new batch
Step 7:  Upload 07-suppliers.csv      → 5 suppliers ready for purchases
Step 8:  Upload 08-purchases.csv     → 10 items into purchase form via CSV
Step 8b: Or scan a bill image        → Gemini (online) / Tesseract (offline) auto-fill
Step 9:  Create invoice for Patel     → GST invoice auto-generated
Step 10: Record payment received      → books receipt voucher auto-posted
Step 11: Accounts → GSTR-1            → verify outward supplies
Step 12: Accounts → ITC Ledger        → verify input credit from purchases
Step 13: Accounts → GSTR-3B           → net tax = output - input
Step 14: Books → Trial Balance        → verify double-entry balanced
Step 15: Books → P&L                  → income vs expenses
```

## Product categories

| Category | Products | GST | HSN Range |
|----------|----------|-----|-----------|
| Pesticides | Syngenta Cruiser, Bayer Confidor, UPL Saaf, Dhanuka Targa, UPL Lancer | 18% | 3808xxxx |
| Seeds | Mahindra Tomato, Nunhems Okra, Cotton, Bajra (expired) | 5% | 1209xxxx |
| Fertilizers | Zuari Urea, IFFCO DAP | 5% | 3102/3105 |
| Equipment | Neptune Sprayer, Falcon Battery Sprayer | 18% | 8424xxxx |
| Grain | Lokwan Wheat | 5% | 1001 |
