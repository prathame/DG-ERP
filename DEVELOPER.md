# Developer Guide — DG ERP Management

Complete technical reference for developers working on this codebase.

---

## Table of Contents

1. [Quick Reference](#quick-reference)
2. [Architecture Overview](#architecture-overview)
3. [Database](#database)
4. [Authentication](#authentication)
5. [Server — Route by Route](#server--route-by-route)
6. [Frontend — Component by Component](#frontend--component-by-component)
7. [Bill Customization System](#bill-customization-system)
8. [Dark / Light Mode](#dark--light-mode)
9. [Common Tasks (How-To)](#common-tasks-how-to)
10. [Adding New Features](#adding-new-features)
11. [Troubleshooting](#troubleshooting)
12. [Environment Variables](#environment-variables)
13. [Deployment](#deployment)

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
| App routing (JWT + URL slug) | `src/App.tsx` |
| Landing page (company website) | `src/components/layout/LandingPage.tsx` |
| Tenant login screen (branded) | `src/components/layout/LoginScreen.tsx` |
| Tenant slug lookup (public) | `server/routes/super-admin.ts` → `GET /api/tenant/by-slug/:slug` |
| Super admin login | `src/features/super-admin/SuperAdminLogin.tsx` |
| Super admin UI | `src/features/super-admin/` |
| Bill HTML templates | `src/lib/billTemplates.ts` |
| Bill customization API | `server/routes/bill-settings.ts` |
| Bill customization UI | `src/features/settings/SettingsView.tsx` → `BillCustomizationSection` |
| Chatbot engine | `server/routes/chatbot.ts` |
| Security middleware | `server/index.ts` → helmet, rate limiting, CORS |
| Logger (console + Logtail) | `server/utils/logger.ts` |
| Audit log helper | `server/utils/helpers.ts` → `logAudit()` |
| Super admin audit UI | `src/features/super-admin/SuperAdminAuditLog.tsx` |
| Super admin billing | `src/features/super-admin/SuperAdminBilling.tsx` |
| HTML escaping (XSS) | `src/lib/billTemplates.ts` → `esc()` function |
| PWA manifest | `public/manifest.json` |
| Service worker | `public/sw.js` |
| Offline page | `public/offline.html` |
| App icons | `public/icons/icon-192.svg`, `icon-512.svg` |
| Dark mode CSS | `src/index.css` (html.dark rules) |
| Language translations | `src/i18n/en.json`, `hi.json`, `gu.json` |
| Language context + hook | `src/i18n/index.tsx` → `LanguageProvider`, `useTranslation` |
| Theme types | `src/types.ts` → `BillSettings` |
| Demo data scripts | `server/demo/` |

### Default Credentials

| Role | URL | Email | Password | Where to Change |
|---|---|---|---|---|
| Super Admin | `/admin` | `admin@spre.ai` | `superadmin123` | `.env` → `SUPER_ADMIN_EMAIL` / `PASSWORD` |
| Tenant Admin | `/{slug}` | Per tenant | Auto-generated | Created by super admin only |

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

### URL-Based Routing

```
/              → Landing page (company website with features, pricing, enquiry form)
/{slug}        → Branded tenant login (e.g., /splendor-pump-llp)
/admin         → Super admin portal (completely separate)
/invalid-slug  → "Company Not Found" page
```

Routing logic in `App.tsx`:
```
1. Apply saved theme (dark/light) from sessionStorage
2. Parse pathname: detect /admin or /{slug}
3. If /admin:
   - If has super_admin JWT → render SuperAdminApp
   - Else → render SuperAdminLogin
4. If super_admin JWT but NOT on /admin → redirect to /admin
5. If /{slug} detected and no user session:
   - Fetch tenant branding via GET /api/tenant/by-slug/{slug}
   - If found → show branded LoginScreen (logo, color, tagline)
   - If not found → show "Company Not Found" page
6. If no slug and no user → render LandingPage (company website)
7. If user session → render tenant ERP, URL set to /{slug}
8. On logout → stay on /{slug} (branded login page)
```

### Multi-Tenant Data Flow

```
1. User logs in → POST /api/auth/login
2. Server finds user across all tenants (JOIN users + tenants)
3. Returns JWT token containing { userId, tenantId, role, email }
4. Frontend stores token in sessionStorage (per-tab isolation)
5. Every API call includes:
   - Authorization: Bearer {token}
   - X-Tenant-ID: {tenantId}
6. Server middleware validates JWT, extracts tenantId
7. Every SQL query includes: WHERE tenant_id = $1
```

### Tenant Branding Flow

```
1. Login page at /{slug} shows tenant logo, accent color, tagline
2. Sidebar shows user.companyName (not "DG ERP")
3. Browser tab: "{CompanyName} — DG ERP"
4. Bills use tenant's company name + custom logo/colors from bill_settings
5. WhatsApp messages use tenant's company name
6. Small "Powered by DG ERP" in sidebar footer + bill footers + login page
```

### File Organization

```
server/
  pg-db.ts              ← Database connection (ONE file, import everywhere)
  middleware/auth.ts     ← JWT validation (used by route mounting)
  utils/                ← Shared logic (barcode, pagination, audit)
  routes/               ← One file per feature (22 route files)

src/
  App.tsx               ← URL + JWT routing (/admin vs tenant)
  api.ts                ← All API calls (ONE file, import everywhere)
  types.ts              ← All TypeScript interfaces
  index.css             ← Theme CSS (light + dark mode overrides)
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
  max: 20,
});
```

All routes import: `import { pool } from '../pg-db';`

Body limit set to 2MB in `server/index.ts` for base64 image uploads (logo, signature).

### Schema (23 Tables)

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
| `bill_settings` | Per-tenant bill customization | tenant_id (PK), logo_base64, primary_color, bank details, signatory, toggles |

### bill_settings Table Detail

```sql
CREATE TABLE IF NOT EXISTS bill_settings (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  logo_base64 TEXT,                          -- data:image/png;base64,...
  primary_color TEXT DEFAULT '#F27D26',      -- hex color
  tagline TEXT,                              -- subtitle on bills
  invoice_prefix TEXT,                       -- e.g. 'SPL-INV-'
  challan_prefix TEXT,                       -- e.g. 'SPL-CH-'
  bank_account_name TEXT,
  bank_account_number TEXT,
  bank_name TEXT,
  bank_branch TEXT,
  bank_ifsc TEXT,
  bank_upi_id TEXT,
  terms_and_conditions TEXT,                 -- max 2000 chars
  signatory_name TEXT,
  signatory_designation TEXT,
  signature_base64 TEXT,                     -- data:image/png;base64,...
  show_rewards BOOLEAN DEFAULT true,
  show_barcode BOOLEAN DEFAULT true,
  show_warranty BOOLEAN DEFAULT true,
  footer_text TEXT DEFAULT 'Powered by DG ERP Management',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

One row per tenant. Images stored as base64 data URLs (max ~500KB each).

### Query Pattern

Every tenant query MUST include `tenant_id`:

```typescript
// Correct
const { rows } = await pool.query(
  'SELECT * FROM products WHERE tenant_id = $1 AND name LIKE $2',
  [tenantId, `%${search}%`]
);

// WRONG — exposes all tenants' data
const { rows } = await pool.query('SELECT * FROM products WHERE name LIKE $1', [`%${search}%`]);
```

### Migrations

Schema is auto-created on server startup via `initSchema()` in `pg-db.ts`. To add a new column:

```typescript
// In pg-db.ts initSchema(), add to CREATE TABLE or use ALTER:
await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS new_field TEXT');
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

### Middleware Usage

```typescript
import { authMiddleware, superAdminMiddleware, AuthRequest } from '../middleware/auth';

// Protect tenant routes — always use req.tenantId from JWT, never x-tenant-id header
router.get('/api/products', authMiddleware, async (req: AuthRequest, res) => {
  const tenantId = req.tenantId; // From JWT, not header
});

// Protect super admin routes
router.get('/api/super-admin/tenants', superAdminMiddleware, async (req, res) => {});

// Profile routes must verify userId matches JWT
router.get('/api/settings/profile', authMiddleware, async (req: AuthRequest, res) => {
  if (req.query.userId !== req.user?.userId) return res.status(403).json({ error: 'Access denied' });
});
```

### Security Middleware Stack

```
Request → Helmet (security headers) → CORS check → Rate limiter → Auth middleware → Route handler
```

- **Helmet**: X-Content-Type-Options, X-Frame-Options, HSTS, etc.
- **Rate Limiting**: Login (10/15min), Password change (5/15min)
- **CORS**: Whitelist via `ALLOWED_ORIGINS` env var (permissive in dev, strict in production)
- **Auth**: JWT verification with HS256 algorithm pinning

### Password Reset Flow

```
1. User clicks "Forgot Password?" on login page
2. Enters email → POST /api/auth/forgot-password
3. Server generates a secure token (crypto.randomBytes, 1hr expiry)
4. Token stored in password_reset_tokens table
5. Admin shares the token with the user (via WhatsApp/email)
6. User clicks "Have a reset token?" on login page
7. Pastes token + enters new password → POST /api/auth/reset-password
8. Server validates token, updates password, marks token as used
```

**Admin can also reset directly:**
```
PUT /api/admin/reset-user-password
Body: { userId: "U...", newPassword: "newpass123" }
```

### Frontend Token Handling

```typescript
// src/api.ts — automatically adds headers to every request
const token = sessionStorage.getItem('auth_token');
const tenantId = sessionStorage.getItem('tenant_id');

headers: {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${token}`,
  'X-Tenant-ID': tenantId,
}
```

Session per-tab: uses `sessionStorage` (not `localStorage`) so multiple tabs can be logged into different accounts.

---

## Server — Route by Route

### Route File Template

```typescript
import { Router } from 'express';
import { pool } from '../pg-db';
const router = Router();

router.get('/api/resource', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query('SELECT * FROM resource WHERE tenant_id = $1', [tenantId]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
```

### Route Reference (22 files)

| File | Routes | Notes |
|---|---|---|
| `super-admin.ts` | `/api/super-admin/*`, `/api/tenant/register`, `/api/tenant/by-slug/:slug`, `/api/super-admin/billing` | No tenant_id; billing CRUD for subscription invoices |
| `auth.ts` | `/api/auth/login`, `/api/auth/signup`, `/api/settings/*` | Login searches across tenants |
| `bill-settings.ts` | `GET/PUT /api/settings/bill` | Per-tenant bill customization (logo, colors, bank, signatory) |
| `products.ts` | CRUD + `/add-stock`, `/by-barcode/:barcode` | Barcode range generation |
| `sales.ts` | `/validate/:barcode`, CRUD, `/:id/bill` | Auto-creates warranty + rewards; bill includes `billSettings` |
| `distribution.ts` | CRUD + `/summary`, `/bill`, `/apply-billing` | Spreadsheet-style; bill includes `billSettings` |
| `warranties.ts` | CRUD with status auto-expiry | Checks `warranty_applicable` flag |
| `replacements.ts` | CRUD + barcode validation | Old→new barcode swap |
| `transactions.ts` | CRUD with date filters + pagination | Income/expense totals |
| `rewards.ts` | CRUD + `/balance`, reward rules, redemption | Vendor-scoped points |
| `customers.ts` | CRUD + purchases + vendor mapping | Linked to vendors |
| `vendors.ts` | CRUD + auto-creates vendor login user | Password: `{name}@123` |
| `banks.ts` | CRUD | Simple master data |
| `finance.ts` | `/vendor-finance/summary`, payments, reminders | **Critical**: static routes before `:vendorId` param |
| `admin.ts` | User management | Admin-only, role/permission CRUD |
| `dashboard.ts` | `/stats`, `/rewards-summary` | KPIs + stats |
| `search.ts` | `/search?q=` | Searches products, customers, vendors, barcodes |
| `notifications.ts` | `/notifications` | Low stock, expiring warranties, pending payments |
| `chatbot.ts` | `/chatbot`, `/chatbot/quick-actions` | 30+ queries, label-aware responses, dynamic quick actions |
| `masters.ts` | `/masters/counts` | Aggregate counts |
| `mapping.ts` | `/mapping/vendors-with-customers` | Vendor→customer tree |
| `audit.ts` | `/audit-log`, `/backup` | Activity log with pagination |

### Key Business Logic Locations

| Logic | File | Function/Section |
|---|---|---|
| Barcode range generation | `server/utils/barcode.ts` | `generateBarcodesFromPrefix()` |
| Barcode overlap prevention | `server/utils/barcode.ts` | `barcodeExists()` + `getMaxBarcodeNumber()` |
| Sale processing (warranty + rewards) | `server/routes/sales.ts` | `POST /api/sales` transaction block |
| Distribution with discount + GST | `server/routes/distribution.ts` | `POST /api/distribution` |
| Bill data with billSettings | `server/routes/sales.ts` line ~203, `distribution.ts` line ~453 | Queries `bill_settings` table |
| Vendor payment tracking | `server/routes/finance.ts` | Uses `billed_price` for total owed |
| Tenant provisioning | `server/utils/tenant.ts` | `provisionTenant()` |
| Bill customization UPSERT | `server/routes/bill-settings.ts` | `PUT /api/settings/bill` |

---

## Frontend — Component by Component

### App.tsx — Routing Logic

```
1. Apply saved theme (dark/light) from sessionStorage
2. Parse pathname → detect /admin or /{slug}
3. If /admin → super admin flow (login or app)
4. If super_admin token but NOT on /admin → redirect to /admin
5. If /{slug} and no user → fetch tenant branding, show branded login
6. If /{slug} not found → "Company Not Found" page
7. If no user and no slug → generic DG ERP login
8. If user → tenant ERP, sidebar shows user.companyName, URL = /{slug}
9. Browser tab title: "{CompanyName} — DG ERP"
10. On logout → stay on /{slug} for branded login page
```

### State Management

No Redux/Zustand — state is managed per-component:
- **User state**: `useState` in App.tsx, passed as props
- **Feature state**: each view has its own `useState` + `useEffect` for API calls
- **Session**: `sessionStorage` for auth_token, tenant_id, user object, theme
- **Toast notifications**: React Context (`ToastProvider`)

### API Client (`src/api.ts`)

Single file with ALL API methods organized by feature:

```typescript
export const api = {
  products: { list, create, update, delete, addStock, getByBarcode },
  sales: { validate, create, list, getBill },
  distribution: { list, create, summary, getBill, applyBilling },
  settings: { getProfile, updateProfile, changePassword, getBillSettings, updateBillSettings },
  superAdmin: { login, dashboard, tenants: { list, create, get, update, delete }, plans: { ... } },
  // ... etc
}
```

### Bill Templates (`src/lib/billTemplates.ts`)

Two functions that return complete HTML strings with full customization:

```typescript
generateSalesInvoiceHtml(bill, { showGst: true })
generateDistributionChallanHtml(bill, { showGst: true, fullyPaid: false })
```

Both read `bill.billSettings` (injected by the server from `bill_settings` table) and apply:
- Custom logo (base64 `<img>` or letter-icon fallback)
- Custom accent color (replaces `#F27D26` throughout CSS)
- Tagline under company name
- Invoice/challan number prefix
- Bank details section (conditional)
- Terms & conditions (conditional)
- Authorized signatory with optional signature image
- Show/hide toggles for barcode, warranty, rewards columns
- Custom footer text

---

## Bill Customization System

### Data Flow

```
1. Admin saves bill settings in Settings → Bill Customization
2. Frontend sends PUT /api/settings/bill with JSON body (including base64 images)
3. Server validates + UPSERTS into bill_settings table
4. When any user prints a bill:
   a. Frontend calls GET /api/sales/:id/bill (or /api/distribution/bill)
   b. Server queries bill_settings for the tenant
   c. Returns bill data with billSettings field
   d. Frontend passes to generateSalesInvoiceHtml() / generateDistributionChallanHtml()
   e. Template applies all customizations
```

### Image Upload (No Multer)

Images are uploaded as base64 strings via regular JSON — no FormData needed.

Frontend:
```typescript
const reader = new FileReader();
reader.onload = () => setForm(prev => ({ ...prev, logoBase64: reader.result as string }));
reader.readAsDataURL(file);
```

Server validates:
```typescript
if (b.logoBase64 && (!b.logoBase64.startsWith('data:image/') || b.logoBase64.length > 700_000)) {
  return res.status(400).json({ error: 'Logo must be a valid image under 500KB' });
}
```

Express body limit: `express.json({ limit: '2mb' })` in `server/index.ts`.

### Preview

The Settings UI has a "Preview" button that generates a sample invoice HTML with current form values and opens it in a popup window, letting admins see changes before saving.

---

## Dark / Light Mode

### How It Works

```
1. CSS class `dark` on <html> element toggles dark theme
2. src/index.css defines html.dark overrides for all Tailwind utility classes
3. Theme is saved in sessionStorage('dg_erp_theme')
4. App.tsx applies saved theme on page load (before render)
5. Toggle in Settings → Appearance
```

### CSS Strategy

Dark mode uses `!important` overrides on Tailwind classes:

```css
html.dark .bg-white { background-color: #1F2937 !important; }
html.dark .text-gray-700 { color: #E5E7EB !important; }
html.dark input, html.dark select, html.dark textarea {
  background-color: #374151 !important;
  color: #E5E7EB !important;
  border-color: #4B5563 !important;
}
```

### Adding Dark Mode Support to New Components

No action needed for most components — the CSS overrides target Tailwind classes globally. If a new component uses a hardcoded color not covered:

```css
/* Add to src/index.css */
html.dark .your-new-class { background-color: #1F2937 !important; }
```

---

## Multi-Language (i18n)

### How It Works

```
1. Translation JSON files in src/i18n/ (en.json, hi.json, gu.json)
2. LanguageProvider wraps the app in main.tsx
3. Components use useTranslation() hook → t('nav.dashboard') returns translated string
4. Language stored in sessionStorage('dg_erp_lang')
5. Selector in Settings → Appearance
```

### Supported Languages

| Code | Language | Native |
|---|---|---|
| `en` | English | English |
| `hi` | Hindi | हिन्दी |
| `gu` | Gujarati | ગુજરાતી |

### Adding a New Language

1. Copy `src/i18n/en.json` → `src/i18n/{code}.json`
2. Translate all values (keep keys identical)
3. Update `src/i18n/index.tsx`:
   - Add `import {code} from './{code}.json';`
   - Add to `Lang` type: `'en' | 'hi' | 'gu' | '{code}'`
   - Add to `translations` object
   - Add to `LANGUAGES` array: `{ code: '{code}', label: 'Name', nativeLabel: 'NativeName' }`
   - Add to `getStoredLang()` check

### Using Translations in Components

```typescript
import { useTranslation } from '../../i18n';

function MyComponent() {
  const { t, lang, setLang } = useTranslation();
  return <h1>{t('nav.dashboard')}</h1>; // "Dashboard" or "डैशबोर्ड" or "ડેશબોર્ડ"
}
```

Keys are dot-separated paths into the JSON: `t('settings.darkMode')` → `settings.darkMode` in the JSON file.

---

## Logging & Audit

### Audit Log (Business Actions)

All critical actions are logged to the `audit_log` DB table via `logAudit()`:

```typescript
import { logAudit } from '../utils/helpers';
await logAudit(pool, tenantId, 'CREATE', 'product', productId, 'Product created: Pump 5HP', userId, userName);
```

**Actions tracked:**

| Action | Entity | Where |
|---|---|---|
| CREATE/UPDATE/DELETE | tenant | `super-admin.ts` |
| IMPERSONATE | tenant | `super-admin.ts` |
| LOGIN | user | `auth.ts` |
| PASSWORD_CHANGE | user | `auth.ts` |
| CREATE/DISTRIBUTE | product/sale/distribution | `sales.ts`, `distribution.ts` |
| PAYMENT | payment | `finance.ts` |

**Super Admin Audit View:** `/admin` → Audit Log tab — cross-tenant log viewer with:
- Search by details, user, entity
- Filter by action type (Create, Update, Delete, Login, Impersonate, etc.)
- Filter by entity type (Tenant, User, Product, Sale, etc.)
- Pagination (30 entries per page)

### System Logging (Better Stack Logtail)

Optional cloud logging via Better Stack (free 1GB/month):

```typescript
import { logger } from './utils/logger';
logger.info('Server started', { port: 3001 });
logger.error('Database connection failed', { error: 'timeout' });
```

**Setup:**
1. Sign up at **https://betterstack.com** (free)
2. Create Source → Node.js → Copy token
3. Set `LOGTAIL_TOKEN=your-token` in environment
4. Logs appear in Better Stack dashboard with search, filters, alerts

**Without token:** Everything logs to `console.log/error` only (Render's built-in viewer).

**What's logged where:**

| Event | DB (audit_log) | Console | Logtail |
|---|---|---|---|
| Business actions (CRUD) | Yes | Yes | Yes (if token set) |
| Login/password change | Yes | Yes | Yes |
| Server startup/shutdown | No | Yes | Yes |
| Unhandled errors | No | Yes | Yes |
| Request errors (500s) | No | Yes | Yes |

### Tenant Billing (Super Admin)

Super admin generates subscription invoices for tenants from `/admin` → Billing tab.

**DB Table:** `tenant_invoices`
```sql
id, tenant_id, invoice_number, period_start, period_end, plan_name,
amount, gst_amount, total, status (unpaid/paid), paid_at, notes, created_at
```

**API:**
```
GET    /api/super-admin/billing              — list invoices (filter: status, tenantId)
POST   /api/super-admin/billing              — create invoice { tenantId, amount, gstRate, periodStart, periodEnd, notes }
PUT    /api/super-admin/billing/:id/paid     — mark as paid
DELETE /api/super-admin/billing/:id          — delete invoice
```

**Invoice number format:** `DG-2026-123456` (auto-generated)

**Print:** Generates professional PDF with DG ERP branding, tenant name, plan, period, GST breakdown, total.

---

### Subscription Expiry

**How it works:**
```
Super admin creates invoice with Period End date
    → subscription_ends_at auto-set on tenant
    → Tenant dashboard shows expiry banner (15/7/0 days)
    → Login blocked after expiry
    → Super admin creates new invoice → tenant reactivated
```

**Expiry banner logic** (in `App.tsx`):
- `> 15 days` → no banner
- `8-15 days` → amber warning
- `1-7 days` → red warning
- `≤ 0 days` → full red bar, login also blocked

**Login check** (in `auth.ts`):
- Trial: checks `trial_ends_at` — blocks with "Trial has expired"
- Paid: checks `subscription_ends_at` — blocks with "Subscription has expired"

**DB column:** `tenants.subscription_ends_at TIMESTAMPTZ`

**To manually extend:** Super admin → Tenant Detail → update via API, or create a new invoice with new Period End.

---

### Adding Audit Logging to a New Route

```typescript
import { logAudit } from '../utils/helpers';

router.post('/api/new-thing', async (req, res) => {
  // ... create the thing ...
  await logAudit(pool, tenantId, 'CREATE', 'new-thing', id, `Created: ${name}`, userId, userName);
  res.status(201).json(result);
});
```

---

## Common Tasks (How-To)

### Change Super Admin Credentials

```bash
# Option 1: Change in .env (applied on next fresh DB setup)
SUPER_ADMIN_EMAIL=newemail@domain.com
SUPER_ADMIN_PASSWORD=newpassword123

# Option 2: Update directly in PostgreSQL
psql splendor_erp
# Generate bcrypt hash: node -e "console.log(require('bcrypt').hashSync('newpassword', 10))"
UPDATE super_admins SET password_hash = '$2b$10$...' WHERE id = 'SA1';
```

### Add a New API Endpoint

1. **Create or edit route file** in `server/routes/{feature}.ts`
2. **Follow the pattern**: get tenantId, validate, query with `$1` param, try/catch
3. **Register** in `server/index.ts`: import + `app.use(router)`
4. **Add to API client** in `src/api.ts`
5. **Use in a component**

### Add a New Database Table

1. Add `CREATE TABLE IF NOT EXISTS` to `server/pg-db.ts` → `initSchema()`
2. Include `tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
3. Add indexes: `CREATE INDEX IF NOT EXISTS idx_tablename_tenant ON tablename(tenant_id)`
4. Restart server — table is created automatically

### Add a New Database Column

```typescript
// In server/pg-db.ts → initSchema():
await client.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS new_field TEXT');
```

### Add a New Feature Toggle

1. **DB**: Add column in `pg-db.ts`: `new_feature_enabled BOOLEAN DEFAULT true`
2. **Server**: Add to auth.ts login/profile responses
3. **Frontend**: Check in `App.tsx` nav items
4. **Settings UI**: Add toggle in SettingsView.tsx Feature Toggles section

### Onboard a New Tenant

Tenants can only be created by the super admin. Two methods:

**Via Super Admin UI** (recommended):
1. Go to `/admin` → Login as super admin
2. Tenants → Create Tenant → Fill company name, admin email, phone, plan
3. Tenant gets a slug URL automatically (e.g., "New Company" → `/new-company`)
4. After creation, a credentials screen shows:
   - Login URL, Email, Password — each with a copy button
   - **WhatsApp button** — sends login URL + credentials to the tenant admin's phone
   - **Email button** — opens mailto: with pre-filled subject and credentials
5. Tenant admin logs in at `/{slug}` and changes password

**Via API**:
```bash
curl -X POST http://localhost:3001/api/tenant/register \
  -H "Authorization: Bearer {super_admin_token}" \
  -H "Content-Type: application/json" \
  -d '{"companyName":"New Co","adminEmail":"admin@new.com","adminName":"Admin","adminPassword":"secure123","planId":"PRO"}'
```

Response includes `slug`, `adminEmail`, `password` for sharing.

### Add a New Chatbot Command

Edit `server/routes/chatbot.ts`. Add a regex match block BEFORE the vendor/customer fuzzy lookup section:

```typescript
if (/your\s*pattern/.test(q)) {
  const result = await pool.query('SELECT ... WHERE tenant_id = $1', [tenantId]);
  return { text: `Your response\n\n${result.rows.map(...)}` };
}
```

### Add Bill Customization Fields

1. **DB**: Add column to `bill_settings` table in `pg-db.ts`
2. **Server**: Add to `bill-settings.ts` GET response mapping + PUT UPSERT query
3. **Types**: Add to `BillSettings` interface in `src/types.ts`
4. **Templates**: Use the field in `src/lib/billTemplates.ts` via the `s` object
5. **Settings UI**: Add input to `BillCustomizationSection` in SettingsView.tsx

### Generate a Demo for a New Industry

1. Copy `server/demo/seed-demo.ts` → `server/demo/seed-{industry}.ts`
2. Change products, vendors, customers to match the industry
3. Add npm script: `"demo:{industry}": "tsx server/demo/clear-all.ts && tsx server/demo/seed-{industry}.ts"`

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
2. Add role option in Settings → User Management
3. Define which tabs the role can access

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Server exits with "FATAL: JWT_SECRET required" | Set `JWT_SECRET` in `.env` file |
| Server exits with "DATABASE_URL required" | Set `DATABASE_URL` in `.env` file |
| "Tenant ID required" error | Check `sessionStorage` has `tenant_id`; check `api.ts` sends `X-Tenant-ID` header |
| "Invalid or expired token" | JWT expired (7 days). Re-login |
| "Too many login attempts" | Rate limited — wait 15 minutes or restart server |
| "Access denied" on profile | userId in request doesn't match JWT — re-login |
| "Invalid or expired reset token" | Token expired (1hr) or already used — generate a new one |
| User forgot password, no email | Admin generates reset token → shares via WhatsApp → user pastes on login page |
| Server won't start — "connection refused" | PostgreSQL not running. `pg_isready -h localhost -p 5432` to check |
| Super admin login page not showing at `/admin` | Vite dev server must be running; check `window.location.pathname` routing in App.tsx |
| Dark mode not applying | Check `html` element has class `dark`; check `sessionStorage` for `dg_erp_theme` |
| Logo/signature upload fails | Check file < 500KB; check `express.json({ limit: '2mb' })` in server/index.ts |
| Bill not showing custom settings | Verify `bill_settings` row exists for the tenant: `SELECT * FROM bill_settings WHERE tenant_id = 'T...'` |
| Frontend caching old code | Clear Vite cache: `rm -rf node_modules/.vite`; Hard refresh: `Cmd+Shift+R` |
| Port already in use | `kill $(lsof -ti :3001)` for API; `kill $(lsof -ti :3000)` for dev server |
| Finance tab empty | Check route ordering in `finance.ts` — static routes (`/reminders-due`) MUST come before `/:vendorId` |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | **Yes** | None — app exits without it | PostgreSQL connection string |
| `JWT_SECRET` | **Yes** | None — app exits without it | Secret key for JWT signing (min 32 chars) |
| `SUPER_ADMIN_EMAIL` | No | `admin@spre.ai` | Platform owner email (created on first run) |
| `SUPER_ADMIN_PASSWORD` | No | `superadmin123` | Platform owner password (created on first run) |
| `ALLOWED_ORIGINS` | No | `http://localhost:3000,3001` | Comma-separated CORS origins (strict in production) |
| `LOGTAIL_TOKEN` | No | None (console only) | Better Stack Logtail source token for cloud logging |
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
5. **Body Limit**: Already set to 2MB for image uploads
6. **Monitoring**: Check `audit_log` table for activity
7. **Backups**: Use `pg_dump` for PostgreSQL backups

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

## CI/CD Pipelines

5 GitHub Actions in `.github/workflows/`:

| File | Trigger | What it does |
|---|---|---|
| `lint.yml` | PR + push to main | TypeScript type check |
| `build.yml` | PR | Production build validation |
| `security.yml` | PR + push to main | npm audit, secret detection, XSS check, esc() verification |
| `test.yml` | PR | 190 API tests with PostgreSQL service container |
| `pr-check.yml` | PR | Combined quality gate (lint + build + security + bundle size) |

**Branch protection:** All checks must pass before merging to `main`. Owner can bypass.

### Running tests locally

```bash
npm test              # Run all 190 tests once
npm run test:watch    # Watch mode — re-runs on file change
```

Tests use a real PostgreSQL database. Set `DATABASE_URL` in `.env` or it defaults to `splendor_erp_test`.

### Adding a new test

1. Create `tests/api/{feature}.test.ts`
2. Import helpers: `import { pool, createTestToken, cleanupTestData } from '../helpers';`
3. Use `beforeAll` to create test data, `afterAll` to clean up
4. Use unique tenant IDs (e.g., `T-TEST-MYFEATURE`) to avoid conflicts

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData } from '../helpers';

const TEST_TENANT = 'T-TEST-MYFEATURE';

describe('MyFeature', () => {
  beforeAll(async () => {
    await cleanupTestData(TEST_TENANT);
    await pool.query(`INSERT INTO tenants (...) VALUES (...)`);
  });
  afterAll(async () => { await cleanupTestData(TEST_TENANT); });

  it('should do something', async () => {
    const { rows } = await pool.query('SELECT ...');
    expect(rows.length).toBeGreaterThan(0);
  });
});
```

---

## Manual Test Cases

214 manual test cases in `tests/cases/` — one file per feature. See [tests/cases/README.md](tests/cases/README.md) for the full index.

Run through all critical manual test cases before any production deployment:
1. `tests/cases/security.md` — XSS, SQL injection, tenant isolation, JWT
2. `tests/cases/cross-tenant.md` — Data isolation between tenants
3. `tests/cases/auth-login.md` — Login, forgot password, rate limiting
4. `tests/cases/super-admin.md` — Tenant CRUD, toggles, impersonation

---

## Tab Customization

Per-tenant tab renaming and visibility via `tab_config` JSONB column on `tenants` table.

### How it works
1. Super admin sets `tab_config` per tenant (Tab Customization section in tenant detail)
2. Login response includes `tabConfig` — frontend renders custom labels and hides toggled-off tabs
3. Chatbot reads `tab_config` to use custom labels in responses and route queries correctly
4. Backend routes, DB columns, API paths are **never renamed** — only display labels change

### Key rule
When chatbot receives "sales today" and the tenant's `sales` tab is OFF but `distribution` is labeled "Sales", the chatbot queries `product_distribution` instead of `product_sales`. This is handled by `resolveFeature()` in `chatbot.ts`.

### Dashboard and Settings
Always visible (locked ON in the UI). Cannot be hidden.

---

## Performance

### Database
- **Batch barcode insert**: 1000 barcodes in 2 queries instead of 6000 (100x faster)
- **27 indexes** on frequently queried columns (sales date, distribution date, vendor payments, audit action, inventory product)
- **Connection pool**: 10 connections in production, 20 in dev, 10s connection timeout, auto-SSL for cloud databases

### Server
- **Gzip compression**: All API responses compressed ~70% smaller via `compression` middleware
- **Helmet**: Security headers with minimal overhead

### Frontend
- **Code splitting**: Main bundle split into 3 chunks:
  - `index.js` — app UI, loads first
  - `scanner.js` — html5-qrcode + JsBarcode, loads only when scanning/printing
  - `motion.js` — Framer Motion, loads on animations
- **Debounced search**: 250ms debounce on all search inputs to reduce API calls
- **No product images**: Removed placeholder images for faster mobile load

### Variable Naming
Meaningful variable names used throughout (ERP/finance context):
- `userConfig` (not `ux`) — user feature flags
- `billConfig` (not `s`) — bill customization settings
- `requestBody` (not `b`) — API request body data
- `queryText` (not `q`) — search/chatbot input

---

## Code Style & Conventions

- **TypeScript strict** — all files are `.ts` / `.tsx`
- **No comments unless non-obvious** — code should be self-documenting
- **Named exports** — except route modules (default export)
- **Feature folders** — `src/features/{name}/`
- **One route file per domain** — `server/routes/{feature}.ts`
- **Async/await** — all database calls
- **Error handling** — try/catch in every route handler
- **Tenant scoping** — EVERY query MUST include `tenant_id`
- **No raw SQL interpolation** — always `$1, $2` parameterized queries
- **HTML escape user input** — use `esc()` in bill templates, no `dangerouslySetInnerHTML`
- **No hardcoded secrets** — all secrets via environment variables, no fallbacks
- **Auth on all routes** — use `authMiddleware` + verify `req.user.userId` on sensitive endpoints
- **Check feature toggles** — read `barcodeSystemEnabled` from sessionStorage before showing scanner/label features
- **Base64 for images** — no file system storage, no multer
- **sessionStorage** — not localStorage (per-tab isolation)
- **PWA** — manifest.json + service worker for installable web app

---

*Last updated: June 2025*
*Platform: DG ERP Management*
*Built with Claude Code (Anthropic)*
