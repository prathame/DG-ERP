# Deployment Runbook — Dhandho (DG-ERP)

## Render (cloud) + external Postgres (Neon recommended)

The web service runs on Render. **Postgres is external** — use Neon (or Supabase / RDS / any Postgres). Do not rely on a Render-managed `dpg-*` database unless you intentionally provision one.

1. Create a Neon project → copy the **connection string** (URI, with `sslmode=require`).
2. Open the live Render web service **`dhandho-2kdx`** (`https://dhandho-2kdx.onrender.com`, service id `srv-d9fmf3gk1i2s73b4flgg`). Plain `dhandho.onrender.com` is not this service — Render assigned the `-2kdx` suffix because `dhandho` was taken or the service was created under that name. Subdomains are not renamable; point clients at the real URL (see [Hostname cutover](../engineering-academy/docs/deployment/render.md#hostname-cutover-dg-erp--dhandho)).
3. In Render → Environment, set:
   - `DATABASE_URL` = Neon URI (Dashboard paste; `sync: false` in blueprint)
   - `JWT_SECRET` (≥32 random characters)
   - `NODE_ENV=production`
   - `DATABASE_SSL=true`
   - `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (Neon / most managed PaaS)
   - `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (≥12 chars)
   - `ALLOWED_ORIGINS` — must include `https://dhandho-2kdx.onrender.com` (add `https://dhandho.app` only after DNS is live; keep `https://dg-erp.onrender.com` until that service is retired)
   - `PUBLIC_APP_URL=https://dhandho-2kdx.onrender.com`
   - Optional: `LOGTAIL_TOKEN`, `SECRETS_ENCRYPTION_KEY`
4. Remove any stale `DATABASE_URL` that still points at `dpg-…` (causes `ENOTFOUND` at boot).
5. Build: `npm ci --include=dev && npm run build:prod`  
   - `--include=dev` is required because Render sets `NODE_ENV=production`, which would skip build-time packages (`tailwindcss`, etc.).  
   - Do **not** run `npm test` on Render (must not hit the production DB). Tests run in GitHub Actions.  
   - `tailwindcss` is also listed under `dependencies` so production CSS builds resolve even if install flags change.
6. Start: `npm start` (serves API + `dist/` on `PORT`)
7. Health: `GET /api/health` → `{ ok: true, db: "up" }` (HTTP 503 if DB down) — verify on **`https://dhandho-2kdx.onrender.com`**.
8. Configure Render health check path: `/api/health`
9. TLS: managed hosts (Neon, Render PG, Supabase, …) default to `ssl.rejectUnauthorized: false` so Node accepts platform certs. Self-hosted Postgres keeps strict verify unless you opt out.

**Important:** If the Render Dashboard has a custom Build Command, it **overrides** `render.yaml`. Set it to:

```text
npm ci --include=dev && npm run build:prod
```

Do not use bare `npm ci && npm run build:prod` — with `NODE_ENV=production` that omits `devDependencies` and can fail on `husky` / Tailwind.

## Rollback

- Render: redeploy previous successful deploy from Dashboard → Events.
- Keep prior Docker/image/tag if self-hosting; avoid `force` pushes to `main` without review.

## Secret rotation

If any secret was ever committed or leaked:

1. Rotate `JWT_SECRET` (invalidates all sessions)
2. Rotate DB password / connection string
3. Rotate `SUPER_ADMIN_PASSWORD`
4. Rotate Logtail / GST keys as applicable
5. Purge from git history if needed (coordinate with team)

## Local production-like check

```bash
cp .env.example .env   # fill values
npm ci
npm test
npm run build
NODE_ENV=production ALLOWED_ORIGINS=http://localhost:3001 npm start
curl -s http://localhost:3001/api/health
```
