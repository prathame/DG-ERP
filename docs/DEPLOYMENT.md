# Deployment Runbook — Dhandho (DG-ERP)

## Render (cloud) + external Postgres (Neon recommended)

The web service runs on Render. **Postgres is external** — use Neon (or Supabase / RDS / any Postgres). Do not rely on a Render-managed `dpg-*` database unless you intentionally provision one.

1. Create a Neon project → copy the **connection string** (URI, with `sslmode=require`).
2. Create / open the Render web service from `render.yaml` (or Dashboard).
3. In Render → Environment, set:
   - `DATABASE_URL` = Neon URI (Dashboard paste; `sync: false` in blueprint)
   - `JWT_SECRET` (≥32 random characters)
   - `NODE_ENV=production`
   - `DATABASE_SSL=true`
   - `DATABASE_SSL_REJECT_UNAUTHORIZED=false` (Neon / most managed PaaS)
   - `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (≥12 chars)
   - `ALLOWED_ORIGINS` — e.g. `https://dhandho.app,https://www.dhandho.app,https://dhandho.onrender.com`
   - Optional: `LOGTAIL_TOKEN`, `SECRETS_ENCRYPTION_KEY`, `PUBLIC_APP_URL`
4. Remove any stale `DATABASE_URL` that still points at `dpg-…` (causes `ENOTFOUND` at boot).
5. Build: `npm ci --include=dev && npm run build:prod`  
   - `--include=dev` is required because Render sets `NODE_ENV=production`, which would skip build-time packages (`tailwindcss`, etc.).  
   - Do **not** run `npm test` on Render (must not hit the production DB). Tests run in GitHub Actions.  
   - `tailwindcss` is also listed under `dependencies` so production CSS builds resolve even if install flags change.
6. Start: `npm start` (serves API + `dist/` on `PORT`)
7. Health: `GET /api/health` → `{ ok: true, db: "up" }` (HTTP 503 if DB down)
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
