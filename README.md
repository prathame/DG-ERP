# DG ERP — Business Management Software

Made in India, for Indian businesses. Multi-tenant cloud SaaS (+ on-prem desktop) covering inventory, purchases, distribution, billing, GST, accounts, and payroll. Multilingual: English, Hindi, Gujarati.

**Live**: [dg-erp.onrender.com](https://dg-erp.onrender.com)

---

## Business Types

Each tenant is provisioned as one of five types. The type controls which tabs are visible and how the UI labels them.

| Type | Who it's for |
|---|---|
| **Manufacturer** | Factories — full inventory + distribution + accounts |
| **Dealer / Wholesaler** | Wholesale traders — distribution-heavy, finance tracking |
| **Retail Shop** | Point-of-sale retail — sales, warranty, rewards |
| **Service / Consulting** | Service businesses — invoices, quotations, payroll |
| **Custom** | Tenant-specific setup, shown as "Custom (CompanyName)" |

---

## Features

| Module | What it does |
|---|---|
| **Inventory** | Products with auto-barcode, box/piece tracking, batch printing, CSV import/export, stock alerts, HSN auto-suggest, per-product GST inclusive/exclusive |
| **Purchases** | Supplier management, purchase batches, cost tracking, supplier payments, invoice number for GSTR-2B matching |
| **Distribution** | Distribute to vendors, batch-level payment, custom pricing, E-Invoice & E-Way Bill JSON, CSV import |
| **Standalone Invoices** | Non-inventory billing (services/jobs), 3 PDF presets, auto-numbering, status flow Draft→Sent→Paid |
| **Invoice Finance** | Partial payment tracking for standalone invoices — due/paid/balance per invoice |
| **Quotes & Orders** | Create quotations → WhatsApp share → take orders → fulfill to distribution |
| **Finance** | Vendor receivables, batch-level payments, age-wise outstanding, bulk WhatsApp reminders, payment PDF |
| **Accounts** | P&L, Balance Sheet, Cash Flow, Ledger, Day Book, Credit/Debit Notes — auto-generated |
| **Payroll** | Staff directory, salary/advance/bonus payments, WhatsApp notifications, CSV import |
| **Expenses** | 12 categories, P&L integration, ITC-eligible expense tracking |
| **Price Lists** | Vendor-wise + quantity slab pricing — auto-applied in distribution |
| **Reports** | Sales register, distribution register, outstanding, payment register, stock summary, GSTR-2B/3B |
| **Rewards** | Customer reward points — earn on sale, redeem with QR scan |
| **Warranty** | Serial-linked warranty tracking with expiry alerts |
| **Verification** | Barcode scan → product + warranty + customer history |
| **Bank Statements** | Upload ICICI/HDFC/SBI XLS or XLSX → auto-parse transactions, match UPI to vendors |
| **Analytics** | Revenue, collections, distribution, expenses, vendor balances — date-range filtered |

---

## Tech Stack

- **Frontend**: React 19, Vite 6, Tailwind CSS, Radix UI
- **Backend**: Node.js, Express 4, PostgreSQL 16 (RLS per tenant)
- **Auth**: JWT (HS256, 24h), bcrypt
- **Desktop**: Electron (cloud wrapper + on-prem with embedded PostgreSQL)
- **Hosting**: Render (cloud), self-hosted (on-prem)

---

## Run Locally

### Prerequisites
- Node.js 20+
- PostgreSQL 16

### Setup

```bash
git clone <repo>
cd splender-inventry
npm install

# Create database
createdb dg_erp

# Create .env
cat > .env << EOF
DATABASE_URL=postgresql://localhost:5432/dg_erp
JWT_SECRET=local-dev-secret-change-in-prod
SUPER_ADMIN_EMAIL=admin@dg-erp.in
SUPER_ADMIN_PASSWORD=admin123
PORT=3001
VITE_API_URL=http://localhost:3001
EOF

# Start (server + frontend hot-reload)
npm run dev:all
```

Open `http://localhost:3000` — super admin at `/super-admin`.

### Production Build

```bash
npm run build   # builds frontend into dist/
npm start       # serves both API + static from port 3001
```

---

## Desktop Apps

Two Electron builds, same codebase:

### Cloud Wrapper (~20 MB)
Wraps the live cloud URL in a native window. No local database.

```bash
npm run electron:cloud:dev
npm run build:electron:cloud:win   # → .exe
npm run build:electron:cloud:mac   # → .dmg
```

### On-Prem (~180 MB)
Full self-contained install — embedded PostgreSQL, Express server, React frontend. No internet required after activation.

```bash
npm run electron:onprem:dev
npm run build:electron:onprem:win  # → .exe installer
npm run build:electron:onprem:mac  # → .dmg
```

On first launch shows a wizard: enter the license key issued by super admin → activates against cloud → creates local tenant → opens app. Heartbeat every 60 min keeps the super admin dashboard updated.

---

## Super Admin

Accessible at `/super-admin` (cloud) or via the super admin account.

| Section | What it manages |
|---|---|
| **Tenants** | Create / manage cloud tenants, set business type, rename tabs per tenant |
| **On-Prem** | Issue license keys, track installations, online/offline status, push update notifications |
| **Analytics** | Revenue, tenant growth, plan distribution |

---

## Project Structure

```
src/
  features/         — one folder per module (analytics, inventory, sales, …)
  lib/
    businessTypeConfig.ts   — per-type tab visibility / label defaults
    billTemplates.ts        — PDF bill HTML generators
    session.ts              — JWT session helpers
    utils.ts                — shared utilities
  api.ts            — typed API client

server/
  routes/           — one file per domain (30 route files)
  middleware/       — auth.ts (JWT), rateLimit.ts
  utils/
    tenant.ts       — provisionTenant, deleteTenant
    barcode.ts      — barcode generation / validation
  pg-db.ts          — connection pool + schema init (38 tables)
  index.ts          — Express app entrypoint

electron/
  cloud/            — cloud wrapper (main.ts, preload.ts)
  onprem/           — on-prem (main.ts, pg-manager.ts, license-store.ts)
  shared/           — constants.ts, find-port.ts

tests/
  e2e_by_type.py    — 453-test E2E suite across all 4 business types
  cases/            — manual test case specs per feature
```

---

## Database (38 tables)

**Tenant core**: `tenants`, `users`, `vendors`, `customers`, `categories`, `products`

**Inventory**: `product_inventory`, `product_purchases`, `product_sales`, `product_distribution`, `product_replacements`

**Finance**: `vendor_payments`, `supplier_payments`, `invoice_payments`, `standalone_invoices`, `expenses`, `banks`

**Supporting**: `warranties`, `rewards`, `reward_rules`, `redemption_settings`, `quotations`, `orders`, `price_lists`, `credit_debit_notes`, `staff_members`, `staff_payments`

**Platform**: `plans`, `super_admins`, `tenant_invoices`, `tenant_stats`, `audit_log`, `bill_settings`, `vendor_reminder_settings`, `password_reset_tokens`, `onprem_licenses`, `platform_config`

---

## License

Proprietary. All rights reserved.
