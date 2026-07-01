# DG Business — Business Management Software

🇮🇳 **Made in India, for Indian Businesses**

Cloud-based business management software for shops, dealers, and manufacturers. Inventory, purchases, distribution, billing, GST reports, accounting — all in one platform. Multilingual (English, Hindi, Gujarati).

**Live**: [dg-erp.onrender.com](https://dg-erp.onrender.com)

## Features

| Module | What it does |
|--------|-------------|
| **Inventory** | Products with auto-barcode, box/piece tracking, batch printing, CSV import, stock alerts |
| **Purchases** | Supplier management, purchase batches, cost tracking, supplier payments |
| **Distribution** | Distribute to vendors, batch-level payment, custom pricing, E-Invoice & E-Way Bill JSON |
| **Quotes & Orders** | Create quotations → WhatsApp share → take orders → fulfill to distribution |
| **Finance** | Vendor receivables, batch-level payments, age-wise outstanding, reminders |
| **Accounts** | P&L, Balance Sheet, Cash Flow, Ledger, Day Book, Credit/Debit Notes — auto-generated |
| **Reports** | Sales register, distribution register, outstanding, payment register, stock summary, GST B2B/B2C/HSN |
| **Price List** | Vendor-wise + quantity slab pricing — auto-applied in distribution |
| **E-Invoice** | GST E-Invoice JSON export for government portal upload |
| **E-Way Bill** | E-Way Bill JSON with transport details (vehicle, distance, mode) |
| **UPI QR** | Auto-generated UPI payment QR code on every printed bill |
| **Vendor Portal** | Separate login for dealers — view-only access to stock, sales, payments |
| **AI Chatbot** | Natural language queries in Hindi, Gujarati, English |
| **Dashboard** | KPIs, low stock alerts, top products, revenue tracking |
| **Settings** | Bill customization, user management, tab config, barcode/language toggles |

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Framer Motion
- **Backend**: Express.js + TypeScript + PostgreSQL
- **Auth**: JWT + bcrypt-12 + rate limiting
- **Security**: Helmet.js, HSTS, CSP, tenant isolation, audit trail
- **Build**: Vite 6
- **Languages**: English, Hindi (हिन्दी), Gujarati (ગુજરાતી)

## Architecture

```
Multi-Tenant SaaS
├── Super Admin (/admin) — manages tenants, plans, billing
├── Tenant 1 (/expert-electricals) — isolated data + branded URL
├── Tenant 2 (/radhe-krishna) — isolated data + branded URL
└── Tenant N (/{slug})

Data Flow:
Supplier → [Purchase] → Inventory → [Quote] → [Distribution] → Vendor
                                                    ↓
                                              Payment Tracking
                                                    ↓
                                         Accounts (P&L, Balance Sheet)
```

## Getting Started

### Prerequisites
- Node.js 18+
- PostgreSQL 14+

### Setup

```bash
git clone <repo-url>
cd splender-inventry
npm install
```

### Environment

Create `.env`:
```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/dg_business
JWT_SECRET=your-secret-key-minimum-32-characters-long
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=your_secure_password
ALLOWED_ORIGINS=http://localhost:3000
```

### Run

```bash
npm run dev:all    # Start frontend + backend
```

- Landing: http://localhost:3000
- Super Admin: http://localhost:3000/admin
- Tenant: http://localhost:3000/{slug}

## Project Structure

```
server/
├── index.ts                 # Express setup + route mounting
├── pg-db.ts                 # PostgreSQL schema (28 tables) + migrations
├── middleware/auth.ts        # JWT + super admin auth
├── utils/
│   ├── barcode.ts           # Auto-barcode generation
│   ├── helpers.ts           # Audit log, pagination, mapProduct
│   └── tenant.ts            # Tenant provisioning
├── routes/
│   ├── products.ts          # Products + stock + barcode management
│   ├── purchases.ts         # Suppliers + purchase batches + supplier finance
│   ├── distribution.ts      # Distribution batches + batch payments + billing
│   ├── quotations.ts        # Quotations CRUD + convert to distribution
│   ├── finance.ts           # Vendor finance (receivables) + payment reminders
│   ├── accounts.ts          # P&L, Balance Sheet, Cash Flow, Ledger
│   ├── reports.ts           # 6 CA-ready reports (GST, outstanding, stock)
│   ├── vendors.ts           # Vendor CRUD + auto-login
│   ├── sales.ts             # Sales + warranty auto-creation
│   ├── auth.ts              # Login, signup, password reset
│   ├── dashboard.ts         # Stats + KPIs
│   ├── chatbot.ts           # AI assistant (30+ commands)
│   ├── super-admin.ts       # Platform management
│   └── ... (14 more route files)

src/
├── App.tsx                  # Routing + sidebar + tabs
├── api.ts                   # API client with session-scoped tokens
├── types.ts                 # Shared types
├── lib/
│   ├── session.ts           # Multi-tab localStorage scoping
│   ├── utils.ts             # CSV, print, WhatsApp, email
│   └── billTemplates.ts     # Invoice + challan HTML generators
├── features/
│   ├── inventory/           # Products, stock, barcode labels
│   ├── purchases/           # Supplier purchases
│   ├── distribution/        # Vendor distribution + Record Payment
│   ├── quotations/          # Quote → Share → Convert
│   ├── finance/             # Vendor payments + batch selector
│   ├── accounts/            # P&L, Balance Sheet, Cash Flow, Ledger
│   ├── accounts/            # Accounts + Reports (merged, 10 sub-tabs)
│   ├── dashboard/           # KPIs, charts, masters
│   ├── sales/               # Barcode scan + billing
│   ├── settings/            # Profile, users, bill customization
│   ├── super-admin/         # Platform admin (8 components)
│   └── ... (5 more feature folders)
├── components/
│   ├── ui/                  # Toast, Spinner, PaidBadge, BarcodePrinter
│   └── layout/              # LoginScreen, LandingPage, ChatWidget
└── i18n/                    # EN, HI, GU translations
```

## Database (28 tables)

### Core
- `tenants` — multi-tenant config + tab customization
- `users` — role-based (Super Admin, Admin, Manager, Staff, Vendor)
- `products` — with HSN, GST rate, pack size, warranty months
- `product_inventory` — individual barcoded units (InStock/Distributed/Sold)

### Buying (Payables)
- `suppliers` — who you buy from
- `product_purchases` — purchase records per barcode
- `supplier_payments` — payments to suppliers (batch-level)

### Selling (Receivables)
- `vendors` — who you sell to (dealers/customers)
- `product_distribution` — distribution records per barcode
- `vendor_payments` — payments from vendors (batch-level)
- `product_sales` — end-customer sales

### Quotations
- `quotations` — Draft → Sent → Accepted → Converted to distribution

### Other
- `warranties`, `product_replacements`, `rewards` — warranty lifecycle
- `customers`, `banks`, `vendor_reminder_settings` — master data
- `bill_settings` — per-tenant bill customization
- `audit_log` — all actions logged
- `plans`, `super_admins`, `tenant_invoices` — platform management

## API Endpoints

### Platform (Super Admin)
```
POST   /api/super-admin/login
GET    /api/super-admin/tenants
POST   /api/tenant/register
POST   /api/super-admin/tenants/:id/reset-token
POST   /api/super-admin/tenants/:id/impersonate
```

### Inventory & Products
```
GET    /api/products                    # List (with search)
POST   /api/products                    # Create (with barcode + stock)
POST   /api/products/:id/add-stock     # Add inventory
GET    /api/products/:id/barcodes      # Barcode list
GET    /api/products/verify/:barcode   # Verify barcode
```

### Purchases
```
GET    /api/suppliers                   # List suppliers
POST   /api/suppliers                   # Create supplier
POST   /api/purchases/batch            # Purchase from supplier (adds stock)
GET    /api/purchases/batches          # List purchase batches
GET    /api/supplier-finance/summary   # Payables summary
POST   /api/supplier-finance/:id/payments  # Pay supplier
```

### Distribution
```
POST   /api/distribution/batch         # Distribute to vendor
GET    /api/distribution/batches       # List batches (with payment info)
GET    /api/distribution/bill          # Generate challan/bill
POST   /api/vendor-finance/:id/payments # Record vendor payment
```

### Quotations
```
POST   /api/quotations                 # Create quote
PUT    /api/quotations/:id/status      # Draft → Sent → Accepted
POST   /api/quotations/:id/convert     # Convert to distribution
```

### Accounts
```
GET    /api/accounts/profit-loss       # P&L statement
GET    /api/accounts/balance-sheet     # Assets vs Liabilities
GET    /api/accounts/cash-flow         # Inflows vs Outflows + monthly
GET    /api/accounts/ledger            # All transactions chronologically
```

### Reports
```
GET    /api/reports/sales-register
GET    /api/reports/distribution-register
GET    /api/reports/outstanding         # Age-wise receivables
GET    /api/reports/payment-register
GET    /api/reports/stock-summary       # Closing stock valuation
GET    /api/reports/gst-summary         # GSTR-1 format (B2B/B2C/HSN)
```

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

Schema auto-creates on first run. Migrations run on every restart (safe — uses `IF NOT EXISTS` and `ADD COLUMN IF NOT EXISTS`).

## Security

- JWT auth with HS256 + bcrypt-12
- Tenant isolation (every query scoped by `tenant_id`)
- Rate limiting (login: 10/15min, password: 5/15min)
- Helmet.js (HSTS, CSP, X-Frame-Options)
- Audit trail on all critical actions
- Session scoping (multi-tab safe)
- Phone validation, input sanitization

## License

MIT
