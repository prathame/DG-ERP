# Troubleshooting Manual — DG Business

## Quick Diagnosis

### App won't load (blank screen)
1. Check browser console (F12 → Console tab)
2. If "Failed to fetch" → backend is down. Check Render dashboard.
3. If "Unexpected token" → build is broken. Run `npm run build` locally.
4. If "401 Unauthorized" → token expired. Hard refresh (Ctrl+Shift+R).

### Login fails
1. "Invalid email or password" → wrong credentials. Check if password was changed.
2. "Too many login attempts" → rate limited. Wait 15 minutes.
3. "Account not active" → tenant suspended by super admin. Check `/admin`.
4. Page redirects to landing → wrong URL. Use `/{tenant-slug}` not just `/`.
5. Login works but shows wrong tenant data → multi-tab session conflict. Close other tabs, clear localStorage.

### Dropdowns are empty (vendors/products not loading)
1. This means one API in `Promise.all` failed, killing all data loading.
2. Check browser Network tab → find the red (failed) request.
3. Most common: database column missing (500 error). Check server logs on Render.
4. Fix: the `initSchema()` migration may not have run. Restart the server on Render.

---

## Module-wise Troubleshooting

### Inventory

| Problem | Cause | Fix |
|---------|-------|-----|
| Product not showing in list | Search is active | Clear search box |
| Stock shows 0 after adding | Add stock failed silently | Check if barcode prefix exists. First product needs `barcodePrefix` |
| "Barcode already exists" | Prefix collision | The system auto-increments. If error persists, a barcode with that name exists in another product |
| Pack size not showing | `packSize = 1` (default) | Only shows when packSize > 1 |
| CSV import fails | Wrong format | Download the template first, match columns exactly |
| Barcode label not printing | Popup blocked | Allow popups for the site in browser settings |

### Purchases

| Problem | Cause | Fix |
|---------|-------|-----|
| "Cannot detect barcode prefix" | Product has no existing barcodes | Add stock to the product manually first (Inventory → Add Stock), then purchase |
| Purchase batch 500 error | Duplicate ID collision | Fixed in latest code (random suffix added). Redeploy if still happening |
| Stock not increasing after purchase | Purchase failed | Check if the batch was actually created in Purchases tab |
| Supplier not found | Wrong tenant | Each tenant has its own suppliers. Make sure you're logged into the right tenant |

### Distribution

| Problem | Cause | Fix |
|---------|-------|-----|
| "Insufficient stock" | Not enough InStock inventory | Check product's `remainingInventory`. Purchase more stock first |
| Paid badge not showing | Balance > 0 | Record full payment. Badge shows when `billValue - amountPaid <= 0` |
| Bill shows totalPaid = 0 | Payment recorded without batchId | Record payment from the batch's "Record Payment" button, not Finance tab |
| Batch can't be deleted | Items sold/replaced/damaged | Only unsold batches can be deleted. sold+replaced+damaged must = 0 |
| Custom price not applied | `customPrice` not sent | Check if the Price field in the form was filled (highlights amber when active) |

### Quotations

| Problem | Cause | Fix |
|---------|-------|-----|
| Can't convert to distribution | No vendorId on quotation | Quotation must have a vendor (not just customer name) to convert |
| "Already converted" | Quote was already converted | Check Distribution tab for the converted batch |
| "Insufficient stock" on convert | Products out of stock since quote was created | Add stock before converting |
| Can't delete quotation | Status is Sent/Accepted/Converted | Only Draft and Rejected quotations can be deleted |

### Finance

| Problem | Cause | Fix |
|---------|-------|-----|
| Values show as "₹01234.005678.00" | String concatenation (old bug) | Update to latest code. Backend returns `Number()` now |
| Negative balance | Vendor overpaid | Shows as "₹X credit" in blue. Not a bug — vendor has excess payment |
| Outstanding report aging doesn't sum to balance | Unlinked payments | Payments without batchId are distributed proportionally across aging buckets |
| Payment not reflecting in batch | Payment recorded at vendor level (no batchId) | Use the "Record Payment" button on the specific batch, or use Finance tab's batch dropdown |

### Accounts

| Problem | Cause | Fix |
|---------|-------|-----|
| P&L shows 0 revenue | No distributions in date range | Adjust the date range filter |
| P&L shows 0 expenses | No purchases recorded | Use the Purchases module to record purchases |
| Balance sheet inventory wrong | Counts all InStock + Distributed items | This is correct — distributed items are still your asset until sold |
| Ledger empty | No transactions in date range | Expand the date range or check if data exists |

### Reports

