# Silver Casting — manual smoke

Automated coverage: `tests/api/http-metal.test.ts`, `tests/unit/metal.test.ts`, `tests/unit/tabPresets.test.ts`, `tests/e2e_by_type.py` (`silver_casting`).

## Setup

1. Super Admin → Create Tenant → choose **Silver Casting**.
2. Log in as tenant admin.

## Metal intake → tag → sale

1. Masters / Inventory → create a product (design). Set **price = metal rate ₹/g**.
2. Inventory → **Metal Intake**.
3. Enter net weight (or Read from scale / paste wedge text), purity `925`, making ₹/g.
4. Create barcode → jewellery tag print opens with weight / purity / fine.
5. Counter Sale → scan barcode → suggested price = weight × rate + making → complete sale.
6. Confirm **no** new warranty row for that barcode (Warranty tab may be hidden).
7. Accounts → **Fine Metal Ledger** → Generate → fine in / out / on hand look sensible.

## Negative checks

1. Same login on a Manufacturer tenant: Metal Intake API must 403 (button should not appear).
2. Warehouse / inventory-view-only role: Metal Intake submit denied.
3. Duplicate explicit barcode on intake → 400.

## Tabs

- Inventory labeled **Metal Stock**
- Sales labeled **Counter Sale**
- Warranty / Rewards / Replacements hidden
