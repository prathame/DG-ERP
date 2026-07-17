---
sidebar_label: First Feature
title: Guided First Feature — a Tiny Endpoint + UI
description: Build a complete, tiny, real feature end-to-end — a per-tenant pinned note on the dashboard — to internalize DG-ERP's conventions.
---

# Guided First Feature — a Tiny "Pinned Note"

Reading code teaches you what exists. Writing a feature teaches you what's *required*. This tutorial has you build one deliberately small, deliberately real feature, touching every layer: schema, route, permissions, frontend API client, and UI. Budget 90–120 minutes.

**What you'll build:** a per-tenant "pinned note" — a single free-text note an Admin can set, that shows as a small card on the Dashboard for everyone in that tenant to see (think: "GST filing due Friday" or "New price list from Monday"). One row per tenant, editable, no history.

This is intentionally too small to be "useful" as a product feature — that's the point. Every pattern you'll use here (tenant scoping, permission gating, typed API client, lazy-loaded view) is the *exact same pattern* used by the 200-line real routes you'll write in week 2.

## Step 0 — Decide where it lives

Look at the module → path mapping in `server/middleware/permissions.ts` (`PATH_MODULE`). Notes will live under the `dashboard` module (same bucket as `/analytics`), since that's what they're read from. Route prefix: `/api/notes`.

## Step 1 — Add the table

Open `server/pg-db.ts`. Every table in this codebase gets `CREATE TABLE IF NOT EXISTS` (idempotent — safe to re-run), a `tenant_id` foreign key, and a composite primary key of `(id, tenant_id)` for tenant-scoped tables. Add this near the other small platform-config-adjacent tables, right after the `bill_settings` table definition, inside the big template string passed to `client.query(...)` in `initSchema()`:

```sql
CREATE TABLE IF NOT EXISTS pinned_notes (
  id TEXT NOT NULL,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  updated_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (id, tenant_id)
);
CREATE INDEX IF NOT EXISTS idx_pinned_notes_tenant ON pinned_notes(tenant_id);
```

Also add `pinned_notes` to the `rlsTables` array at the bottom of `initSchema()` so Row Level Security is enabled on it, matching every other tenant-scoped table:

```ts
const rlsTables = [
  'users', 'vendors', /* ...existing entries... */, 'standalone_invoices',
  'tenant_invoices', 'tenant_stats', 
  'pinned_notes', // ← add this
];
```

Restart `npm run server` (remember: no file watching on the backend — see [Local Setup](./local-setup.md)). Confirm in the console you see `✓ Row Level Security policies applied` with no errors, then verify the table exists:

```bash
psql dhandho -c "\d pinned_notes"
```

:::tip Why one row per tenant, not a `notes` list?
Keeping it to a single row (`id = 'default'` by convention, like `redemption_settings`) means your `GET` is a trivial single-row lookup with no pagination, and your `PUT` is an upsert. This mirrors real settings-style tables (`bill_settings`, `redemption_settings`) rather than list-style tables (`products`, `customers`). Pick the shape that matches the real feature you're studying — most "settings" features are single-row.
:::

## Step 2 — Write the route

Create `server/routes/notes.ts`:

```ts
import { Router } from 'express';
import { requireAdmin, blockVendors, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { logAudit } from '../utils/helpers';

const router = Router();

router.get('/api/notes/pinned', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const row = (await pool.query(
      'SELECT text, updated_at FROM pinned_notes WHERE id = $1 AND tenant_id = $2',
      ['default', tenantId]
    )).rows[0] as { text: string; updated_at: string } | undefined;

    res.json({ text: row?.text || '', updatedAt: row?.updated_at || null });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/api/notes/pinned', requireAdmin, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const text = String(req.body?.text ?? '').slice(0, 500).trim();

    await pool.query(
      `INSERT INTO pinned_notes (id, tenant_id, text, updated_by, updated_at)
       VALUES ('default', $1, $2, $3, NOW())
       ON CONFLICT (id, tenant_id) DO UPDATE SET text = $2, updated_by = $3, updated_at = NOW()`,
      [tenantId, text, req.user?.userId || null]
    );

    await logAudit(pool, tenantId, 'Pinned Note Updated', 'system', undefined, text.slice(0, 80));
    res.json({ ok: true, text });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

Notice what's copied from every other route file, on purpose:

- `tenantId` comes from `req.headers['x-tenant-id']`, **never** from `req.body` or a query param — that header was set by the trusted JWT-decoding middleware in `server/app.ts`, not by the client.
- Every query includes `AND tenant_id = $N` — this is the primary tenant-isolation mechanism; RLS is the safety net, not a substitute.
- The `catch` block never leaks `err.message` to the client — only `Internal server error`. Real detail goes to `console.error`/`logger.error` (server-side only).
- `requireAdmin` gates the mutating route; `blockVendors` is redundant with `requireAdmin` here but included because it's the idiom used on every other Admin-only write route in this codebase — copy the idiom, not just the outcome.
- `logAudit` records the change in `audit_log` — every mutation of tenant-visible state does this.

## Step 3 — Register the route

Open `server/app.ts`. Add the import near the other route imports:

```ts
import notesRouter from './routes/notes';
```

And register it alongside the others (order doesn't matter — Express tries each router until one matches):

```ts
app.use(notesRouter);
```

Restart the server. Confirm with `curl` (grab a Bearer token from `localStorage.getItem('token')` in your browser devtools console after logging in as a tenant admin):

```bash
TOKEN="paste-your-jwt-here"
curl -s http://localhost:3001/api/notes/pinned -H "Authorization: Bearer $TOKEN" | jq
curl -s -X PUT http://localhost:3001/api/notes/pinned \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"text":"GST filing due this Friday"}' | jq
```

**Exit criterion for the backend half:** both curls return sane JSON and a second `GET` reflects your `PUT`.

## Step 4 — Add it to the permission map (optional but correct)

`enforceModulePermissions` in `server/middleware/permissions.ts` only gates paths listed in `PATH_MODULE`. `/api/notes` isn't listed, so right now it's **ungated by module permission** — any authenticated user of any role can call it (subject only to the route-level `requireAdmin` on the `PUT`). That's an intentional gap for a real feature but a good exercise: add it explicitly so a `Warehouse` or `Staff` role's dashboard visibility is deliberate, not accidental:

```ts
const PATH_MODULE: [string, string][] = [
  // ...
  ['/notes', 'dashboard'],
];
```

Now `GET /api/notes/pinned` requires `view` level on `dashboard` for the caller's role, and `PUT` requires `full` — check `ROLE_PRESETS` to see which roles have which level today.

## Step 5 — Add the typed API client method

Open `src/api.ts`. Find the section with small settings-style methods (near `redemption`/`billSettings`-style helpers) and add:

```ts
export interface PinnedNote {
  text: string;
  updatedAt: string | null;
}