| Problem | Cause | Fix |
|---------|-------|-----|
| Distribution register 500 error | `gst_number` column missing on vendors | Fixed in latest code (column added). Redeploy |
| GST summary shows 0 | No distributions in selected month | Change month/year filter |
| HSN summary empty | Products missing HSN code | Update products with HSN codes in Inventory → Edit |
| Outstanding aging mismatch | Unlinked payments scaling | Fixed in latest code (proportional scaling) |

### Dashboard

| Problem | Cause | Fix |
|---------|-------|-----|
| Dashboard 500 error | `p.name` missing from GROUP BY | Fixed in latest code. Redeploy |
| All stats show 0 | New tenant with no data | Add products, create distributions |
| Stats show as strings | PostgreSQL NUMERIC issue | Fixed — all stats cast to `Number()` |

### Settings

| Problem | Cause | Fix |
|---------|-------|-----|
| Bill logo not showing | Image too large (>500KB) | Compress the image. Max 500KB |
| Signature not on bills | Not uploaded in Bill Customization | Settings → Bill Customization → Signatory section → upload signature image |
| Tab not visible | Tab disabled in super admin | Super Admin → tenant → Tab Customization → toggle ON |

### Super Admin

| Problem | Cause | Fix |
|---------|-------|-----|
| Can't login to /admin | Wrong super admin credentials | Check `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` env vars on Render |
| New tenant missing tabs | Old provisioning code | Fixed — `provisionTenant()` now includes all 15 tabs |
| Reset password token expired | Tokens expire in 24 hours | Generate a new one from Super Admin → tenant → Users → Reset Password |
| Vendor Management toggle | Doesn't affect existing vendors | Only affects NEW vendor creation. Existing vendor logins remain |

---

## Server Issues

### Render deploy stuck
1. Go to Render dashboard → your service → Manual Deploy
2. If still stuck, check "Events" tab for build errors
3. Common: TypeScript compile error. Run `npx tsc --noEmit` locally first

### Database connection fails
1. Check `DATABASE_URL` env var on Render
2. If Render PostgreSQL: check if DB is still active (free tier expires after 90 days)
3. SSL issue: ensure `DATABASE_SSL=true` or check `rejectUnauthorized` setting in `pg-db.ts`

### Rate limiting lockout
1. Login attempts: 10 per 15 minutes per IP
2. Password change: 5 per 15 minutes
3. Super admin login: same limits
4. Fix: wait 15 minutes, or restart the server (clears in-memory rate limit store)

### Schema migration not running
1. Migrations run in `initSchema()` on every server startup
2. Uses `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS` — safe to rerun
3. If a new column is missing: restart the server on Render
4. Check server logs for "✓ Schema created" message

---

## Data Issues

### How to reset a tenant's data
```
Super Admin → Tenants → click tenant → Delete
Then create a new tenant with the same name
```

### How to reset the entire database
1. Render Dashboard → PostgreSQL → Reset Database
2. Restart the server (schema auto-creates)
3. Create new super admin + tenants from scratch

### How to check if a table/column exists
```sql
-- Connect to PostgreSQL and run:
\dt                          -- list all tables
\d product_purchases         -- describe a table
SELECT column_name FROM information_schema.columns WHERE table_name = 'vendors';
```

### Orphan data
If vendor_payments exist for a deleted vendor, they stay in the DB (no FK to vendors).
This is by design — payment records should persist for accounting.

---

## Performance Issues

### Slow page load
1. Check if product count > 1000 — consider pagination
2. Check barcode count — products with 500+ barcodes slow down barcode-details API
3. Distribution batches API does a subquery per batch for payment info — slow with 100+ batches

### Slow barcode generation
1. Creating 500+ barcodes in one call is slow (~5-10 seconds)
2. The batch INSERT is optimized but barcode uniqueness check scans all tables
3. Consider breaking large stock additions into smaller batches (100 at a time)

---

## How to Debug

### Check API response
```bash
# In browser: F12 → Network tab → click the failed request → Response tab
# Or via curl:
TOKEN=$(curl -s -X POST https://dg-erp.onrender.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"...","password":"..."}' | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")

curl -s "https://dg-erp.onrender.com/api/products" -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

### Check server logs
Render Dashboard → your service → Logs tab

### Check database
Render Dashboard → PostgreSQL → Connections → use psql or pgAdmin

### Common error patterns
| Error | Meaning |
|-------|---------|
| `column "x" does not exist` | Missing ALTER TABLE migration. Restart server |
| `duplicate key value violates unique constraint` | ID collision. Check ID generation uses random suffix |
| `relation "x" does not exist` | Table not created. Restart server |
| `column "x" must appear in GROUP BY clause` | PostgreSQL strict mode. Add column to GROUP BY |
| `permission denied for table` | Wrong database user permissions |
| `FATAL: password authentication failed` | Wrong DATABASE_URL credentials |
