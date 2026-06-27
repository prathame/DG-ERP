# Developer Guide — DG Business

## Quick Start

```bash
git clone <repo-url>
cd splender-inventry
npm install
cp .env.example .env   # Edit with your DB credentials
npm run dev:all         # Frontend :3000 + Backend :3001
```

## Codebase Conventions

### Backend

**Route pattern** — every route file follows this structure:
```typescript
// server/routes/{module}.ts
import { Router } from 'express';
import { pool } from '../pg-db';

const router = Router();

router.get('/api/{module}', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    // ... query with WHERE tenant_id = $1
    res.json(data);
  } catch (err) {
    console.error('[API Error]', req.path, err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

**Key rules:**
- Every query MUST include `tenant_id = $1` — no exceptions
- Always cast PostgreSQL NUMERIC to `Number()` before returning (PG returns strings)
- Use `COALESCE(..., 0)` for SUM/COUNT to avoid null
- Phone validation: `^\+?\d[\d\s-]{6,14}$`
- Search: always use `ILIKE` not `LIKE` (case-insensitive)
- IDs: `P{timestamp}` (product), `V{timestamp}` (vendor), `D{timestamp}` (distribution), `PB{timestamp}-{random}` (purchase), `S{timestamp}` (supplier), `Q{timestamp}` (quotation)

**Adding a new route:**
1. Create `server/routes/yourmodule.ts`
2. Import and register in `server/index.ts`: `import yourRouter from './routes/yourmodule'; app.use(yourRouter);`
3. No middleware needed — tenant scoping is via `x-tenant-id` header (set by frontend `api.ts`)

### Frontend

**Feature component pattern:**
```
src/features/{module}/
└── {Module}View.tsx    # Main view component (single file)
```

Each view manages its own state. No global state management — each tab is independent.

**API calls** — use `api.ts` for existing modules. For new modules, use the session helper:
```typescript
import { session } from '../../lib/session';

function fetchApi<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = session.getToken();
  const tenantId = session.getTenantId();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  return fetch(`/api${path}`, { ...opts, headers }).then(r => {
    if (!r.ok) return r.json().then(e => { throw new Error(e.error || r.statusText); });
    return r.json();
  });
}
```

**Adding a new tab:**
1. Create `src/features/yourmodule/YourView.tsx`
2. Add to `src/types.ts` Tab type: `'yourtab'`
3. In `src/App.tsx`:
   - Import the component
   - Import icon from `lucide-react`
   - Add to `allNavItems` array
   - Add `{activeTab === 'yourtab' && <YourView />}` in render
4. Add to default tab config in `server/pg-db.ts` (line ~365)
5. Add migration for existing tenants: `UPDATE tenants SET tab_config = tab_config || '{"yourtab":...}'::jsonb WHERE ...`
6. Add to `server/utils/tenant.ts` `defaultTabConfig` object

### Database

**Schema location:** `server/pg-db.ts` → `initSchema()` function

**Adding a column:**
```typescript
// In initSchema(), after existing migrations:
await client.query('ALTER TABLE tablename ADD COLUMN IF NOT EXISTS column_name TYPE DEFAULT value');
```

**Adding a table:**
```typescript
await client.query(`
  CREATE TABLE IF NOT EXISTS your_table (
    id TEXT NOT NULL,
    tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    -- your columns
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, tenant_id)
  )
`);
await client.query('CREATE INDEX IF NOT EXISTS idx_yt_tenant ON your_table(tenant_id)');
```

Rules:
- Always include `tenant_id` with `REFERENCES tenants(id) ON DELETE CASCADE`
- Primary key is always `(id, tenant_id)` — composite
- Use `IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS` — migrations are idempotent
- Migrations run on every server startup — safe to add, never remove

### Session / Auth

**Multi-tab safety:** `src/lib/session.ts` scopes localStorage keys by URL path slug:
- `/admin` → `auth_token_admin`
- `/expert-electricals` → `auth_token_expert-electricals`

Never use `localStorage.getItem('auth_token')` directly — always use `session.getToken()`.

### Styling

- Tailwind CSS v4 with `cn()` helper for conditional classes
- Brand color: `#F27D26` (orange)
- Cards: `bg-white rounded-2xl border border-gray-100 shadow-sm`
- Buttons: primary `bg-[#F27D26] text-white rounded-xl font-bold`, secondary `border border-gray-200`
- Status colors: emerald=paid/success, rose=due/error, amber=warning, blue=info, purple=special
- Mobile: always add `sm:` breakpoints. Bottom nav is 60px — add `pb-24 lg:pb-8` to content

