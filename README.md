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

- **Frontend**: React 19, Vite 6, Tailwind CSS, Radix UI
- **Backend**: Node.js, Express 4, PostgreSQL 16 (RLS per tenant)
- **Auth**: JWT (HS256, 24h), bcrypt
- **Desktop**: Electron (cloud wrapper + on-prem with embedded PostgreSQL)
- **Mobile**: Capacitor (Android / iOS) against the cloud API — invite onboarding + light offline queue
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
createdb dhandho

# Create .env
cat > .env << EOF
DATABASE_URL=postgresql://localhost:5432/dhandho
JWT_SECRET=local-dev-secret-change-in-prod
SUPER_ADMIN_EMAIL=admin@dhandho.in
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

## Mobile App (Android / iOS)

Capacitor app for **cloud** tenants. Full guide: [`docs/MOBILE.md`](docs/MOBILE.md).

1. Super Admin creates tenant → gets invite `DG-M-XXXX-XXXX`
2. Customer installs from [`/download`](https://dg-erp.onrender.com/download)
3. App onboarding: invite code (or company slug) → login
4. Heartbeat registers the device; SA can **Force sync** and set version policy

```bash
# .env.mobile — VITE_MOBILE=1, VITE_API_ORIGIN=https://your-api.host
npm run build:mobile
npm run cap:sync
npm run cap:android   # or cap:ios
```

Optional store links on `/download`:

```bash
VITE_ANDROID_STORE_URL=https://play.google.com/store/apps/details?id=app.dhandho.mobile
VITE_IOS_STORE_URL=https://apps.apple.com/app/idXXXXXXXX
```

---

## Downloads page

Public URL: **`/download`**

| Section | What |
|---------|------|
| Mobile | Play Store / App Store / GitHub APK |
| On-Prem desktop | Electron offline installers |
| Cloud desktop | Electron online installers |

---

## Super Admin

Accessible at `/admin` (or `/super-admin` depending on deploy) with the platform admin account.

| Section | What it manages |
|---|---|
| **Tenants** | Create / manage cloud tenants, business type, tabs; **Mobile panel** (invite, force sync, devices) |
| **On-Prem** | Issue license keys, track installations, push settings |
| **Analytics** | Revenue, tenant growth, plan distribution |
| **Guide** | In-app operator documentation |

---

## Documentation

| Doc | Contents |
|-----|----------|
| [`docs/MOBILE.md`](docs/MOBILE.md) | Mobile onboarding, APIs, sync, build |
| [`DEVELOPER.md`](DEVELOPER.md) | Architecture, routes, Electron, platforms |
| [`src/platforms/README.md`](src/platforms/README.md) | mobile/desktop · online/offline layout |
| [`electron/README.md`](electron/README.md) | Electron cloud vs on-prem |
| Super Admin → **Guide** | Operator how-tos inside the product |

---

## Project Structure

```
src/
  platforms/        — mobile|desktop × online|offline (see platforms/README.md)
  features/         — one folder per module (analytics, inventory, sales, …)
  lib/              — shared helpers (session, bills, businessTypeConfig, …)
  api.ts            — typed API client (uses platforms offline helpers)

server/
  routes/           — domain routes (+ mobile.ts, onprem.ts, super-admin.ts)
  middleware/       — auth.ts (JWT)
  utils/            — tenant.ts, barcode.ts, …
  pg-db.ts          — pool + schema init
  index.ts / app.ts — Express entry

electron/
  cloud/            — desktop · online
  onprem/           — desktop · offline
  shared/

android/ ios/       — Capacitor native projects (generated / synced)
docs/
  MOBILE.md

tests/
  e2e_by_type.py
  cases/            — manual specs (incl. pwa-mobile.md, super-admin.md)
```

---

## Database (38 tables)

**Tenant core**: `tenants`, `users`, `vendors`, `customers`, `categories`, `products`

**Inventory**: `product_inventory`, `product_purchases`, `product_sales`, `product_distribution`, `product_replacements`

**Finance**: `vendor_payments`, `supplier_payments`, `invoice_payments`, `standalone_invoices`, `expenses`, `banks`

**Supporting**: `warranties`, `rewards`, `reward_rules`, `redemption_settings`, `quotations`, `orders`, `price_lists`, `credit_debit_notes`, `staff_members`, `staff_payments`

**Platform**: `plans`, `super_admins`, `tenant_invoices`, `tenant_stats`, `audit_log`, `bill_settings`, `vendor_reminder_settings`, `password_reset_tokens`, `onprem_licenses`, `platform_config`, `mobile_devices`

**Mobile columns on `tenants`**: `mobile_invite_code`, `mobile_invite_expires_at`, `mobile_force_sync_at`, `mobile_min_version`, `mobile_latest_version`

---

## License

Proprietary. All rights reserved.