// inside the exported `api` object:
notes: {
  getPinned: () => fetchApi<PinnedNote>('/notes/pinned'),
  setPinned: (text: string) => fetchApi<{ ok: true; text: string }>('/notes/pinned', {
    method: 'PUT',
    body: JSON.stringify({ text }),
  }),
},
```

`fetchApi<T>()` already attaches the `Authorization` header and tenant slug for you — that's the entire point of having a typed client instead of calling `fetch` directly from components.

## Step 6 — Add the UI card

Open `src/features/dashboard/DashboardView.tsx`. Near the top of the component, add local state and a fetch-on-mount:

```tsx
const [pinnedNote, setPinnedNote] = useState<{ text: string; updatedAt: string | null }>({ text: '', updatedAt: null });

useEffect(() => {
  api.notes.getPinned().then(setPinnedNote).catch(() => {});
}, []);
```

Render a small card near the top of the dashboard grid:

```tsx
{pinnedNote.text && (
  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 mb-4">
    <p className="text-sm font-semibold text-amber-800">📌 Pinned Note</p>
    <p className="text-sm text-amber-900 mt-1">{pinnedNote.text}</p>
  </div>
)}
```

For an editable version, an Admin-only inline textarea + "Save" button calling `api.notes.setPinned(text)` is a natural follow-up — but stop here for this tutorial. The goal was end-to-end plumbing, not a finished feature.

## Step 7 — Verify in the browser

1. Reload the tenant app. If you already `PUT` a note via curl, it should render.
2. Open DevTools Network tab, confirm `GET /api/notes/pinned` fires once on mount with a 200.
3. Log in as a `Staff` role user (if you have one) and confirm the card still renders (view-level access) but you have no way to edit it in the UI yet (matches step 4's gating).

## What you just learned, mapped to the real codebase

| What you did | Where the same pattern appears at scale |
|---|---|
| `tenant_id` + composite PK table | Every one of the 38 tables in `server/pg-db.ts` |
| Route-level `requireAdmin` + tenant header scoping | Every file in `server/routes/*.ts` |
| `logAudit(...)` on mutation | `server/routes/audit.ts`, and every write route |
| `PATH_MODULE` entry | `server/middleware/permissions.ts` |
| Typed method group on `api` object | `src/api.ts` — one namespace per feature |
| `lazy()`-loaded view + `useEffect` fetch-on-mount | Every view under `src/features/*` |

## Stretch goals (do these on day 2–3, not today)

1. Add a `DELETE /api/notes/pinned` that clears the text (don't actually delete the row — just blank it, matching the upsert pattern).
2. Add a Vitest integration test in `tests/api/` following the pattern in [API Integration Testing](/testing/api-integration) — spin up a tenant, `PUT` a note, assert the `GET` reflects it, assert a `Staff`-role token gets 403 on `PUT`.
3. Add the note to the [`/api/backup`](/sre/disaster-recovery) export and the restore allowlist in `server/routes/audit.ts` — trace how `BACKUP_COLUMN_ALLOWLIST` works and why a new table needs an explicit entry there to be restorable.

## Related pages

- [Local Setup](./local-setup.md)
- [How to Add Tests](/testing/how-to-add-tests)
- [Lab: Add an Endpoint](/labs/lab-add-endpoint) — a second, slightly harder rep of this same skill
- [File Walkthrough: routes](/files/server/routes)
- [File Walkthrough: middleware-permissions](/files/server/middleware-permissions)
