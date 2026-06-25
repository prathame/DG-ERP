# Developer Documentation — Splendor ERP

Complete technical reference for developers working on this codebase.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Architecture Overview](#architecture-overview)
3. [Database](#database)
4. [Authentication](#authentication)
5. [Server — Route by Route](#server--route-by-route)
6. [Frontend — Component by Component](#frontend--component-by-component)
7. [Common Tasks (How-To)](#common-tasks-how-to)
8. [Adding New Features](#adding-new-features)
9. [Troubleshooting](#troubleshooting)
10. [Environment Variables](#environment-variables)
11. [Deployment](#deployment)

---

## Quick Reference

### Key Files

| What | Where |
|---|---|
| PostgreSQL connection + schema | `server/pg-db.ts` |
| JWT auth middleware | `server/middleware/auth.ts` |
| Tenant provisioning | `server/utils/tenant.ts` |
| Password hashing | `server/utils/helpers.ts` → `hashPassword()` |
| Barcode generation | `server/utils/barcode.ts` |
| API client (frontend) | `src/api.ts` |
| App routing (JWT decode) | `src/App.tsx` |
| Login screen | `src/components/layout/LoginScreen.tsx` |
| Super admin UI | `src/features/super-admin/` |
| Bill HTML templates | `src/lib/billTemplates.ts` |
| Chatbot engine | `server/routes/chatbot.ts` |
| Demo data scripts | `server/demo/` |

### Default Credentials

| Role | Email | Password | Where to Change |
|---|---|---|---|
| Super Admin | `admin@spre.ai` | `superadmin123` | `.env` → `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` |
| Tenant Admin | Per tenant | Auto-generated | Created via super admin or registration |

### Ports

| Service | Port | Config |
|---|---|---|
| Frontend (Vite) | 3000 | `vite.config.ts` → `server.port` |
| API Server | 3001 | `.env` → `PORT` or default in `server/index.ts` |
| PostgreSQL | 5432 | `.env` → `DATABASE_URL` |

---

## Architecture Overview

### Request Flow

```
Browser → Vite Dev Server (:3000) → Proxy /api/* → Express (:3001) → PostgreSQL (:5432)
```

In production:
```
Browser → Express (:3001) → serves static files + API → PostgreSQL
```

### Multi-Tenant Data Flow

```
1. User logs in → POST /api/auth/login
2. Server finds user across all tenants (JOIN users + tenants)
3. Returns JWT token containing { userId, tenantId, role, email }
4. Frontend stores token in sessionStorage
5. Every API call includes:
   - Authorization: Bearer {token}
   - X-Tenant-ID: {tenantId}
6. Server middleware validates JWT, extracts tenantId
7. Every SQL query includes: WHERE tenant_id = $1
```

### File Organization Philosophy

```
server/
  pg-db.ts              ← Database connection (ONE file, import everywhere)
  middleware/auth.ts     ← JWT validation (used by route mounting)
  utils/                ← Shared logic (barcode, pagination, audit)
  routes/               ← One file per feature (products.ts, sales.ts, etc.)
                          Each route: import pool, get tenantId, query with tenant_id

src/
  App.tsx               ← Just routing logic (JWT decode → super admin or tenant ERP)
  api.ts                ← All API calls (ONE file, import everywhere)
  types.ts              ← All TypeScript interfaces
  components/ui/        ← Reusable UI (Toast, Spinner, DateFilter, Pagination)
  components/layout/    ← App shell (Login, Search, Notifications, Chat)
  features/{name}/      ← One folder per feature, each with its own View component
  lib/                  ← Utilities (bill templates, CSV export, WhatsApp share)
```

---

## Database

### Connection

```typescript
// server/pg-db.ts
import { Pool } from 'pg';
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,  // max connections in pool
});
```

All routes import: `import { pool } from '../pg-db';`

### Schema

**Platform Tables** (no tenant_id):

| Table | Purpose | Key Fields |
|---|---|---|
| `super_admins` | Platform owner accounts | email, password_hash, role |
| `plans` | Subscription tiers | name, max_products, max_vendors, features (JSONB), price |
| `tenants` | Company registry | company_name, slug, admin_email, plan_id, status |
| `tenant_stats` | Historical metrics | tenant_id, date, products_count, revenue |

**Tenant Tables** (all have `tenant_id` as part of primary key):

| Table | Purpose | Key Relations |
|---|---|---|
| `users` | Login accounts | tenant_id, vendor_id (nullable) |
| `vendors` | Distributor/reseller | tenant_id |
| `customers` | End customers | tenant_id, vendor_id |
| `products` | Product catalog | tenant_id, warranty_applicable |
| `product_inventory` | Individual barcode units | tenant_id, product_id, barcode, status |
| `product_distribution` | Units sent to vendors | tenant_id, vendor_id, barcode, discount, billed_price |
| `product_sales` | Customer sales | tenant_id, vendor_id, barcode, customer_id |
| `warranties` | Warranty records | tenant_id, barcode, status |
| `product_replacements` | Replaced items | tenant_id, old_barcode, new_barcode |
| `transactions` | Financial entries | tenant_id, type (Sales/Purchase/Expense) |
| `rewards` | Points earned/redeemed | tenant_id, vendor_id, sale_id |
| `reward_rules` | Milestone rules | tenant_id, threshold, points |
| `redemption_settings` | Min balance/points | tenant_id |
| `banks` | Bank accounts | tenant_id |
| `vendor_payments` | Payments received | tenant_id, vendor_id |
| `vendor_reminder_settings` | Auto-remind config | tenant_id, vendor_id, enabled, days |
| `audit_log` | Activity tracking | tenant_id, action, entity_type |
| `categories` | Product categories (legacy) | tenant_id |

### Query Pattern

Every tenant query MUST include `tenant_id`:

```typescript
// ✅ Correct
const { rows } = await pool.query(
  'SELECT * FROM products WHERE tenant_id = $1 AND name LIKE $2',
  [tenantId, `%${search}%`]
);

// ❌ WRONG — exposes all tenants' data
const { rows } = await pool.query('SELECT * FROM products WHERE name LIKE $1', [`%${search}%`]);
```

### Migrations

Schema is auto-created on server startup via `initSchema()` in `pg-db.ts`. To add a new column:

```typescript
// In pg-db.ts initSchema(), add to the CREATE TABLE or use ALTER:
// Option 1: Add to CREATE TABLE IF NOT EXISTS (safe, won't duplicate)
// Option 2: Run ALTER TABLE separately:
try {
  await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS new_field TEXT');
} catch (_) {}
```

### Seeding

```bash
npm run demo:seed        # Pump manufacturing data
npm run demo:jewellery   # Silver jewellery data
npm run demo:clear       # Reset everything
```

---

## Authentication

### JWT Token Structure

```json
{
  "userId": "U1234567890",
  "tenantId": "T1234567890",
  "email": "admin@company.com",
  "name": "Admin Name",
  "role": "Super Admin",
  "iat": 1719216000,
  "exp": 1719820800
}
```

Super admin tokens have NO `tenantId` and `role: "super_admin"`.

### Token Generation

```typescript
// server/middleware/auth.ts
import jwt from 'jsonwebtoken';

// For tenant users
export function generateToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

// For super admins
export function generateSuperAdminToken(payload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
}
```

### Password Hashing

```typescript
// server/utils/helpers.ts
import bcrypt from 'bcrypt';
export const hashPassword = (p: string) => bcrypt.hashSync(p, 10);

// To verify:
const valid = bcrypt.compareSync(inputPassword, storedHash);
```

### Middleware Usage

```typescript
// In server/index.ts or route files
import { authMiddleware, superAdminMiddleware } from '../middleware/auth';

// Protect tenant routes
router.get('/api/products', authMiddleware, async (req, res) => {
  const tenantId = req.user.tenantId;
  // ...
});

// Protect super admin routes
router.get('/api/super-admin/tenants', superAdminMiddleware, async (req, res) => {
  // ...
});
```

### Frontend Token Handling

```typescript
// src/api.ts — automatically adds headers to every request
const token = sessionStorage.getItem('auth_token');
const tenantId = sessionStorage.getItem('tenant_id');

headers: {
  'Content-Type': 'application/json',
  ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
  ...(tenantId ? { 'X-Tenant-ID': tenantId } : {}),
}
```

---

## Server — Route by Route

### Route File Template

Every route file follows this pattern:

```typescript
import { Router } from 'express';
import { pool } from '../pg-db';

const router = Router();

router.get('/api/resource', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { rows } = await pool.query(
      'SELECT * FROM resource WHERE tenant_id = $1',
      [tenantId]
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
```

### Route Reference

| File | Routes | Notes |
|---|---|---|
| `super-admin.ts` | `/api/super-admin/*` | No tenant_id — queries across all tenants |
| `auth.ts` | `/api/auth/login`, `/api/auth/signup`, `/api/settings/*` | Login searches across tenants |
| `products.ts` | CRUD + `/add-stock`, `/by-barcode/:barcode`, `/:id/barcode-details` | Barcode range generation |
| `sales.ts` | `/validate/:barcode`, CRUD, `/:id/bill` | Auto-creates warranty + rewards on sale |
| `distribution.ts` | CRUD + `/summary`, `/bill`, `/apply-billing`, batch operations | Spreadsheet-style distribution |
| `warranties.ts` | CRUD with status auto-expiry | Checks `warranty_applicable` flag |
| `replacements.ts` | CRUD + `/validate-old/:barcode`, `/validate-new/:barcode` | Old→new barcode swap |
| `transactions.ts` | CRUD with date filters + pagination | Income/expense totals |
| `rewards.ts` | CRUD + `/balance`, reward rules, redemption settings | Vendor-scoped points |
| `customers.ts` | CRUD + `/:id/purchases`, `/:id/vendor` | Linked to vendors |
| `vendors.ts` | CRUD + auto-creates vendor login user | Password: `{name}@123` |
| `banks.ts` | CRUD | Simple master data |
| `finance.ts` | `/vendor-finance/summary`, `/:vendorId`, `/payments`, `/reminder` | Uses `billed_price` for totals |
| `admin.ts` | User management | Admin-only, role/permission CRUD |
| `dashboard.ts` | `/stats`, `/chart`, `/rewards-summary`, `/vendor/:vendorId` | KPIs + analytics |
| `search.ts` | `/search?q=` | Searches products, customers, vendors, barcodes |
| `notifications.ts` | `/notifications` | Low stock, expiring warranties, pending payments |
| `chatbot.ts` | `/chatbot` | 30+ natural language queries |
| `masters.ts` | `/masters/counts` | Aggregate counts |
| `mapping.ts` | `/mapping/vendors-with-customers` | Vendor→customer tree |
| `audit.ts` | `/audit-log`, `/backup` | Activity log with pagination |

### Key Business Logic Locations

| Logic | File | Function/Section |
|---|---|---|
| Barcode range generation | `server/utils/barcode.ts` | `generateBarcodesFromPrefix()` |
| Barcode overlap prevention | `server/utils/barcode.ts` | `barcodeExists()` + `getMaxBarcodeNumber()` |
| Sale processing (warranty + rewards + customer) | `server/routes/sales.ts` | `POST /api/sales` transaction block |
| Distribution with discount + GST | `server/routes/distribution.ts` | `POST /api/distribution` |
| Vendor payment tracking | `server/routes/finance.ts` | Uses `billed_price` for total owed |
| Tenant provisioning | `server/utils/tenant.ts` | `provisionTenant()` |
| Plan enforcement | Check `plans.features` and `plans.max_*` in route handlers |

---

## Frontend — Component by Component

### App.tsx — Routing Logic

```
1. Check sessionStorage for 'auth_token'
2. Decode JWT payload (base64, no library)
3. If role === 'super_admin' → render SuperAdminApp
4. If tenantId exists → render tenant ERP (sidebar + views)
5. If no token → render LoginScreen
```

### State Management

No Redux/Zustand — state is managed per-component:
- **User state**: `useState` in App.tsx, passed as props
- **Feature state**: each view has its own `useState` + `useEffect` for API calls
- **Session**: `sessionStorage` for auth_token, tenant_id, user object
- **Toast notifications**: React Context (`ToastProvider` in `components/ui/Toast.tsx`)

### API Client (`src/api.ts`)

Single file with ALL API methods organized by feature:

```typescript
export const api = {
  products: { list, create, update, delete, addStock, getByBarcode },
  sales: { validate, create, list, getBill },
  distribution: { list, create, summary, getBill, applyBilling },
  warranties: { list, create, update, delete },
  // ... etc
  superAdmin: { login, dashboard, tenants: { list, create, get, update, delete }, plans: { ... } },
}
```

### Shared UI Components (`src/components/ui/`)

| Component | File | Usage |
|---|---|---|
| `ToastProvider` / `useToast` | `Toast.tsx` | Wrap app, call `toast('message', 'success')` |
| `LoadingSpinner` | `LoadingSpinner.tsx` | `<LoadingSpinner />` in loading states |
| `DateRangeFilter` | `DateRangeFilter.tsx` | Today/Week/Month/Custom date picker |
| `PaginationControls` | `Pagination.tsx` | Prev/Next with page numbers |

### Bill Templates (`src/lib/billTemplates.ts`)

Two functions that return complete HTML strings:

```typescript
generateSalesInvoiceHtml(bill, { showGst: true })    // Customer invoice
generateDistributionChallanHtml(bill, { showGst: true })  // Vendor challan
```

Both accept `showGst` option — when false, hides GSTIN, HSN, CGST/SGST.

### Feature Toggle System

Three toggles in Settings (stored on admin user in DB):

| Toggle | DB Column | Effect when OFF |
|---|---|---|
| `warrantyEnabled` | `users.warranty_enabled` | Hides Warranty tab, skips warranty creation on sale |
| `replacementEnabled` | `users.replacement_enabled` | Hides Replacements tab |
| `rewardsEnabled` | `users.rewards_enabled` | Hides Rewards tab, skips point earning on sale |

Checked in `App.tsx` for nav visibility and in `server/routes/sales.ts` for business logic.

---

## Common Tasks (How-To)

### Change Super Admin Credentials

```bash
# Option 1: Change in .env (applied on next fresh DB setup)
SUPER_ADMIN_EMAIL=newemail@domain.com
SUPER_ADMIN_PASSWORD=newpassword123

# Option 2: Update existing super admin directly in PostgreSQL
psql splendor_erp
UPDATE super_admins SET email = 'new@email.com' WHERE id = 'SA1';
# For password, generate bcrypt hash first:
# node -e "console.log(require('bcrypt').hashSync('newpassword', 10))"
UPDATE super_admins SET password_hash = '$2b$10$...' WHERE id = 'SA1';
```

### Change a Tenant Admin's Password

```sql
-- Find the user
SELECT id, email, name FROM users WHERE email = 'admin@company.com';

-- Update password (generate hash first)
-- node -e "console.log(require('bcrypt').hashSync('newpassword', 10))"
UPDATE users SET password_hash = '$2b$10$...' WHERE email = 'admin@company.com';
```

Or use the Change Password feature in Settings (requires current password).

### Add a New API Endpoint

1. **Create or edit route file** in `server/routes/{feature}.ts`
2. **Follow the pattern**:
   ```typescript
   router.get('/api/new-endpoint', async (req, res) => {
     try {
       const tenantId = req.headers['x-tenant-id'] as string;
       if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
       // Your logic with pool.query()
       res.json({ data });
     } catch (err) {
       res.status(500).json({ error: String(err) });
     }
   });
   ```
3. **Add to API client** in `src/api.ts`
4. **Use in a component** — import from `../../api`

### Add a New Database Column

```typescript
// In server/pg-db.ts → initSchema() function, add to the CREATE TABLE
// OR add an ALTER TABLE at the end:
await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS new_field TEXT');
```

Restart the server — the column is added automatically.

### Add a New Feature Toggle

1. **DB**: Add column in `pg-db.ts` schema: `new_feature_enabled BOOLEAN DEFAULT true`
2. **Server**: Add to auth.ts login/profile responses
3. **Frontend**: Check in `App.tsx` nav items and in the relevant route handler
4. **Settings UI**: Add toggle in `SettingsView.tsx` Feature Toggles section

### Add a New Subscription Plan

Via super admin UI → Plans → Create Plan. Or directly:

```sql
INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly)
VALUES ('CUSTOM', 'Custom Plan', 200, 10, 5, 2000, '{"warranty":true,"rewards":true}', 1999, 19999);
```

### Create a Tenant Manually (via SQL)

```typescript
// Use the provisionTenant function:
import { provisionTenant } from './server/utils/tenant';

await provisionTenant({
  companyName: 'New Company',
  adminEmail: 'admin@newcompany.com',
  adminName: 'Admin Name',
  adminPassword: 'secure123',
  planId: 'PRO',
});
```

Or via the super admin API:
```bash
curl -X POST http://localhost:3001/api/super-admin/tenants \
  -H "Authorization: Bearer {super_admin_token}" \
  -H "Content-Type: application/json" \
  -d '{"companyName":"New Co","adminEmail":"admin@new.com","adminName":"Admin","planId":"PRO"}'
```

### Add a New Chatbot Command

Edit `server/routes/chatbot.ts`. Add a new regex match block:

```typescript
if (/your\s*pattern/.test(q)) {
  const result = await pool.query('SELECT ... WHERE tenant_id = $1', [tenantId]);
  return { text: `Your formatted response\n\n${result.rows.map(...)}` };
}
```

Place it BEFORE the vendor/customer fuzzy lookup section (at the bottom).

### Generate a Demo for a New Industry

1. Copy `server/demo/seed-demo.ts` → `server/demo/seed-{industry}.ts`
2. Change products, vendors, customers to match the industry
3. Add npm script in `package.json`: `"demo:{industry}": "tsx server/demo/clear-all.ts && tsx server/demo/seed-{industry}.ts"`
4. Run: `npm run demo:{industry}`

---

## Adding New Features

### Adding a New Feature Module (e.g., "Purchase Orders")

**Server side:**
1. Create `server/routes/purchase-orders.ts`
2. Define PostgreSQL table in `server/pg-db.ts` (with `tenant_id`)
3. Import and mount in `server/index.ts`

**Frontend side:**
4. Create `src/features/purchase-orders/PurchaseOrdersView.tsx`
5. Add to `src/types.ts`: update `Tab` type, add interfaces
6. Add API methods in `src/api.ts`
7. Add nav item in `src/App.tsx` navItems array
8. Add route rendering in `src/App.tsx` main content section

### Adding a New Role

1. Add role string to `canAccess()` in `src/App.tsx`
2. Add role option in Settings → User Management → Add User form
3. Define which tabs the role can access

### Adding Plan Enforcement to a Route

```typescript
router.post('/api/products', async (req, res) => {
  const tenantId = req.headers['x-tenant-id'] as string;

  // Check plan limits
  const tenant = (await pool.query('SELECT plan_id FROM tenants WHERE id = $1', [tenantId])).rows[0];
  const plan = (await pool.query('SELECT * FROM plans WHERE id = $1', [tenant.plan_id])).rows[0];
  if (plan.max_products !== -1) {
    const count = (await pool.query('SELECT COUNT(*) as c FROM products WHERE tenant_id = $1', [tenantId])).rows[0].c;
    if (count >= plan.max_products) {
      return res.status(403).json({ error: `Plan limit: max ${plan.max_products} products. Upgrade your plan.` });
    }
  }
  // ... create product
});
```

---

## Troubleshooting

### "Tenant ID required" error
The frontend isn't sending the `X-Tenant-ID` header. Check:
- Is `tenant_id` stored in `sessionStorage`?
- Is `api.ts` reading it correctly?
- Did the login response include `tenantId`?

### "Invalid or expired token" error
JWT token expired (default 7 days). Re-login to get a new token.

### Server won't start — "connection refused"
PostgreSQL isn't running. Start it:
- Postgres.app: click the app icon
- Homebrew: `brew services start postgresql@16`
- Check: `pg_isready -h localhost -p 5432`

### Database schema out of date
The schema auto-creates tables on startup. For new columns:
```sql
ALTER TABLE table_name ADD COLUMN IF NOT EXISTS new_column TYPE;
```

### Data not showing for a tenant
Check the tenant's `status` in the `tenants` table. Must be `'active'` or `'trial'`.
```sql
SELECT id, company_name, status FROM tenants;
UPDATE tenants SET status = 'active' WHERE id = 'T...';
```

### Frontend caching old code
Clear Vite cache: `rm -rf node_modules/.vite`
Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R`

### Port already in use
```bash
kill $(lsof -ti :3001)  # Kill API server
kill $(lsof -ti :3000)  # Kill dev server
```

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | `postgresql://postgres:1234@localhost:5432/splendor_erp` | PostgreSQL connection string |
| `JWT_SECRET` | Yes | (hardcoded fallback) | Secret key for JWT signing. **Change in production!** |
| `JWT_EXPIRES_IN` | No | `7d` | Token expiry duration |
| `SUPER_ADMIN_EMAIL` | No | `admin@spre.ai` | Platform owner email (created on first run) |
| `SUPER_ADMIN_PASSWORD` | No | `superadmin123` | Platform owner password (created on first run) |
| `PORT` | No | `3001` | API server port |

---

## Deployment

### Production Build

```bash
npm run build          # Builds frontend to dist/
npm start              # Serves dist/ + API from one server
```

### Cloud Deployment Checklist

1. **PostgreSQL**: Use managed DB (Supabase, AWS RDS, Railway, Render)
2. **Environment**: Set `DATABASE_URL`, `JWT_SECRET` (use a strong random string)
3. **HTTPS**: Required for JWT security — use platform's built-in SSL
4. **CORS**: Update `server/index.ts` if frontend is on a different domain
5. **Monitoring**: Check `audit_log` table for activity
6. **Backups**: Use `pg_dump` for PostgreSQL backups

### Docker (optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ dist/
COPY server/ server/
ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "dist/server/index.js"]
```

### Recommended Cloud Platforms

| Platform | PostgreSQL | Cost |
|---|---|---|
| Railway | Built-in | From $5/mo |
| Render | Built-in | Free tier available |
| Supabase | Managed PostgreSQL | Free tier (500MB) |
| AWS (EC2 + RDS) | Managed | From $15/mo |
| DigitalOcean (App Platform) | Managed | From $7/mo |

---

## Code Style & Conventions

- **TypeScript strict** — all files are `.ts` / `.tsx`
- **No comments unless non-obvious** — code should be self-documenting
- **Named exports** — `export function ComponentName()`, not default exports (except route modules)
- **Feature folders** — each feature in its own directory under `src/features/`
- **One route file per domain** — `server/routes/products.ts`, not mixed
- **Async/await** — all database calls are async (PostgreSQL)
- **Error handling** — try/catch in every route handler, return `{ error: string }`
- **Tenant scoping** — EVERY query MUST include `tenant_id`
- **No raw SQL interpolation** — always use `$1, $2` parameterized queries

---

*Last updated: June 2026*
*Built with Claude Code (Anthropic)*
