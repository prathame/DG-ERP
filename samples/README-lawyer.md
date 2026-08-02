# Lawyer / legal services sample (business type: `service`)

Sample pack for a **revenue-focused law practice** demo (clients, fee schedule, quotes).
Use a Super Admin tenant with **business type = Service**.

## Import order (Cap Offline / Online + cloud desktop)

1. **Masters → Clients → Import CSV** → `lawyer-clients.csv`
2. **Masters → Prices → Import** → `lawyer-price-list.csv`  
   - Cap Offline auto-creates fee items from the price CSV.  
   - Cloud desktop: fee items must exist first — use  
     `npx tsx scripts/seed-lawyer-service-sample.ts --slug=YOUR_SLUG`  
     (creates products + prices + invoices), **or** add each fee once via Prices → Add Rule.
3. **Quotes → Import CSV** → `lawyer-quotations.csv`  
   - Needs matching client + product names from steps 1–2.
4. **Revenue:** convert a quote → invoice, or run the seed script (creates paid + unpaid invoices for Invoice Finance / dashboard).

## Fee items (SAC 9982 — legal services)

| Service | Rate (₹) |
|---------|----------|
| Legal consultation (per hour) | 2,500 |
| Case filing / vakalatnama | 5,000 |
| Court appearance (per hearing) | 7,500 |
| Legal notice drafting | 3,500 |
| Contract / agreement drafting | 15,000 |
| Due diligence review | 25,000 |
| Monthly retainership | 40,000 |
| Arbitration representation | 50,000 |
| Trademark filing assistance | 12,000 |
| Property title opinion | 8,000 |

## Seed script (full revenue demo)

```bash
# Tenant must already exist with business_type=service
DATABASE_URL=... npx tsx scripts/seed-lawyer-service-sample.ts --slug=your-company-slug
# or
DATABASE_URL=... npx tsx scripts/seed-lawyer-service-sample.ts --tenant=T1234567890
```

Idempotent: skips if sample marker client **Mehta Industries Pvt Ltd** already exists for that tenant.
