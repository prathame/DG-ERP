# Developer Guide — Dhandho

Technical reference for contributors and maintainers.

---

## Quick Start

```bash
npm install
createdb dhandho
cp .env.example .env   # edit DATABASE_URL + JWT_SECRET
npm run dev:all        # server :3001 + frontend :3000
```

Super admin: `http://localhost:3000/super-admin`

---

## Architecture

```
Browser / Electron window
        │  HTTPS / IPC
        ▼
  Express 4 (server/index.ts)
        │  JWT middleware
        ▼
  Route handlers (server/routes/*.ts)
        │  pg Pool
        ▼
  PostgreSQL 16 (RLS: tenant_id on every row)
```

**Multi-tenancy**: every table has `tenant_id`. All queries are scoped via `WHERE tenant_id = $1`. No row can leak across tenants at the DB layer.

**URL routing**: `/:slug/*` maps the subdomain-style slug to a tenant. The slug is resolved on the server and the tenant's JWT carries `tenantId` for subsequent requests.

### Client platforms (`src/platforms/`)

```
platforms/
├── shared/           # API URL helpers (all clients)
└── desktop/
    ├── online/       # Electron cloud (thin online client)
    └── offline/      # On-prem sync UI (OnlineStatus)
```

Native Electron processes: `electron/cloud` = desktop·online, `electron/onprem` = desktop·offline.  
See `src/platforms/README.md` and `electron/README.md`. Offline phone ERP is **Service Mobile** (`src/platforms/service-mobile/`, Capacitor) — service business type only, SA keys `DG-SM-…`.

---


## Business Type System

`src/lib/businessTypeConfig.ts` is the single source of truth for per-type UI decisions.

```ts
getBusinessConfig()  // reads localStorage session, returns BusinessConfig
```

`BusinessConfig` shape:
```ts
{
  type: 'manufacturer' | 'dealer' | 'retail' | 'service' | 'custom'
  showDistribution: boolean
  showSales: boolean
  showInvoices: boolean
  showFinance: boolean
  showAccounts: boolean
  showWarranty: boolean
  showRewards: boolean
  showPayroll: boolean
  // … one boolean per feature
}
```

`useBusinessConfig` is an alias for `getBusinessConfig` — pick one name in new code.

**Tab config (backend authoritative)**: when provisioning a tenant via super admin, `server/routes/super-admin.ts` holds `PRESETS` — a per-business-type map of which tabs are visible and what they're labelled. This is stored in `tenants.tab_config` (JSON). The frontend reads `tab_config` from the JWT session; super admin can rename any tab label per tenant.

**Custom type**: displayed as `Custom (CompanyName)` using `bizTypeLabel(type, companyName)` in `src/lib/utils.ts`. Multiple custom tenants each show their own company name.

---

## Authentication

```
POST /api/auth/login → JWT (24h, HS256)
Authorization: Bearer <token>
```

Token payload (`JwtPayload`):
```ts
{ userId, tenantId, role, email, name, vendorId?, tabConfig? }
```

Super admin uses a separate token (same `generateToken()` function, different payload shape). `generateSuperAdminToken` is an alias.

Middleware stack (applied per route):
- `authMiddleware` — validates tenant user JWT, attaches `req.user`
- `superAdminMiddleware` — validates super admin JWT, checks `role === 'super_admin'`
- `rateLimitMiddleware` — 100 req/15min per IP

---

## Server Routes (30 files)

| File | Prefix | Notes |
|---|---|---|
| `auth.ts` | `/api/auth` | login, logout, password reset |
| `products.ts` | `/api/products` | CRUD, CSV import/export |
| `inventory.ts` | (within products) | stock levels, restock |
| `purchases.ts` | `/api/purchases` | purchase batches, supplier payments |
| `distribution.ts` | `/api/distribution` | challan, batch, E-Invoice JSON |
| `sales.ts` | `/api/sales` | POS sale, warranty auto-create |
| `invoices.ts` | `/api/invoices` | standalone invoices, optional party link, PDF |
| `invoice-finance.ts` | `/api/invoice-finance` | partyKey summary + payments per invoice |
| `finance.ts` | `/api/finance` | vendor receivables, payments |
| `accounts.ts` | `/api/accounts` | P&L, balance sheet, ledger |
| `reports.ts` | `/api/reports` | GST registers, stock summary |
| `vendors.ts` | `/api/vendors` | vendor CRUD, bank statements |
| `customers.ts` | `/api/customers` | customer CRUD |
| `masters.ts` | `/api/masters` | categories, HSN, units |
| `banks.ts` | `/api/banks` | bank accounts |
| `expenses.ts` | `/api/expenses` | expense CRUD |
| `payroll.ts` | `/api/payroll` | staff, salary, payments |
| `quotations.ts` | `/api/quotations` | quotes CRUD |
| `orders.ts` | `/api/orders` | order fulfillment |
| `price-lists.ts` | `/api/price-lists` | slab pricing, `/resolve`, CSV `/bulk` |
| `rewards.ts` | `/api/rewards` | points earn/redeem |
| `warranties.ts` | `/api/warranties` | warranty CRUD |
| `replacements.ts` | `/api/replacements` | product replacement flow |
| `bill-settings.ts` | `/api/bill-settings` | PDF customization |
| `dashboard.ts` | `/api/analytics` | overview, recent activity |
| `onprem.ts` | `/api/onprem` | license activate/heartbeat/deactivate |
| `notifications.ts` | `/api/notifications` | Bell feed, digests, SA notify (mounted before blockVendors) |
| `super-admin.ts` | `/api/super-admin` | tenants, on-prem licenses, broadcast |
| `admin.ts` | `/api/admin` | per-tenant admin tools |
| `chatbot.ts` | `/api/chatbot` | AI assistant |
| `mapping.ts` | `/api/mapping` | bank statement UPI→vendor matching |

