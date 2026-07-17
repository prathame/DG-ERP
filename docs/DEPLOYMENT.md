# Deployment Runbook — Dhandho (DG-ERP)

## Render (cloud)

1. Ensure Postgres + web service from `render.yaml` (or Dashboard equivalents).
2. Set **required** environment variables before first production traffic:
   - `DATABASE_URL` (from Render Postgres)
   - `JWT_SECRET` (≥32 random characters)
   - `NODE_ENV=production`
   - `DATABASE_SSL=true`
   - `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` (≥12 chars)
   - `ALLOWED_ORIGINS` — e.g. `https://dhandho.app,https://www.dhandho.app,https://dg-erp.onrender.com`
   - Optional: `LOGTAIL_TOKEN`, `PUBLIC_APP_URL=https://dhandho.app`
3. Build: `npm ci --include=dev && npm run build:prod`  
   - `--include=dev` is required because Render sets `NODE_ENV=production`, which would skip build-time packages (`tailwindcss`, etc.).  
   - Do **not** run `npm test` on Render (must not hit the production DB). Tests run in GitHub Actions.  
   - `tailwindcss` is also listed under `dependencies` so production CSS builds resolve even if install flags change.
4. Start: `npm start` (serves API + `dist/` on `PORT`)
5. Health: `GET /api/health` → `{ ok: true, db: "up" }` (HTTP 503 if DB down)
6. Configure Render health check path: `/api/health`

If the Dashboard build command was customized, set it to match `render.yaml`.

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
