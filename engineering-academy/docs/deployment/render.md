---
sidebar_label: Render
title: Render — render.yaml, Build Filter, and the --include=dev Gotcha
description: How DG-ERP deploys to Render in production, the render.yaml Blueprint, the doc-only build filter, and the notorious --include=dev requirement.
---

# Render

Render is the production home for the cloud SaaS. Deployment is declarative via `render.yaml` (a [Render Blueprint](https://render.com/docs/blueprint-spec)) — there's no manual dashboard clicking required to reproduce the service from scratch.

## `render.yaml`, annotated

```yaml
# Web on Render; Postgres is external (Neon recommended) via DATABASE_URL.
# No databases: / fromDatabase — paste Neon into DATABASE_URL.
services:
  - type: web
    name: dhandho-2kdx   # → https://dhandho-2kdx.onrender.com (live service)
    plan: free
    runtime: node
    buildCommand: npm ci --include=dev && npm run build:prod
    startCommand: npm start
    healthCheckPath: /api/health
    envVars:
      - key: DATABASE_URL
        sync: false   # paste Neon (or any Postgres) URI in the dashboard
      - key: JWT_SECRET
        generateValue: true
      - key: NODE_ENV
        value: production
      - key: HUSKY
        value: "0"
      - key: PORT
        value: 3001
      - key: DATABASE_SSL
        value: "true"
      - key: DATABASE_SSL_REJECT_UNAUTHORIZED
        value: "false"
      - key: SUPER_ADMIN_EMAIL
        sync: false
      - key: SUPER_ADMIN_PASSWORD
        sync: false
      - key: ALLOWED_ORIGINS
        value: https://dhandho-2kdx.onrender.com
      - key: LOGTAIL_TOKEN
        sync: false
      - key: PUBLIC_APP_URL
        value: https://dhandho-2kdx.onrender.com
```

:::tip Neon (or any Postgres)
The app does **not** require Render-managed Postgres. Set `DATABASE_URL` to a Neon connection string (`…neon.tech…?sslmode=require`). A stale Render `dpg-*` host causes `getaddrinfo ENOTFOUND` at boot — replace it with the Neon URI.
:::

## The `--include=dev` gotcha — why it's there and what breaks without it

This is the single most important line in this file, and the comment above it exists because someone got bitten by it once:

```yaml
buildCommand: npm ci --include=dev && npm run build:prod
```

**The trap:** when `NODE_ENV=production` is set (which Render sets automatically, and which this file also sets explicitly as an env var), a plain `npm ci` **skips `devDependencies` entirely** — that's npm's documented behavior. But `npm run build:prod` runs `vite build`, and Vite's plugin chain (`@tailwindcss/vite`, `@vitejs/plugin-react`) are listed under `devDependencies` in `package.json`, not `dependencies` — because they're build-time-only tools, which is the *conventional* place to put them.

Without `--include=dev`, the build command would run `npm ci` (silently install zero dev tools because `NODE_ENV=production` is already set), then `vite build` would immediately fail with a "Cannot find module '@tailwindcss/vite'" or `@vitejs/plugin-react` resolution error — a build failure that looks like a broken dependency, not like an environment-variable interaction, which makes it a genuinely confusing first debugging session if you haven't seen it before.

**The fix, explained:** `--include=dev` forces npm to install `devDependencies` regardless of `NODE_ENV`, so the build step has everything it needs. Once the build finishes and `npm start` runs the actual server, those dev tools are simply unused (present but harmless) — Render doesn't do a separate "prune devDependencies after build" step here, unlike the Dockerfile's two-stage approach which explicitly does (see [Docker](./docker)). This is a real, deliberate difference between the two deployment paths worth knowing: **Render's runtime image still has devDependencies installed; the Docker image does not.**

:::tip The general lesson
Any time a build tool lives in `devDependencies` but your build command's shell environment sets `NODE_ENV=production` before the install step runs, you need `--include=dev` (or `--production=false`, the older npm flag). This isn't Dhandho-specific — it's an npm/`NODE_ENV` interaction every Node project deploying to a PaaS eventually hits.
:::

## `npm run build:prod` vs `npm run build`

Both currently resolve to the same underlying command (`vite build`) in `package.json` — `build:prod` exists as a semantically distinct script name specifically for deploy tooling like `render.yaml`, so that if cloud builds ever need extra production-only steps (bundle analysis upload, source map stripping, etc.) they can be added to `build:prod` without touching the `build` script that local developers and CI's generic "does it build" checks use.

## Why `npm test` is explicitly *not* in `buildCommand`

The comment says it plainly: **tests must not hit the production database.** Render's build/start uses your live `DATABASE_URL` (e.g. Neon) — there is no separate throwaway database for a build-time test run. Running Vitest here would mean test fixtures executing against production data. All test execution happens in CI (`pr-check.yml`, `build.yml`, `release.yml`), each spinning up its own **ephemeral** `postgres:16` service container — see [CI/CD](./cicd.md).

## The `envVars` block, decoded

| Key | Mechanism | Why |
|---|---|---|
| `DATABASE_URL` | `sync: false` — paste Neon / any Postgres URI in the dashboard | Provider-agnostic; do not use a deleted Render `dpg-*` host |
| `JWT_SECRET` | `generateValue: true` — Render generates a cryptographically random value once, at first deploy | Satisfies `assertCriticalEnv()`'s ≥32-char production requirement automatically, and nobody ever has to choose/type a secret manually |
| `NODE_ENV` | Static `production` | Drives every environment-conditional branch across `server/app.ts`, `server/pg-db.ts`, `server/utils/env.ts` |
| `HUSKY: "0"` | Static | Skips git-hook installation during the Render build — `husky` is a local-dev-only tool (pre-commit lint hooks); installing it in a CI/PaaS build environment with no git hooks to run is pointless overhead, and can even fail outright in some sandboxed build environments |
| `PORT` | Static `3001` | Must match what `server/index.ts` binds to; Render's own routing layer expects the app to listen on this port |
| `DATABASE_SSL` | Static `"true"` | Forces TLS to the managed Postgres — also enforced independently by `assertCriticalEnv()`'s production checks, so this is belt-and-suspenders |
| `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` | `sync: false` — you must set these manually in the Render dashboard, they are **not** committed or auto-generated | These are real, sensitive platform-owner credentials — `generateValue` wouldn't make sense (you need to know the value to log in), and committing a plaintext value to `render.yaml` would defeat the entire point |
| `ALLOWED_ORIGINS` | Static `https://dhandho-2kdx.onrender.com` | Required by `assertCriticalEnv()` so Blueprint boots without a blank CORS list. Cap shells (`capacitor://localhost`, etc.) are allowlisted in code. Extend in the Dashboard (comma-separated) for `dg-erp` while both exist, or `dhandho.app` after DNS is live. |
| `LOGTAIL_TOKEN` | `sync: false` | Optional; logging works fine without it (see [Logging](/sre/logging)), so it's not required at first deploy, but also not something to commit |
| `PUBLIC_APP_URL` | Static `https://dhandho-2kdx.onrender.com` (until `dhandho.app` DNS is live) | Absolute links (invite links, PDF footers). Must match the live web service URL. Switch to `https://dhandho.app` only after DNS is live. |

## The doc-only build filter (`render-build-filter.sh`)

Render supports a "Build Filter" script — if it exits non-zero, Render skips the deploy for that push entirely. This repo ships one specifically to save build minutes on documentation-only commits:

```bash
changed_files=$(git diff --name-only HEAD~1 HEAD 2>/dev/null)
non_doc_changes=$(echo "$changed_files" | grep -v '\.md$' | grep -v '^LICENSE$' | grep -v '^DEVELOPER\.md$' | grep -Ev '^(README|CHANGELOG|CONTRIBUTING)\.md$')

if [ -z "$non_doc_changes" ]; then
  echo "=> Only documentation files changed, skipping deploy:"
  exit 1
else
  echo "=> Application files changed, deploying:"
  exit 0
fi
```

**How to wire it up:** paste this script's path into Render Dashboard → your service → Settings → **Build & Deploy → Build Filter**. It is not automatically active just by existing in the repo — Render must be configured to invoke it.

**What it protects against:** without it, editing `README.md` (or, notably, this very engineering-academy's own separate `docs/` tree, if it ever lived in the same repo's build path) would trigger a full `npm ci --include=dev && npm run build:prod` cycle and a service restart — wasted build minutes and an unnecessary, if brief, redeploy for a change with zero functional impact.

**Its blind spot:** it only compares `HEAD~1` to `HEAD` — a single-commit diff. If you squash-merge a PR with 20 commits (10 docs, 10 code) into one commit on `main`, the filter correctly sees the *combined* diff and deploys (correct, since real code changed). But if `HEAD~1` isn't actually the immediately-prior deploy for some reason (e.g. Render's build queue coalesced multiple pushes), the comparison could be against the wrong baseline. In practice, with linear `main` history and one deploy per push, this isn't an issue — but it's the kind of assumption worth re-verifying if the git workflow ever changes.

## Deploying manually / checking a deploy

- Push to `main` → Render's auto-deploy (assuming it's watching that branch) picks it up, runs the build filter, then the build/start commands.
- Watch the Render dashboard's deploy logs for the `npm ci --include=dev` step specifically if a build fails right after a dependency change — it's the first thing to check.
- After deploy, hit `https://dhandho-2kdx.onrender.com/api/health` to confirm `{"ok":true,"db":"up"}`. Do not use `dhandho.app` until that DNS is live.