**Analytics endpoint** (`/api/analytics/overview`): returns `money`, `recentActivity`, `topVendors`, `counts` in one call via HTTP QUERY method (RFC 10008). The middleware at `server/index.ts:103` rewrites `QUERY` → `GET` and merges body into `req.query`.

---

## Frontend Features

Each feature lives in `src/features/<name>/`. The main view component is the default export, imported lazily in `App.tsx`.

```ts
// App.tsx pattern
const InventoryView = lazy(() => import('./features/inventory/InventoryView').then(m => ({ default: m.InventoryView })));
```

**State**: no global store. Each view fetches its own data on mount. Shared session state via `src/lib/session.ts` (localStorage).

**API client** (`src/api.ts`): typed wrapper around `fetch`. All calls go through `fetchApi<T>()` which attaches the Bearer token and tenant slug.

```ts
// Usage
const data = await api.analytics.overview(from, to);
const items = await api.products.list();
```

---

## On-Prem (Electron)

### Startup sequence (`electron/onprem/main.ts`)
1. Load license from `userData/license.dat` (AES-256 encrypted)
2. If no license → show wizard window
3. Start embedded PostgreSQL on a free port (via `findFreePort()`)
4. Set `DATABASE_URL=postgresql://localhost:<port>/dhandho`
5. Start Express server (same `server/index.ts`)
6. Open main app window at `http://localhost:<port>/<slug>`
7. Start heartbeat timer (every `HEARTBEAT_INTERVAL_MS`)

### Wizard flow
- User enters license key `DG-XXXX-YYYY-ZZZZ`
- Wizard POSTs to `POST /api/onprem/activate` (cloud server)
- On success: provisions local tenant, saves license, closes wizard

### License store (`electron/onprem/license-store.ts`)
- AES-256-GCM, key = `scrypt(machineId, salt, 32)`
- Stored at `app.getPath('userData')/license.dat`
- `getMachineId()` = SHA-256 of MAC addresses (stable across reboots)

### Heartbeat
- Every 60 min → `POST /api/onprem/heartbeat`
- Response `updateAvailable` → in-app notification
- Response `licenseValid: false` → blocking suspended modal

### Cloud wrapper (`electron/cloud/`)
- Opens `CLOUD_API` URL in a `BrowserWindow`
- `preload.ts` exposes `openExternal` for mailto/tel links

---

## Database

### Connection
```ts
// server/pg-db.ts
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
```
`initSchema()` runs on startup — all `CREATE TABLE IF NOT EXISTS` so safe to run repeatedly. No migration framework.

### Query pattern
```ts
// Always scope to tenant
const rows = await pool.query(
  'SELECT * FROM products WHERE tenant_id = $1 AND id = $2',
  [tenantId, productId]
);
```

### Tenant provisioning (`server/utils/tenant.ts`)
`provisionTenant(data)` does in one transaction:
1. INSERT tenant (with tab_config from business-type PRESET)
2. INSERT admin user
3. INSERT `OWNER` vendor
4. INSERT default redemption settings

Returns `{ tenantId, slug, credentials }`. Throws `DUPLICATE_SLUG` (400) if slug taken.

`deleteTenant(tenantId)` deletes all rows across all 30+ tables in dependency order.

---

## E2E Tests

```bash
python tests/e2e_by_type.py
```

453 tests across 4 business types (manufacturer, dealer, retail, service). Each type gets a fresh tenant, runs the full feature matrix, then tears down.

Manual test cases in `tests/cases/` — one markdown file per feature area.

---

## Scripts

| Command | What it does |
|---|---|
| `npm run dev:all` | Vite :3000 + Express :3001 concurrently |
| `npm run server` | Express only |
| `npm run build` | Vite production build → `dist/` |
| `npm start` | Express serving `dist/` (production) |
| `npm run lint` | TypeScript type check (no emit) |
| `npm test` | Vitest unit tests |
| `npm run cap:android` / `cap:ios` | Sync + open native IDE |
| `npm run ci:android` / `ci:ios` | Offline debug builds (same as GitLab CI) |
| `npm run electron:desktop:dev` | Unified Desktop Electron (Online/Offline picker) |
| `npm run electron:desktop:dev:local` | Desktop with `DG_CLOUD_URL=http://localhost:3001` |
| `npm run build:electron:desktop:win` | Desktop Windows .exe |
| `npm run build:electron:desktop:mac` | Desktop Mac .dmg |

---

## Deployment (Cloud)

Render web service:
- Build: `npm run build`
- Start: `npm start`
- Env: `DATABASE_URL`, `JWT_SECRET`, `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`

The Express server serves the React `dist/` at `/` and the API at `/api/*`. No separate frontend deployment needed.

---

## Key Files

| File | Purpose |
|---|---|
| `server/pg-db.ts` | DB pool + full schema (38 tables) |
| `server/index.ts` | Express app, middleware, route registration |
| `server/utils/tenant.ts` | Tenant lifecycle (provision, delete, stats) |
| `server/routes/super-admin.ts` | PRESETS object — authoritative tab configs per business type |
| `src/platforms/` | Shared API base, Electron desktop, Service Mobile |
| `server/routes/service-mobile.ts` | Service Mobile license / sync / backup APIs |
| `src/lib/businessTypeConfig.ts` | Frontend per-type feature flags |
| `src/lib/billTemplates.ts` | PDF bill HTML (sales, distribution, invoice, quotation) |
| `src/api.ts` | Typed API client |
| `electron/onprem/main.ts` | On-prem Electron main process |
| `electron/onprem/license-store.ts` | Encrypted local license storage |
