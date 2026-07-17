---
sidebar_label: Local Setup
title: Local Setup — Running Dhandho on Your Machine
description: Step-by-step environment setup for prathame/DG-ERP — Postgres, .env, npm scripts, and how to verify each piece actually works before moving on.
---

# Local Setup — Running Dhandho on Your Machine

:::tip Before you start
You need Node.js (matching the `@types/node` ^22 in `package.json`, so Node 20+ is a safe bet) and a local or remote PostgreSQL 16 instance. You do **not** need Docker or Electron tooling to do normal feature development.
:::

## 1. Clone and install

```bash
git clone https://github.com/prathame/DG-ERP.git
cd DG-ERP
npm install
```

`npm install` also runs the `prepare` script, which tries to install Husky git hooks but **silently no-ops** if that fails (`try { execSync('husky') } catch(e) { process.exit(0) }`) — this is why CI environments and sandboxed installs don't break even without git hook support.

## 2. Get a PostgreSQL database

Any of these work:

| Option | Command / setup |
|---|---|
| Local Postgres via Homebrew (macOS) | `brew install postgresql@16 && brew services start postgresql@16`, then `createdb dg_erp_dev` |
| Local Postgres via a container | `docker run -d -p 5432:5432 -e POSTGRES_PASSWORD=devpassword -e POSTGRES_DB=dg_erp_dev postgres:16` |
| A free-tier managed instance (Render/Neon) | Copy the connection string it gives you |

:::warning Don't use a "default" password
`server/utils/env.ts` explicitly rejects `DATABASE_URL`s containing `postgres`/`password`/`admin`/`123456`/etc. **in production**. Locally it won't block you, but it's good practice to use a real random password from day one so you never accidentally carry a weak credential into a shared or deployed environment.
:::

## 3. Create your `.env`

Copy `.env.example` to `.env` and fill in the required values:

```bash
cp .env.example .env
```

```dotenv
# ── Required ──
DATABASE_URL=postgresql://postgres:devpassword@localhost:5432/dg_erp_dev
JWT_SECRET=a-random-string-that-is-at-least-32-characters-long
SUPER_ADMIN_EMAIL=you@yourcompany.dev
SUPER_ADMIN_PASSWORD=SomethingAtLeast12Chars!

# ── Optional, defaults are fine for local dev ──
PORT=3001
NODE_ENV=development
```

Generate a real random `JWT_SECRET` rather than typing something memorable:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Never commit `.env`** — it's gitignored, and `.env.example` exists specifically so nothing secret ever needs to live in git history.

## 4. First boot — schema creation

```bash
npm run server
```

Watch the console output carefully on this first run. You should see, in order:

```
✓ Super admin created: [REDACTED_EMAIL]
✓ Plans seeded (Trial, Basic, Standard, Professional)
✓ Row Level Security policies applied
✓ Database schema ready
```

If instead you see `❌ FATAL: ...` and the process exits immediately, `assertCriticalEnv()` caught a real configuration problem — the message tells you exactly which env var is missing or invalid; fix it and re-run. This is `initSchema()` (see [Schema Overview](/database/schema-overview)) creating every table idempotently — safe to run again any time, including after pulling new schema changes from `main`.

## 5. Run the frontend + backend together

In a fresh terminal (leave the server running, or use the combined script):

```bash
npm run dev:all
```

This runs `npm run server` and `npm run dev` concurrently (`&` in the script) — Vite serves the React app on **port 3000** and proxies `/api` requests to Express on **port 3001** (see the `server.proxy` config in `vite.config.ts`). Open `http://localhost:3000`.

## 6. Log in for the first time

There is no self-service signup ([Authentication](/security/authentication) explains why). Your first login is as **Super Admin**, using the `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` from your `.env`, at `http://localhost:3000/admin`. From there, provision your first tenant (see [Day 1 Onboarding](/tutorials/day-1-onboarding) for the exact steps) to get a normal tenant-admin login you can use for feature work.

## 7. Running tests

```bash
npm test              # vitest run — one-shot
npm run test:watch    # vitest — watch mode
npm run test:coverage # vitest run --coverage
```

Tests spin up their own scratch schema via `tests/globalSetup.ts` — they do **not** run against your dev `.env`'s database by mutating it destructively in ways that would surprise you, but they do need a reachable `DATABASE_URL`. See [Testing Overview](/testing/overview) for how test isolation works.

## 8. Common first-run problems

| Symptom | Likely cause | Fix |
|---|---|---|
| `❌ FATAL: DATABASE_URL environment variable is required` | `.env` missing or not loaded | Confirm `.env` exists in the repo root and `dotenv.config()` in `pg-db.ts` can find it (run commands from the repo root) |
| `ECONNREFUSED` connecting to Postgres | Postgres isn't running, or wrong port/host in `DATABASE_URL` | `pg_isready` (if installed) or check your container/service status |
| Vite dev server loads but every API call 404s or CORS-errors | Backend (`npm run server`) isn't running alongside `npm run dev` | Use `npm run dev:all`, or run both in separate terminals |
| Login says "Invalid email or password" for your Super Admin | Env values changed after the account was already seeded (seeding is a one-time create-if-missing) | Update the password directly in the DB, or drop and recreate the `super_admins` row, then restart the server |
| `JWT_SECRET should be at least 32 characters` warning | Your dev secret is too short | Not fatal in dev, but fix it anyway — see the `node -e` snippet above |

## Hands-on exercise

1. Deliberately misconfigure `DATABASE_URL` (wrong port) and observe the exact failure mode and message. Fix it and confirm the schema-creation success messages appear.
2. After your first successful boot, connect with `psql` and run `\dt` — count the tables. Cross-reference a handful against [Schema Overview](/database/schema-overview) to confirm they match.
3. Stop the server, delete a single row from the `plans` table directly via `psql`, and restart the server. Confirm `seedPlatformData()`'s `ON CONFLICT (id) DO UPDATE` behavior — does the deleted plan come back?

## Quiz

1. Why doesn't `npm install` fail in a sandboxed CI environment without git hook support?
2. What's the very first thing you should check if the server process exits immediately with a `❌ FATAL` message?
3. Why is there no "sign up" button to click through on your very first login?

<details>
<summary>Answers</summary>

1. The `prepare` script wraps the Husky install in a try/catch that calls `process.exit(0)` on failure, deliberately swallowing the error so the overall `npm install` still succeeds.
2. Read the exact fatal message text — `assertCriticalEnv()` names the specific missing or invalid environment variable directly in its error output, so there's rarely any guessing involved.
3. Self-service signup is disabled by design (`410 Gone`) — all tenants are provisioned by a Super Admin, reflecting the product's admin-led onboarding model rather than a self-serve SaaS signup flow.

</details>

## Related pages

- [Day 1 Onboarding](/tutorials/day-1-onboarding)
- [First Feature](/tutorials/first-feature)
- [Env Vars](/deployment/env-vars)
- [Testing Overview](/testing/overview)
- [Schema Overview](/database/schema-overview)
