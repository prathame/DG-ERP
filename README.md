# Splendor ERP

Inventory, Sales, Warranty & Rewards Management System built for pump manufacturing businesses.

## Tech Stack

- **Frontend**: React 19 + TypeScript + Tailwind CSS v4 + Framer Motion + Recharts
- **Backend**: Express.js + TypeScript + SQLite (better-sqlite3)
- **Build**: Vite 6

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone <repo-url>
cd splender-inventry
npm install
```

### Running in Development

```bash
# Terminal 1 — API server (port 3001)
npm run server

# Terminal 2 — Frontend dev server (port 3000)
npm run dev
```

Or run both together:

```bash
npm run dev:all
```

Open http://localhost:3000

### Default Login

```
Email:    admin@splendor.com
Password: admin123
```

### Other Commands

```bash
npm run server:seed    # Insert sample data
npm run server:clear   # Reset database
npm run build          # Production build
npm start              # Run production build
npm run lint           # TypeScript type check
```

## Project Structure

```
splender-inventry/
├── server/
│   ├── index.ts                 # Express setup + mount routers
│   ├── db.ts                    # DB connection + schema + migrations
│   ├── db/index.ts              # Re-export for clean imports
│   ├── utils/
│   │   ├── barcode.ts           # Barcode generation, range expansion, overlap detection
│   │   └── helpers.ts           # Pagination, date filter, audit logger, password hash
│   ├── routes/
│   │   ├── products.ts          # Product CRUD + stock management
│   │   ├── sales.ts             # Sales + barcode validation + bill data
│   │   ├── distribution.ts      # Distribution + summary + challan
│   │   ├── warranties.ts        # Warranty CRUD
│   │   ├── replacements.ts      # Replacement tracking + validation
│   │   ├── transactions.ts      # Financial transactions
│   │   ├── rewards.ts           # Rewards + rules + redemption settings
│   │   ├── customers.ts         # Customer CRUD + purchases
│   │   ├── vendors.ts           # Vendor CRUD + auto user creation
│   │   ├── banks.ts             # Bank accounts CRUD
│   │   ├── finance.ts           # Vendor payments + reminders
│   │   ├── auth.ts              # Login, signup, profile, change password
│   │   ├── admin.ts             # User management (admin only)
│   │   ├── dashboard.ts         # Stats, charts, KPIs
│   │   ├── search.ts            # Global instant search
│   │   ├── notifications.ts     # Alert system
│   │   ├── masters.ts           # Master record counts
│   │   ├── mapping.ts           # Vendor-customer mapping
│   │   └── audit.ts             # Audit log + database backup
│   ├── seed.ts                  # Sample data seeder
│   └── clear-data.ts            # Database reset script
│
├── src/
│   ├── App.tsx                  # Layout shell + routing
│   ├── api.ts                   # API client with typed methods
│   ├── types.ts                 # Shared TypeScript interfaces
│   ├── components/
│   │   ├── ui/                  # Toast, Spinner, DateFilter, Pagination
│   │   └── layout/              # LoginScreen, SearchBar, NotificationBell
│   ├── features/
│   │   ├── dashboard/           # KPIs, charts, low stock alerts
│   │   ├── sales/               # Sale entry, print/share bills
│   │   ├── distribution/        # Distribute products to vendors
│   │   ├── inventory/           # Product management, barcodes, stock
│   │   ├── warranty/            # Warranty activation, claims
│   │   ├── replacements/        # Product replacement tracking
│   │   ├── rewards/             # Points earned/redeemed
│   │   ├── accounts/            # Financial ledger
│   │   ├── finance/             # Vendor payments, reminders
│   │   ├── masters/             # Customers, vendors, banks, rules, audit
│   │   └── settings/            # Profile, password, user management
│   ├── hooks/useDebounce.ts
│   └── lib/
│       ├── utils.ts             # Utilities (cn, CSV, print, WhatsApp, email)
│       └── billTemplates.ts     # Invoice + challan HTML generators
│
├── data/splendor.db             # SQLite database (auto-created)
├── package.json
├── tsconfig.json
├── vite.config.ts
└── index.html
```

## Features

### Inventory Management
- Auto-generated barcode ranges (prefix + quantity, no overlap)
- Track total inventory, distributed, sold, and remaining
- HSN code and GST rate per product

### Sales Entry
- Barcode scan/verify, customer details, sale price
- Auto-creates warranty and awards vendor reward points
- Print invoice, download PDF, send via WhatsApp or Email

### Distribution
- Distribute inventory to vendors by quantity
- Track per-vendor: distributed, sold, replaced, damaged
- Print challan, share via WhatsApp/Email

### Warranty & Replacements
- Auto-activated on sale (configurable duration)
- Track Active/Expired/Under Claim status
- Record replacements with old-to-new barcode tracking

### Rewards & Points
- Vendors earn points per sale, redeem with configurable thresholds
- Vendor reward summary and points history

### Vendor Finance (Admin Only)
- Track distributed value, payments received, balance per vendor
- Record Cash/UPI/Bank/Cheque payments with reference numbers
- WhatsApp payment reminders with customizable intervals
- Payment status on printed invoices

### Accounts
- Sales/Purchase/Expense ledger with date filters and pagination
- Income vs Expense summary, CSV export

### Dashboard
- Today's sales, month-over-month comparison
- Low stock alerts, top selling products, sales chart

### Bills & GST
- Tax Invoice with CGST/SGST breakdown, GSTIN, HSN codes
- Print, Save as PDF, WhatsApp text summary, Email
- Auto-send WhatsApp toggle in settings

### Search & Notifications
- Global instant search (products, customers, vendors, barcodes)
- Notification bell: low stock, expiring warranties, pending payments

### User Management
- Roles: Super Admin, Admin, Manager, Staff, Vendor
- Custom permissions, auto-created vendor logins
- Change password, per-tab session isolation

### Data & Security
- Database backup download (admin only)
- Activity/audit log for all critical actions
- Mobile responsive with touch-friendly design

## Database

SQLite at `data/splendor.db` — auto-created on first server start with all tables, indexes, and migrations. Back up by downloading via Settings or copying the file.

## License

Private — All rights reserved.
