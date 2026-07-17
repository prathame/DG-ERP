# Dhandho — Business Management Software

Made in India, for Indian businesses. Multi-tenant cloud SaaS (+ on-prem desktop) covering inventory, purchases, distribution, billing, GST, accounts, and payroll. Multilingual: English, Hindi, Gujarati.

**Live**: [dhandho.app](https://dhandho.app)

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

- **Frontend**: React 19, Vite 6, Tailwind CSS, Motion
- **Backend**: Node.js, Express 4, PostgreSQL 16 (RLS per tenant)
- **Auth**: JWT (HS256, 24h), bcrypt
- **Desktop**: Electron (cloud wrapper + on-prem with embedded PostgreSQL)
- **Clients**: Responsive web + Electron cloud + Electron on-prem + Service Mobile (offline Capacitor, service type only)
- **Hosting**: Render (cloud), self-hosted (on-prem)

---

## Run Locally

### Prerequisites
- Node.js 20+
- PostgreSQL 16

### Setup

```bash
git clone <repo>
cd DG-ERP
npm install

# Create database
createdb dhandho

# Secrets: copy the template and fill in your own values (never commit .env)
cp .env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET (≥32 chars), SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD

# Start (server + frontend hot-reload)
npm run dev:all
```

Open `http://localhost:3000` — super admin at `/super-admin`.

### Security — secrets & rotation

- **Never commit** `.env`, `.env.local`, `.env.mobile`, or any file with real credentials. Only `.env.example` / `.env.mobile.example` (placeholders) belong in git.
- **Client bundle (`VITE_*`)**: only public-safe values (API origin, store URLs, app version). Never put `JWT_SECRET`, database URLs, GST passwords, or Logtail tokens in `VITE_*` vars — Vite embeds them in the browser.
- **No Supabase / Stripe / Mongo secrets** in this codebase today; if you add them later, service-role / secret keys stay server-side only.
- **If a secret was ever hardcoded or committed**, assume it is compromised: **rotate it immediately** (new `JWT_SECRET`, DB password, SA password, API keys). Old values can remain recoverable from git history even after the file is deleted.

### Production Build

```bash
npm run build   # builds frontend into dist/
npm start       # serves both API + static from port 3001
```

---

## Desktop Apps

Two Electron builds, same codebase. See also [`electron/README.md`](electron/README.md).

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

On first launch shows a wizard: enter the license key issued by super admin → activates against cloud → creates local tenant → opens app. Heartbeat keeps the super admin dashboard updated.

---


## Downloads page

Public URL: **`/download`**

| Section | What |
|---------|------|
| Service Mobile | Offline phone (APK sideload / TestFlight) — `DG-SM-` license |
| On-Prem desktop | Electron offline installers |
| Cloud desktop | Electron online installers |

---

## Super Admin

Accessible at `/admin` (or `/super-admin` depending on deploy) with the platform admin account.

| Section | What it manages |
|---|---|
| **Tenants** | Create / manage cloud tenants, business type, tabs |
| **On-Prem** | Issue license keys, track installations, push settings |
| **Analytics** | Revenue, tenant growth, plan distribution |
| **Guide** | In-app operator documentation |

---

## Documentation

| Doc | Contents |
|-----|----------|
| [`DEVELOPER.md`](DEVELOPER.md) | Architecture, routes, Electron, platforms |
| [`src/platforms/README.md`](src/platforms/README.md) | Shared, Electron, Service Mobile |
| [`electron/README.md`](electron/README.md) | Electron cloud vs on-prem |
| Super Admin → **Guide** | Operator how-tos inside the product |

---

## Project Structure

```
src/
  platforms/        — shared + desktop (see platforms/README.md)
  features/         — one folder per module (analytics, inventory, sales, …)
  lib/              — shared helpers (session, bills, businessTypeConfig, …)
  api.ts            — typed API client

server/
  routes/           — domain routes (+ onprem.ts, super-admin.ts)
  middleware/       — auth.ts (JWT)
  utils/            — tenant.ts, barcode.ts, …
  pg-db.ts          — pool + schema init
  index.ts / app.ts — Express entry

electron/
  cloud/            — desktop · online
  onprem/           — desktop · offline
  shared/

docs/

tests/
  e2e_by_type.py
  cases/            — manual specs (e.g. super-admin.md)
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
