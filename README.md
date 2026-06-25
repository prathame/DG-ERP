# DG ERP Management — Multi-Tenant SaaS Platform

Industry-agnostic ERP for Inventory, Sales, Distribution, Warranty & Rewards Management. Built as a multi-tenant SaaS — onboard unlimited companies, each with fully isolated data and customizable branding.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Framer Motion + Recharts
- **Backend**: Express.js + TypeScript + PostgreSQL (pg)
- **Auth**: JWT (jsonwebtoken) + bcrypt
- **Build**: Vite 6
- **Theme**: Dark / Light mode with session persistence

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

Create `.env` in the project root:

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/splendor_erp
JWT_SECRET=your-secret-key-change-in-production
JWT_EXPIRES_IN=7d
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=your_secure_password
```

### Running

```bash
# Terminal 1 — API server (auto-creates tables + seeds plans on first run)
npm run server

# Terminal 2 — Frontend dev server
npm run dev
```

- Super admin: http://localhost:3000/admin
- Tenant login: http://localhost:3000/{slug} (e.g., `/splendor-pump-llp`)
- Generic login: http://localhost:3000 (email lookup finds tenant)

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
- **Self-Service Registration**: Companies sign up with 14-day trial
- **Separate Route**: Super admin UI at `/admin`, completely hidden from tenant login
- **Tenant Onboarding**: Only super admin can create tenants (no self-registration)

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
/                          → Generic DG ERP login (email finds tenant)
/splendor-pump-llp         → Branded login for Splendor (logo, color, tagline)
/radhe-krishan-jewellers   → Branded login for Radhe Krishan
/admin                     → Super admin portal
/invalid-slug              → "Company Not Found" page
```

Slugs are auto-generated from the company name on creation (e.g., "Splendor Pump LLP" → `splendor-pump-llp`). After login, the URL updates to `/{slug}` automatically.

### Tenant Branding

Each tenant sees their own company name in the sidebar, browser tab, bills, WhatsApp messages, and login page. Login pages show the tenant's logo, accent color, and tagline. A subtle "Powered by DG ERP" attribution appears at the bottom.

## Tenant Features

### Core
- Inventory with auto-barcode ranges (prefix + quantity, overlap prevention)
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

### Mobile Ready
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
/              → Generic tenant login (email lookup finds tenant)
/{slug}        → Branded tenant login (company logo, color, tagline)
/admin         → Super Admin login (completely separate)
```

### Password Security

- bcrypt with salt rounds
- Minimum 6 character enforcement
- Change password with current password verification

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
```

### Tenant Routes (Tenant JWT required)
```
POST   /api/auth/login
POST   /api/auth/signup
GET/PUT /api/settings/profile
PUT    /api/settings/change-password
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

## License

Private — All rights reserved.
