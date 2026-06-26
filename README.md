# DG ERP Management — Multi-Tenant SaaS Platform

Industry-agnostic ERP for Inventory, Sales, Distribution, Warranty & Rewards Management. Built as a multi-tenant SaaS — onboard unlimited companies, each with fully isolated data and customizable branding.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Framer Motion + Recharts
- **Backend**: Express.js + TypeScript + PostgreSQL (pg)
- **Auth**: JWT (jsonwebtoken, HS256) + bcrypt (12 rounds)
- **Security**: Helmet.js, rate limiting, CORS whitelist, XSS escaping
- **Build**: Vite 6
- **Theme**: Dark / Light mode with session persistence
- **i18n**: English, Hindi, Gujarati (JSON-based, zero dependencies)

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Web App     │     │  Mobile App  │     │  WhatsApp    │
│  (React)     │     │  (Future)    │     │  Chatbot     │
└──────┬───────┘     └──────┬───────┘     └──────┬───────┘
       └────────────┬───────┘────────────────────┘
                    │
            ┌───────▼────────┐
            │  Express API   │
            │  JWT Auth      │
            │  Tenant Scope  │
            └───────┬────────┘
                    │
            ┌───────▼────────┐
            │  PostgreSQL    │
            │  tenant_id     │
            │  row-level     │
            └────────────────┘
```

### User Hierarchy

```
DG ERP Platform Owner (Super Admin) — /admin
├── Tenant 1: Splendor Pump LLP — /splendor-pump-llp
│   ├── Admin → Vendors → Staff
│   └── Isolated data + custom bill branding
├── Tenant 2: Radhe Krishan Jewellers — /radhe-krishan-jewellers
│   ├── Admin → Vendors → Staff
│   └── Isolated data + custom bill branding
└── Tenant N: /{slug}
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+

### Installation

```bash
git clone <repo-url>
cd splender-inventry
npm install
```

### Database Setup

```bash
# Create PostgreSQL database
createdb splendor_erp

# Or via psql
psql -U postgres -c "CREATE DATABASE splendor_erp;"
```

### Environment Config

Create `.env` in the project root (never commit this file):

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/splendor_erp
JWT_SECRET=your-secret-key-minimum-32-characters-long
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=your_secure_password
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001
```

> **Required**: `DATABASE_URL` and `JWT_SECRET` must be set — the app will not start without them.

### Running

```bash
# Terminal 1 — API server (auto-creates tables + seeds plans on first run)
npm run server

