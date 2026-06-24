# Demo Data Scripts

Scripts to populate or reset the database for demos and testing.

## Load Demo Data

Populates the database with realistic Indian business data:

```bash
npx tsx server/demo/seed-demo.ts
```

**What gets created:**
- **15 vendors** — Rajesh Electricals, Sharma Pump House, Patel Motor Works, etc.
- **15 vendor login accounts** — each vendor gets auto-generated credentials
- **10 products** — Submersible pumps, monoblock pumps, borewells, solar controllers, etc.
- **400+ barcode units** — each product with a unique barcode range
- **20 customers** — mapped to vendors across India
- **18 distribution batches** — products distributed to vendors with discounts (5–15%)
- **10 vendor payments** — partial payments via Cash, UPI, Bank Transfer, Cheque
- **10 customer sales** — with warranties auto-created
- **10 transactions** — sales, purchases, expenses
- **3 bank accounts** — HDFC, SBI, ICICI
- **3 reward rules** — milestone-based bonus points

**Admin login:** `admin@splendor.com` / `admin123`
**Vendor login example:** `rajesh@electricals.com` / `rajeshelectricals@123`

## Clear All Data

Removes everything and resets to a clean state:

```bash
npx tsx server/demo/clear-all.ts
```

Keeps only:
- Owner vendor (required for system)
- Admin user (`admin@splendor.com` / `admin123`)

## Fresh Demo Setup

To start a clean demo from scratch:

```bash
# Step 1: Clear everything
npx tsx server/demo/clear-all.ts

# Step 2: Load demo data
npx tsx server/demo/seed-demo.ts

# Step 3: Restart server
kill $(lsof -ti :3001) && npm run server
```
