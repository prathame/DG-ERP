# DG Business — Business Management Software

🇮🇳 **Made in India, for Indian Businesses**

Cloud-based business management software for shops, dealers, and manufacturers. Inventory, purchases, distribution, billing, GST reports, accounting — all in one platform. Multilingual (English, Hindi, Gujarati).

**Live**: [dg-erp.onrender.com](https://dg-erp.onrender.com)

## Features

| Module | What it does |
|--------|-------------|
| **Inventory** | Products with auto-barcode, box/piece tracking, batch printing, CSV import/export, stock alerts, HSN auto-suggest, per-product GST inclusive/exclusive, column picker, delete all |
| **Purchases** | Supplier management, purchase batches, cost tracking, supplier payments, invoice number for GSTR-2B matching |
| **Distribution** | Distribute to vendors, batch-level payment, custom pricing, E-Invoice & E-Way Bill JSON, CSV import for bulk distribution |
| **Standalone Invoices** | Non-inventory billing for services/custom jobs, 3 PDF presets (Modern/Classic/Minimal), auto-numbering, status flow (Draft→Sent→Paid) |
| **Quotes & Orders** | Create quotations → WhatsApp share → take orders → fulfill to distribution |
| **Finance** | Vendor receivables, batch-level payments, age-wise outstanding, bulk WhatsApp reminders, payment history PDF |
| **Accounts** | P&L, Balance Sheet, Cash Flow, Ledger, Day Book, Credit/Debit Notes — auto-generated |
| **Reports** | Sales register, distribution register, outstanding, payment register, stock summary, GST B2B/B2C/HSN |
| **GSTR-2B** | Upload 2B JSON from GST portal → auto-match against purchases → reconciliation report |
| **GSTR-3B** | Output tax, ITC computation, net payable — copy-paste ready for GST portal |
| **Staff Management** | Staff directory, salary/advance/bonus payments, WhatsApp notifications, CSV import |
| **Expenses** | 12 categories, P&L integration, ITC-eligible expense tracking |
| **Price List** | Vendor-wise + quantity slab pricing — auto-applied in distribution |
| **E-Invoice** | GST E-Invoice JSON export for government portal upload |
| **E-Way Bill** | E-Way Bill JSON with transport details, Ship-To GSTIN, July 2026 compliance |
| **UPI QR** | Auto-generated UPI payment QR code on every printed bill |
| **Vendor Portal** | Separate login for dealers — view-only access to stock, sales, payments |
| **AI Chatbot** | Natural language queries in Hindi, Gujarati, English |
| **Dashboard** | KPIs with skeleton loaders, low stock alerts, notification bell, top products |
| **Settings** | Bill customization, user management, bank dropdown from master, backup/restore |

## UI Features

| Feature | Description |
|---------|-------------|
| **Ctrl+K Command Palette** | Spotlight-style search across all pages |
| **HSN Auto-Suggest** | Type HSN code → auto-fills GST rate + description (100+ codes) |
| **Column Picker** | Toggle table columns visibility, persists to localStorage |
| **Skeleton Loaders** | Shimmer placeholders while data loads |
| **Custom Confirm Dialogs** | Styled modals replace browser confirm() — danger/warning/info variants |
| **Collapsible Sidebar** | Section groups with chevron toggle, persists state |
| **Toast Progress Bar** | Auto-dismiss countdown on notifications |
| **Notification Bell** | Low stock count badge in header |

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Framer Motion
- **Backend**: Express.js + TypeScript + PostgreSQL
- **Auth**: JWT + bcrypt-12 + rate limiting
- **Security**: Helmet.js, HSTS, CSP, RLS tenant isolation, audit trail
- **Build**: Vite 6
- **Languages**: English, Hindi (हिन्दी), Gujarati (ગુજરાતી)

## Architecture

```
Multi-Tenant SaaS (Shared DB + Row Level Security)
├── Super Admin (/admin) — manages tenants, plans, billing
├── Tenant 1 (/expert-electricals) — isolated data + branded URL
├── Tenant 2 (/radhe-krishna) — isolated data + branded URL
└── Tenant N (/{slug})

Data Flow:
Supplier → [Purchase] → Inventory → [Quote] → [Distribution] → Vendor
                                         ↓                        ↓
                                   [Standalone Invoice]     Payment Tracking
                                                                 ↓
                                                    Accounts (P&L, Balance Sheet)
                                                                 ↓
                                                    GST Reports (GSTR-1, 2B, 3B)
```

## Run Locally — Step by Step

### Prerequisites
- **Node.js 18+** — [download](https://nodejs.org/)
- **PostgreSQL 14+** — [download](https://www.postgresql.org/download/)

### Step 1: Clone & Install

```bash
git clone https://github.com/prathame/DG-ERP.git
cd DG-ERP
npm install
```

### Step 2: Create Database

```bash
# Mac
brew services start postgresql
createdb dg_business

# Linux
sudo systemctl start postgresql
sudo -u postgres createdb dg_business

# Windows — use pgAdmin or:
psql -U postgres -c "CREATE DATABASE dg_business;"
```

### Step 3: Create `.env` file

```bash
cp .env.example .env
```

Or create `.env` manually in the project root:

```env
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/dg_business
JWT_SECRET=any-random-string-minimum-32-characters
SUPER_ADMIN_EMAIL=admin@youremail.com
SUPER_ADMIN_PASSWORD=yourpassword123
PORT=3001
ALLOWED_ORIGINS=http://localhost:3000
```

### Step 4: Start Development Server

```bash
npm run dev
```

This starts both frontend (Vite) and backend (Express) together.

### Step 5: Open in Browser

| URL | What it is |
|-----|-----------|
| http://localhost:3000 | Landing page |
| http://localhost:3000/admin | Super Admin panel |
| http://localhost:3000/{slug} | Tenant login (e.g., /test-shop) |

### Step 6: First-Time Setup

1. Open http://localhost:3000/admin
2. Login with the `SUPER_ADMIN_EMAIL` and `SUPER_ADMIN_PASSWORD` from your `.env`
3. Click **Create Tenant** — fill company name, admin email, password, address, GSTIN, business type
4. Open http://localhost:3000/{slug} (slug = company name in lowercase)
5. Login with the tenant admin email/password

### Production Build

```bash
npm run build
npx tsx server/index.ts
# Opens at http://localhost:3001
```

### Health Check

```bash
curl http://localhost:3001/api/health
# Should return: {"ok":true,"message":"API is running"}
```

### Troubleshooting

| Issue | Fix |
|-------|-----|
| `ECONNREFUSED` on database | Start PostgreSQL: `brew services start postgresql` (Mac) |
| `relation does not exist` | Database exists but no tables — restart server (auto-creates schema) |
| `Port 3001 already in use` | Kill process: `lsof -ti:3001 \| xargs kill -9` |
| `SUPER_ADMIN_EMAIL required` | Add to `.env` file |
| Login fails after deploy | Clear browser localStorage and try again |

## Project Structure

```
server/
├── index.ts                 # Express setup + auth middleware + route mounting
├── pg-db.ts                 # PostgreSQL schema (35 tables) + migrations + RLS
├── middleware/auth.ts        # JWT + super admin auth
├── utils/
│   ├── helpers.ts           # uid(), audit log, mapProduct, validators
│   └── tenant.ts            # Tenant provisioning + cascade delete
├── routes/
│   ├── products.ts          # Products + stock + barcode + batch import
│   ├── purchases.ts         # Suppliers + purchase batches + supplier finance
│   ├── distribution.ts      # Distribution + batch payments + E-Invoice + E-Way Bill
│   ├── invoices.ts          # Standalone invoices (non-inventory billing)
│   ├── quotations.ts        # Quotations CRUD + convert to distribution
│   ├── orders.ts            # Orders + fulfill to distribution
│   ├── finance.ts           # Vendor finance + payment reminders
│   ├── accounts.ts          # P&L, Balance Sheet, Cash Flow, Ledger, GSTR-2B, GSTR-3B
│   ├── reports.ts           # 6 CA-ready reports (GST, outstanding, stock)
│   ├── payroll.ts           # Staff management + payments
│   ├── expenses.ts          # Expense tracking (12 categories)
│   ├── vendors.ts           # Vendor CRUD + bulk import + auto-login
│   ├── banks.ts             # Bank CRUD + batch import
│   ├── auth.ts              # Login, signup, password reset
│   ├── dashboard.ts         # Stats + KPIs
│   ├── chatbot.ts           # AI assistant (30+ commands)
│   ├── super-admin.ts       # Platform management
│   └── ... (more route files)

src/
├── App.tsx                  # Routing + sidebar + command palette
├── api.ts                   # API client with 15s GET cache + session tokens
├── types.ts                 # Shared types
├── lib/
│   ├── session.ts           # Multi-tab localStorage scoping
│   ├── utils.ts             # CSV, print, WhatsApp, email helpers
│   ├── billTemplates.ts     # Invoice + challan HTML generators
│   └── hsnRates.ts          # HSN/SAC → GST rate lookup (100+ codes)
├── hooks/
│   ├── useConfirm.tsx       # Promise-based confirm dialog hook
│   └── useDebounce.ts       # Debounce for search inputs
├── features/
│   ├── inventory/           # Products, stock, barcode labels, column picker
│   ├── purchases/           # Supplier purchases + expenses
│   ├── distribution/        # Vendor distribution + CSV import + Record Payment
│   ├── invoices/            # Standalone invoices + 3 PDF presets
│   ├── quotations/          # Quote → Share → Convert
│   ├── orders/              # Orders → Fulfill
│   ├── finance/             # Vendor payments + bulk WhatsApp reminders
│   ├── accounts/            # 13 sub-tabs (P&L, Balance Sheet, GSTR-2B, GSTR-3B, etc.)
│   ├── dashboard/           # KPIs, skeleton loaders, masters
│   ├── sales/               # Barcode scan + billing
│   ├── payroll/             # Staff salary + payment register
│   ├── settings/            # Profile, users, bill customization, bank dropdown
│   ├── super-admin/         # Platform admin (tenants, plans, billing, audit)
│   └── verification/        # Search/verify barcodes, vendors, products + PDF
├── components/
│   ├── ui/                  # Toast, Skeleton, ConfirmDialog, CommandPalette, ColumnPicker, CsvImport
│   └── layout/              # LoginScreen, LandingPage, ChatWidget
└── i18n/                    # EN, HI, GU translations
```

## Database (35 tables)

### Core
- `tenants` — multi-tenant config + tab customization + business type
- `users` — role-based (Super Admin, Admin, Manager, Staff, Vendor)
- `products` — with HSN, GST rate, pack size, warranty, price_includes_gst
- `product_inventory` — individual barcoded units (InStock/Distributed/Sold)

### Buying (Payables)
- `suppliers` — who you buy from
- `product_purchases` — purchase records with invoice_number for GSTR-2B
- `supplier_payments` — payments to suppliers (batch-level)

### Selling (Receivables)
- `vendors` — who you sell to (dealers/customers)
- `product_distribution` — distribution records with E-Way Bill number
- `vendor_payments` — payments from vendors (batch-level)
- `product_sales` — end-customer sales
- `standalone_invoices` — non-inventory billing (services, custom jobs)

### Quotations & Orders
- `quotations` — Draft → Sent → Accepted → Converted to distribution
- `orders` — Pending → Confirmed → Fulfilled

### Staff & Expenses
- `staff_members` — staff directory with salary, joining date
- `staff_payments` — salary, advance, bonus, deduction tracking
- `expenses` — 12 categories, P&L integration

### Other
- `warranties`, `product_replacements`, `rewards` — warranty lifecycle
- `customers`, `banks`, `vendor_reminder_settings` — master data
- `bill_settings` — per-tenant bill customization
- `audit_log` — all actions logged
- `plans`, `super_admins`, `tenant_invoices` — platform management

### Security
- **Row Level Security (RLS)** on all 31 tenant tables
- Every table has `tenant_id` column with RLS policy
- DB-level isolation: even if app has a bug, cross-tenant data access is blocked

## Validations

| Field | Rule |
|-------|------|
| Phone | 10-digit Indian mobile starting with 6-9, optional +91 |
| Email | Standard format validation |
| GSTIN | 15 characters: 2-digit state + PAN + entity code |
| HSN | Must be 4, 6, or 8 digits (per CBIC rules) |
| Password | Minimum 8 characters |
| CSV Import | All-or-nothing — if any row fails, nothing is imported |

## CSV Import Support

| Entity | Template columns | All-or-nothing |
|--------|-----------------|----------------|
| Products | name, price, quantity, packSize, packName, hsnCode, gstRate, priceIncludesGst, etc. | Yes |
| Vendors | name, contactPerson, phone, email, address, gstNumber | Yes |
| Staff | name, phone, role, address, salary, joiningDate | Yes |
| Banks | name, accountNumber, bankName, branch, ifscCode | Yes |
| Distribution | productName, quantity, price, withGst, discount (pre-fills form) | Yes |

Test data available in `test-data/valid/` and `test-data/invalid/`.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Frontend (port 3000) |
| `npm run server` | Backend (port 3001) |
| `npm run dev:all` | Both servers |
| `npm run build` | Production build |
| `npm start` | Production server |
| `npm run lint` | TypeScript check |

## Deployment

Cloud-ready (Render, Railway, AWS, DigitalOcean):

```bash
DATABASE_URL=postgresql://...
JWT_SECRET=...
SUPER_ADMIN_EMAIL=...
SUPER_ADMIN_PASSWORD=...
npm run build && npm start
```

Schema auto-creates on first run. Migrations run on every restart (safe — uses `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`). RLS policies applied automatically.

## Security

- JWT auth with HS256 + bcrypt-12
- **Row Level Security (RLS)** on all 31 tenant tables — DB-level isolation
- Tenant isolation (every query scoped by `tenant_id`)
- Rate limiting (login: 10/15min, password: 5/15min)
- Helmet.js (HSTS, CSP, X-Frame-Options)
- Audit trail on all critical actions
- Auto-logout on tenant suspension/deletion
- Session scoping (multi-tab safe)
- Phone, email, GSTIN, HSN validation
- All CSV imports: all-or-nothing with row-level error display

## License

MIT