# Terminal 2 — Frontend dev server
npm run dev
```

- Landing page: http://localhost:3000 (company website with features, pricing, enquiry form)
- Super admin: http://localhost:3000/admin
- Tenant login: http://localhost:3000/{slug} (e.g., `/splendor-pump-llp`)

### Default Logins

| Role | URL | Email | Password |
|---|---|---|---|
| Platform Owner | `/admin` | admin@spre.ai | superadmin123 |
| Tenant Admin | `/{slug}` | Created by super admin | Auto-generated |

## Project Structure

```
├── server/
│   ├── index.ts                 # Express setup, route mounting, PostgreSQL init
│   ├── pg-db.ts                 # PostgreSQL pool + schema (23 tables) + plan seeding
│   ├── middleware/
│   │   └── auth.ts              # JWT auth + super admin middleware
│   ├── utils/
│   │   ├── barcode.ts           # Barcode generation (async, pool-based)
│   │   ├── helpers.ts           # Pagination, date filter, audit log, bcrypt
│   │   └── tenant.ts            # Tenant provisioning + stats
│   ├── routes/
│   │   ├── super-admin.ts       # Platform owner: tenants, plans, analytics
│   │   ├── auth.ts              # JWT login, signup, profile, password
│   │   ├── bill-settings.ts     # Per-tenant bill customization (logo, colors, bank)
│   │   ├── products.ts          # Product CRUD + stock management
│   │   ├── sales.ts             # Sales + barcode validation + bill data
│   │   ├── distribution.ts      # Distribution + challan + batch operations
│   │   ├── warranties.ts        # Warranty lifecycle
│   │   ├── replacements.ts      # Replacement tracking
│   │   ├── transactions.ts      # Financial ledger
│   │   ├── rewards.ts           # Points + rules + redemption
│   │   ├── customers.ts         # Customer CRUD
│   │   ├── vendors.ts           # Vendor CRUD + auto-login creation
│   │   ├── banks.ts             # Bank accounts
│   │   ├── finance.ts           # Vendor payments + reminders
│   │   ├── admin.ts             # User management
│   │   ├── dashboard.ts         # Stats + KPIs
│   │   ├── search.ts            # Global instant search
│   │   ├── notifications.ts     # Alerts
│   │   ├── chatbot.ts           # ERP chatbot (30+ commands)
│   │   ├── masters.ts           # Master counts
│   │   ├── mapping.ts           # Vendor-customer mapping
│   │   └── audit.ts             # Activity log
│   └── demo/
│       ├── seed-demo.ts         # Pump manufacturing demo data
│       ├── seed-jewellery.ts    # Silver jewellery demo data
│       └── clear-all.ts         # Reset database
│
├── src/
│   ├── App.tsx                  # JWT routing: /admin → super admin, / → tenant
│   ├── api.ts                   # API client with Bearer token + tenant headers
│   ├── types.ts                 # Shared types (Tab, Product, Tenant, Plan, BillSettings)
│   ├── components/
│   │   ├── ui/                  # Toast, Spinner, DateFilter, Pagination
│   │   └── layout/              # LoginScreen, SearchBar, NotificationBell, ChatWidget
│   ├── features/
│   │   ├── super-admin/         # Platform owner UI (7 components)
│   │   ├── dashboard/           # Tenant KPIs, charts
│   │   ├── sales/               # Sale entry, billing
│   │   ├── distribution/        # Vendor distribution, split billing
│   │   ├── inventory/           # Products, barcodes, stock
│   │   ├── warranty/            # Warranty management
│   │   ├── replacements/        # Product replacements
│   │   ├── rewards/             # Points, redemption
│   │   ├── accounts/            # Financial ledger
│   │   ├── finance/             # Vendor payments, reminders
│   │   ├── masters/             # Customers, vendors, banks, rules
│   │   └── settings/            # Profile, password, toggles, bill customization, users
│   ├── i18n/
│   │   ├── index.tsx              # LanguageProvider + useTranslation hook
│   │   ├── en.json                # English translations (200+ keys)
│   │   ├── hi.json                # Hindi translations
│   │   └── gu.json                # Gujarati translations
│   ├── hooks/useDebounce.ts
│   └── lib/
│       ├── utils.ts             # Utilities (print, WhatsApp, email, CSV)
│       └── billTemplates.ts     # Invoice + challan HTML generators (fully customizable)
├── .env                         # Environment config (not committed)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## Multi-Tenant Features

### Platform Owner (Super Admin) — `/admin`

- **Dashboard**: Total tenants, users, products, sales, revenue across all tenants
- **Tenant Management**: Create, suspend, activate, delete tenants
- **Plan Management**: 4 tiers with configurable limits and feature flags
- **Analytics**: Revenue per tenant, growth charts, most active tenants
- **Impersonation**: Log in as any tenant admin for support
- **Billing**: Generate subscription invoices for tenants with amount + GST, print professional PDF, mark paid/unpaid, filter by status, auto-generated invoice numbers
- **Subscription Tracking**: Auto-set expiry when creating invoice, expiry banner in tenant UI (amber 15 days, red 7 days), login blocked after expiry
- **Audit Log**: Cross-tenant activity log with search, action/entity filters, pagination
- **Feature Toggles**: 10 features controllable per tenant
- **Separate Route**: Super admin UI at `/admin`, completely hidden from tenant login
- **Tenant Onboarding**: Only super admin can create tenants (no self-registration)
- **Credential Sharing**: After onboarding, share login URL + credentials via WhatsApp or Email directly

### Subscription Plans

| Plan | Products | Vendors | Users | Monthly | Features |
|---|---|---|---|---|---|
| Trial | 20 | 3 | 2 | Free (14 days) | All features |
| Starter | 50 | 5 | 3 | ₹999 | Inventory, Sales, Distribution |
| Professional | 500 | 25 | 15 | ₹2,999 | + Warranty, Rewards, Finance |
| Enterprise | Unlimited | Unlimited | Unlimited | ₹9,999 | + Chatbot, API, Priority Support |

### Data Isolation

Every database table has a `tenant_id` column. Every query is scoped:
```sql
SELECT * FROM products WHERE tenant_id = $1
```
No tenant can see another tenant's data.

### Tenant URL Routing

Each tenant gets a unique branded URL based on their company slug:

```
/                          → DG ERP landing page (features, pricing, enquiry form)
/splendor-pump-llp         → Branded login for Splendor (logo, color, tagline)
/radhe-krishan-jewellers   → Branded login for Radhe Krishan
/admin                     → Super admin portal
/invalid-slug              → "Company Not Found" page
```

Slugs are auto-generated from the company name on creation (e.g., "Splendor Pump LLP" → `splendor-pump-llp`). After login, the URL updates to `/{slug}` automatically.

### Landing Page (`/`)

Company website with:
- Hero section with animated gradient
- Feature grid (8 features)
- How it works (3 steps)
- Pricing cards (4 plans)
- Contact section with enquiry form (opens mailto:), email, phone, WhatsApp
- Dark/light mode toggle in navbar
- Footer with contact links

### Tenant Branding

Each tenant sees their own company name in the sidebar, browser tab, bills, WhatsApp messages, and login page. Login pages show the tenant's logo, accent color, and tagline. A subtle "Powered by DG ERP" attribution appears at the bottom.

## Tenant Features

### Core
- Inventory with auto-barcode ranges (prefix + quantity, overlap prevention) or simple SKU mode
- Camera barcode scanner (phone camera, no app needed)
- Barcode/QR label printer (A4 sticker sheets or single labels)
- Bulk CSV import for products (download template, upload, preview, per-row errors)
- Sales entry with barcode scan + invoice generation
- Distribution to vendors (spreadsheet-style, per-row GST/discount)
- GST Tax Invoices with CGST/SGST breakdown
- Split billing (GST + non-GST from same distribution)

### Bill Customization (per tenant)
- **Company Logo**: Upload PNG/JPG (shown on all bills)
- **Bill Color Theme**: Custom accent color for headers, borders, totals
- **Tagline**: Subtitle under company name (e.g., "Manufacturers of Premium Pumps")
- **Invoice/Challan Prefix**: Custom bill numbering (e.g., SPL-INV-001)
- **Bank Details**: Account info printed on bills for payment
- **Terms & Conditions**: Custom footer text on bills
- **Authorized Signatory**: Name, designation, signature image
- **Show/Hide Toggles**: Hide barcode, warranty, or rewards sections on bills
- **Live Preview**: Preview bill with current settings before saving

### Financial
- Vendor finance tracking (billed, paid, balance)
- Payment recording (Cash, UPI, Bank Transfer, Cheque)
- WhatsApp payment reminders with configurable intervals
- Financial ledger with date filters + pagination

### Communication
- Print / Download PDF / WhatsApp / Email for all bills
- Auto-send WhatsApp toggle after sales
- ERP Chatbot (30+ queries: vendor lookup, sales today, low stock, etc.)

### Management
- Role-based access (Super Admin, Admin, Manager, Staff, Vendor)
- Auto-created vendor login on vendor creation
- Warranty & Replacement tracking (optional toggle)
- Reward points system (optional toggle)
- Global search with autocomplete (debounced, instant)
- Notification center (low stock, expiring warranties, pending payments)
- Audit log + database backup
- Dark / Light mode toggle (Settings → Appearance)
- Multi-language support: English, Hindi (हिन्दी), Gujarati (ગુજરાતી)

### Mobile Ready (PWA)
- **Progressive Web App** — install from browser, works like native app
- Add to home screen with app icon, splash screen, full screen mode
- Offline fallback page when no internet
- Bottom navigation bar on mobile (top 5 tabs + "More")
- iPhone safe area support (notch)
- Camera barcode scanner works in PWA mode
- Responsive UI with touch-friendly targets
- JWT auth works for web + future mobile app
- Same API serves all clients

## Authentication

### JWT Flow

```
Login → Server validates → Returns JWT token
       ↓
Frontend stores token in sessionStorage (per-tab isolation)
       ↓
Every API call includes: Authorization: Bearer {token}
                         X-Tenant-ID: {tenantId}
       ↓
Server middleware validates token + resolves tenant
```

### Routes

```
/              → DG ERP company website (landing page with features, pricing, contact)
/{slug}        → Branded tenant login (company logo, color, tagline)
/admin         → Super Admin login (completely separate)
```

### Password Security

- bcrypt with 12 salt rounds
- Minimum 8 character enforcement
- Change password requires current password + JWT auth
- Forgot password: generates secure reset token (1hr expiry)
- Reset password via token (shared by admin)
- Admin can reset any user's password from user management
- Rate limited: 5 attempts per 15 minutes

### Security Features