## Hostname cutover (`dg-erp` → `dhandho-2kdx`) {#recreate-web-service-as-dhandho}

**How Render hostnames work:** the web service **name** chosen at create time becomes `https://<name>.onrender.com`. That subdomain is **not** renamable later ([Render feedback](https://feedback.render.com/features/p/ability-to-change-onrendercom-sub-domain)) — changing the display name in the Dashboard does not move the URL.

**Live production today:** service **`dhandho-2kdx`** → `https://dhandho-2kdx.onrender.com` (id `srv-d9fmf3gk1i2s73b4flgg`). Render assigned the `-2kdx` suffix because plain `dhandho` was taken or the service was created under that name. Do **not** try to rename onto `dhandho.onrender.com` — set `PUBLIC_APP_URL` / `ALLOWED_ORIGINS` (and Cap/Electron defaults) to the real URL. Root `render.yaml` `name:` matches `dhandho-2kdx` so Blueprint sync updates this service.

**Probe:**

| URL | Expected |
|---|---|
| `https://dhandho-2kdx.onrender.com/api/health` | `200` + `{"ok":true,"db":"up"}` (live app) |
| `https://dhandho.onrender.com/` | Usually `no-server` / not this service — ignore for ops |

### Dashboard env checklist (existing `dhandho-2kdx`)

1. Confirm service name / URL is `dhandho-2kdx` — do not create a second service named `dhandho` to “fix” the hostname.
2. Env must include:
   - `DATABASE_URL` — Neon URI; never a deleted `dpg-*` host
   - `DATABASE_SSL=true`, `DATABASE_SSL_REJECT_UNAUTHORIZED=false`
   - `JWT_SECRET` — keep stable if existing sessions/tokens must keep working
   - `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD`
   - `ALLOWED_ORIGINS=https://dhandho-2kdx.onrender.com` (add `https://dg-erp.onrender.com` while both exist if needed; add `https://dhandho.app` only after DNS is live)
   - `PUBLIC_APP_URL=https://dhandho-2kdx.onrender.com`
   - Optional: `LOGTAIL_TOKEN`, `SECRETS_ENCRYPTION_KEY`
3. Confirm Build Command is `npm ci --include=dev && npm run build:prod` and health check path is `/api/health`.
4. Redeploy, then verify:
   - `curl -sI https://dhandho-2kdx.onrender.com/` → `200`
   - `curl -s https://dhandho-2kdx.onrender.com/api/health` → `{"ok":true,"db":"up",…}`
5. Cap Online / Electron Cloud default to this host in repo; rebuild only if you baked a different `VITE_API_ORIGIN` / `DG_CLOUD_URL`.
6. After `dhandho-2kdx` is healthy: suspend or delete legacy `dg-erp` if it still exists.
7. Later: attach custom domain `dhandho.app` when DNS is ready; then switch `PUBLIC_APP_URL` / `ALLOWED_ORIGINS` to that host.

**Do not** create an empty second web service without wiring the same Neon `DATABASE_URL` and secrets — that yields a blank or failing host while Neon still holds production data.

## Related pages

- [Docker](./docker.md)
- [CI/CD](./cicd.md)
- [Environment Variables](./env-vars.md)
- [Runbooks → Deploy Rollback](/runbooks/deploy-rollback)