### Modals

Pattern used across all modules:
```tsx
{modalOpen && (
  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
    <div className="absolute inset-0 bg-black/40" onClick={() => setModalOpen(false)} />
    <div className="relative bg-white w-full max-w-md rounded-2xl shadow-xl max-h-[90vh] overflow-y-auto p-6">
      {/* Content */}
    </div>
  </div>
)}
```

### Bill Templates

`src/lib/billTemplates.ts` — generates HTML for invoices and challans. Contains:
- `generateSalesInvoiceHtml()` — sales bill with GST
- `generateDistributionChallanHtml()` — distribution challan
- `buildDistributionBillSlice()` — split bill (GST + non-GST)

Bills include: logo, colors, signatory, bank details, terms — all from `bill_settings` table.

## Key Data Flows

### Purchase → Inventory
```
POST /purchases/batch
  → generates barcodes (auto-detect prefix from existing)
  → INSERT product_inventory (status='InStock')
  → INSERT product_purchases (cost_price, billed_price)
  → INSERT supplier_payments (if amountPaid > 0)
```

### Distribution → Finance
```
POST /distribution/batch
  → picks InStock barcodes from product_inventory
  → UPDATE product_inventory SET status='Distributed'
  → INSERT product_distribution (net_price, billed_price)
  → INSERT vendor_payments (if amountPaid > 0, with batch_id)
```

### Quotation → Distribution
```
POST /quotations          → creates Draft quotation
PUT  /quotations/:id/status → Draft → Sent → Accepted
POST /quotations/:id/convert → creates distribution batch from quote items
```

### Accounts (auto-generated)
```
GET /accounts/profit-loss
  → Revenue: SUM(billed_price) from product_distribution
  → Expenses: SUM(billed_price) from product_purchases
  → Profit: Revenue - Expenses

GET /accounts/balance-sheet
  → Assets: inventory value + receivables + cash
  → Liabilities: payables (what you owe suppliers)
  → Net Worth: Assets - Liabilities
```

## Common Patterns

### PostgreSQL NUMERIC → JavaScript Number
PG returns NUMERIC columns as strings. Always cast:
```typescript
// BAD — string concatenation
totalDistributedValue: row.total_value,

// GOOD — proper number
totalDistributedValue: Number(row.total_value) || 0,
```

### Batch-level Payment Tracking
Both vendor_payments and supplier_payments have `batch_id`:
```sql
-- Payments for a specific batch
SELECT SUM(amount) FROM vendor_payments WHERE batch_id = $1 AND tenant_id = $2

-- All vendor payments (includes batch + non-batch)
SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2
```

### Pack Size
Products have `pack_size` (default 1) and `pack_name` (default 'Piece'). Frontend converts:
```typescript
// User enters 2 Boxes, packSize=10 → send quantity=20 to API
const actualPieces = unitMode === 'pack' ? quantity * packSize : quantity;
```

Backend always works in pieces. Pack conversion is frontend-only.

## Testing

### Manual E2E
```bash
python3 /tmp/e2e-full.py   # Comprehensive 107-test suite
```

### API smoke test
```bash
# Login
TOKEN=$(curl -s -X POST localhost:3001/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@test.com","password":"test1234"}' | jq -r .token)

# List products
curl -s localhost:3001/api/products -H "Authorization: Bearer $TOKEN"
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | JWT signing secret (min 32 chars) |
| `SUPER_ADMIN_EMAIL` | Yes | Platform admin email |
| `SUPER_ADMIN_PASSWORD` | Yes | Platform admin password |
| `ALLOWED_ORIGINS` | No | CORS origins (comma-separated) |
| `PORT` | No | Server port (default: 3001) |
| `DATABASE_SSL` | No | Set `true` for SSL connections |
| `NODE_ENV` | No | `production` or `development` |