- **Helmet.js** — X-Content-Type-Options, X-Frame-Options, HSTS headers
- **Rate Limiting** — Login: 10 attempts/15min, Password change: 5 attempts/15min
- **CORS Whitelist** — Restricted origins in production (configurable via `ALLOWED_ORIGINS`)
- **XSS Prevention** — All user input HTML-escaped in bill templates, no `dangerouslySetInnerHTML`
- **JWT Pinning** — Algorithm locked to HS256, no fallback secrets
- **Tenant Isolation** — Auth middleware on all profile/settings routes, userId verified against JWT
- **No Hardcoded Secrets** — App refuses to start without `JWT_SECRET` and `DATABASE_URL`
- **Audit Logging** — All critical actions logged to DB + optional Better Stack Logtail
- **Performance** — Batch barcode insert, gzip compression, code splitting, DB indexes

## Performance

### Database
- **Batch barcode insert** — Adding 1000 barcodes uses 2 queries (batch INSERT + existence check via `ANY()`) instead of 6000 individual queries. ~100x faster product save.
- **27 indexes** on frequently queried columns: sales date, distribution date, vendor payments, audit action, inventory product+status, customer name/phone
- **Connection pool** — `pg.Pool` with max 10 (production) / 20 (dev), 30s idle timeout, 10s connection timeout, auto-SSL for Render/Neon

### Server
- **Gzip compression** — All API responses compressed via `compression` middleware (~70% smaller payloads)
- **JWT tenant isolation** — Middleware extracts `tenantId` from JWT and overrides `X-Tenant-ID` header to prevent cross-tenant access

### Frontend
- **Code splitting** — Vite `manualChunks` splits the 1.5MB bundle into 4 lazy-loaded chunks:
  - `index.js` (723KB) — core app, loads immediately
  - `charts.js` (357KB) — Recharts, loads only on Dashboard
  - `scanner.js` (403KB) — html5-qrcode + JsBarcode, loads only when scanning/printing
  - `motion.js` (94KB) — Framer Motion animations
- **Debounced search** — 250ms debounce on all search inputs
- **No product images** — Removed placeholder images for faster mobile loading

## API

All endpoints prefixed with `/api/`. Tenant routes require JWT + X-Tenant-ID header.

### Platform Routes (Super Admin JWT required)
```
POST   /api/super-admin/login
GET    /api/super-admin/dashboard
GET    /api/super-admin/tenants
POST   /api/super-admin/tenants
GET    /api/super-admin/tenants/:id
PUT    /api/super-admin/tenants/:id
DELETE /api/super-admin/tenants/:id
POST   /api/super-admin/tenants/:id/impersonate
GET    /api/super-admin/plans
POST   /api/super-admin/plans
PUT    /api/super-admin/plans/:id
DELETE /api/super-admin/plans/:id
GET    /api/super-admin/analytics
POST   /api/tenant/register              ← Super admin only
GET    /api/tenant/by-slug/:slug         ← Public (returns branding for login page)
GET    /api/super-admin/billing          ← List invoices (filter by status)
POST   /api/super-admin/billing          ← Create subscription invoice
PUT    /api/super-admin/billing/:id/paid ← Mark invoice as paid
DELETE /api/super-admin/billing/:id      ← Delete invoice
```

### Tenant Routes (Tenant JWT required)
```
POST   /api/auth/login
POST   /api/auth/signup
GET/PUT /api/settings/profile
PUT    /api/settings/change-password
POST   /api/auth/forgot-password        ← Generate reset token
POST   /api/auth/reset-password         ← Reset with token
PUT    /api/admin/reset-user-password   ← Admin resets user password
GET/PUT /api/settings/bill              ← Bill customization
GET    /api/products, /api/sales, /api/distribution, /api/warranties
       /api/customers, /api/vendors, /api/banks, /api/transactions
       /api/rewards, /api/notifications, /api/search, /api/chatbot
       ... (full CRUD on all resources)
```

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Frontend dev server (port 3000) |
| `npm run server` | API server (port 3001, auto-creates schema) |
| `npm run dev:all` | Start both servers |
| `npm run build` | Production build |
| `npm run demo:seed` | Load pump manufacturing demo |
| `npm run demo:jewellery` | Load jewellery demo |
| `npm run demo:clear` | Reset all data |
| `npm run lint` | TypeScript type check |

## Deployment

The app is cloud-ready:

```bash
# Set environment variables
DATABASE_URL=postgresql://...  # Use managed PostgreSQL (Supabase, AWS RDS, Railway)
JWT_SECRET=...
SUPER_ADMIN_EMAIL=...
SUPER_ADMIN_PASSWORD=...

# Build and start
npm run build
npm start
```

Compatible with: Railway, Render, AWS, DigitalOcean, Heroku, Vercel (API), any VPS.

## CI/CD Pipelines

5 GitHub Actions run automatically on every PR to `main`:

| Pipeline | What it checks | Blocks merge? |
|---|---|---|
| **Lint & Type Check** | TypeScript compilation, no errors | Yes |
| **Production Build** | Vite build succeeds, dist/ created | Yes |
| **Security Scan** | npm audit, hardcoded secrets, XSS (dangerouslySetInnerHTML), esc() in bills | Yes |
| **API Tests** | 190 automated tests against PostgreSQL (all 21 API modules) | Yes |
| **PR Quality Gate** | Combined: lint + build + security + bundle size check | Yes |

All checks must pass before PR can be merged to `main`.

### Run tests locally:
```bash
npm test           # Run all 98 tests
npm run test:watch  # Watch mode
```

## Automated Tests

190 API tests in `tests/api/` — 21 files:

| File | Tests | What it covers |
|---|---|---|
| `auth.test.ts` | 14 | Login, JWT, password, vendor block, subscription expiry |
| `security.test.ts` | 12 | Tenant isolation, XSS, SQL injection, bcrypt, shared barcodes |
| `products.test.ts` | 12 | CRUD, barcode inventory, duplicates, status |
| `sales.test.ts` | 9 | Sale flow, barcode status, sold validation |
| `distribution.test.ts` | 9 | Distribution, discount, GST/CGST/SGST calculation |
| `tenants.test.ts` | 12 | CRUD, toggles, subscription, suspend/activate |
| `plans.test.ts` | 14 | Seeded plans, pricing, feature flags |
| `finance.test.ts` | 9 | Vendor payments, balance |
| `billing.test.ts` | 10 | Invoices, mark paid, GST calc |
| `subscription.test.ts` | 26 | End-to-end: trial, expiry, renewal, upgrade, downgrade, feature sync, data safety |
| `super-admin.test.ts` | 9 | Login, tenant CRUD, impersonate, audit |
| `replacements.test.ts` | 7 | Barcode swap, status update, history |
| `customers.test.ts` | 6 | CRUD, vendor link, purchase history |
| `banks.test.ts` | 5 | CRUD, tenant scoped |
| `dashboard.test.ts` | 6 | Stats, KPIs, low stock, vendor summary |
| `search.test.ts` | 5 | Products, customers, vendors, barcodes |
| `notifications.test.ts` | 6 | Low stock, expiring warranty, pending payments |
| `masters.test.ts` | 3 | Counts, tenant isolation |
| `mapping.test.ts` | 4 | Vendor-customer mapping |
| `audit.test.ts` | 5 | Log entries, tenant scoped, action filter |
| `bill-settings.test.ts` | 7 | Logo, color, bank, terms, toggles, tenant scoped |

## Manual Test Cases

214 manual test cases organized by feature in `tests/cases/`:

| File | Tests | Priority |
|---|---|---|
| [super-admin.md](tests/cases/super-admin.md) | 36 | Critical |
| [auth-login.md](tests/cases/auth-login.md) | 15 | Critical |
| [security.md](tests/cases/security.md) | 15 | Critical |
| [cross-tenant.md](tests/cases/cross-tenant.md) | 7 | Critical |
| [inventory.md](tests/cases/inventory.md) | 17 | High |
| [verification.md](tests/cases/verification.md) | 17 | High |
| [sales.md](tests/cases/sales.md) | 15 | High |
| [distribution.md](tests/cases/distribution.md) | 9 | High |
| [vendors.md](tests/cases/vendors.md) | 8 | High |
| [pwa-mobile.md](tests/cases/pwa-mobile.md) | 10 | High |
| [landing-page.md](tests/cases/landing-page.md) | 13 | Medium |
| [bill-customization.md](tests/cases/bill-customization.md) | 12 | Medium |
| [settings.md](tests/cases/settings.md) | 11 | Medium |
| [finance.md](tests/cases/finance.md) | 6 | Medium |
| [edge-cases.md](tests/cases/edge-cases.md) | 10 | Medium |
| [multi-language.md](tests/cases/multi-language.md) | 6 | Low |
| [chatbot.md](tests/cases/chatbot.md) | 7 | Low |

## License

MIT License — see [LICENSE](LICENSE) for details.
