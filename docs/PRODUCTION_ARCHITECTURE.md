# DG-ERP Production Architecture
> Last updated: 2026-08-14

---

## Deployment Overview

DG-ERP runs as a single-process Node.js application on Render.com (free tier → upgrade for SLA), backed by Neon managed PostgreSQL.

```
┌─────────────────────────────────────────────────────────────────┐
│                    INTERNET / CLIENTS                           │
│                                                                 │
│  Browser/PWA        Electron Desktop      Capacitor Mobile     │
│  (HTTPS)            (HTTPS via Cloud)     (HTTPS + Capacitor)  │
└───────────────┬─────────────────┬──────────────┬───────────────┘
                │                 │              │
                ▼                 ▼              ▼
┌───────────────────────────────────────────────────────────────┐
│                   RENDER.COM (Web Service)                    │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  Node.js 22 / tsx / Express                          │    │
│  │                                                      │    │
│  │  Serves:                                             │    │
│  │  • /api/*       REST API (JWT auth, FORCE RLS)       │    │
│  │  • /            React SPA (dist/)                    │    │
│  │  • /manifest.json  PWA manifest (tenant-branded)     │    │
│  │                                                      │    │
│  │  Port: 3001 (internal) → 443 (HTTPS via Render)     │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  Environment: NODE_ENV=production                            │
│  Memory: ~512MB (free tier)                                  │
│  CPU: Shared (free tier)                                     │
└────────────────────────┬──────────────────────────────────────┘
                         │ DATABASE_URL (TLS)
                         ▼
┌───────────────────────────────────────────────────────────────┐
│                   NEON MANAGED POSTGRESQL                     │
│                                                               │
│  PostgreSQL 16                                               │
│  FORCE ROW LEVEL SECURITY on 29 tenant tables               │
│  62 tables, ~300+ indexes                                   │
│  Connection pool: 20 (app) → Neon pooler → PG              │
│  Automated backups: Neon manages (7-day history on free)    │
└───────────────────────────────────────────────────────────────┘

External Services:
┌──────────────┐  ┌─────────────────┐  ┌───────────────────────┐
│   SENTRY.IO  │  │ LOGTAIL (Better │  │ META WHATSAPP CLOUD   │
│  Error       │  │  Stack) Logs    │  │ Business API          │
│  monitoring  │  │                 │  │ (per-tenant, optional)│
└──────────────┘  └─────────────────┘  └───────────────────────┘
```

---

## Component Inventory

### Frontend
- **Framework:** React 19 + Vite 6
- **Build output:** `dist/` (served as static files by Express)
- **PWA:** Service worker at `/sw.js` (offline fallback only, no ERP caching)
- **Bundle:** Code-split lazy chunks, ~1.5MB gzip for full app
- **PDF:** Client-side only (jspdf/html2pdf.js) — no server PDF generation

### Backend
- **Runtime:** Node.js 22, TypeScript via tsx
- **Framework:** Express 4
- **Auth:** JWT HS256, 24h expiry, single-device session enforcement
- **ORM:** None — raw `pg` driver with parameterized queries
- **Rate limiting:** express-rate-limit (in-memory MemoryStore — single instance)
- **File upload:** multer to `/tmp/miracle-uploads/` (admin-only, .rar/.zip Miracle import)

### Database
- **Provider:** Neon managed PostgreSQL 16
- **Connection:** SSL/TLS required, `DATABASE_SSL=true`
- **Pool:** 20 connections (app-side), Neon pgBouncer handles overflow
- **Security:** FORCE ROW LEVEL SECURITY on all 29 tenant tables
- **Backups:** Neon automated (7-day PITR on free, 30-day on paid)

### External Services

| Service | Purpose | Required | Config |
|---|---|---|---|
| Neon PostgreSQL | Primary database | ✅ Yes | DATABASE_URL |
| Render.com | Hosting | ✅ Yes | render.yaml |
| Sentry | Error monitoring | Optional | SENTRY_DSN |
| Logtail (Better Stack) | Log shipping | Optional | LOGTAIL_TOKEN |
| Meta WhatsApp Cloud API | Payment reminders | Optional (per tenant) | Per-tenant in DB (encrypted) |
| NIC API (GSTN) | E-invoice generation | Optional | Per-tenant in DB (encrypted) |
| GitHub Releases | APK/DMG download links | Optional | platform_config table |

### Email
**⚠️ Email is NOT implemented.** There is no SMTP/email library. Password reset tokens are stored in the database and must be retrieved by an admin via the Super Admin panel. This is a P1 gap before public launch.

### Background Jobs
- **WhatsApp payment reminders:** `POST /api/vendor-finance/reminders-run` — triggered by external cron with `x-cron-secret` header. No internal scheduler.
- **Keep-alive:** GitHub Actions `keep-alive.yml` pings `/api/hello` every 10 minutes to prevent Render free-tier sleep.

---

## Network Topology

```
Client HTTPS → Render HTTPS termination → Express :3001 → Neon SSL
```

- All traffic is HTTPS (Render handles TLS termination)
- No internal HTTP between services
- No open database ports to internet (Neon is cloud-managed, authenticated via URL)
- No admin/debug ports exposed

---

## Deployment Platforms

### Primary: Render.com
- Web service type (not background worker)
- Build command: `npm ci --include=dev && npm run build:prod`
- Start command: `npm start`
- Health check: `GET /api/health`
- Plan: Free (→ upgrade for production SLA, no sleep)

### Alternative: Docker (self-hosted)
- `docker-compose.yml` for local/self-hosted deployments
- Multi-stage Dockerfile (build + runner stages)
- Runs as non-root user (uid 1001)
- Health check: `/api/live`

### Mobile Clients
- **Service Mobile (offline):** Capacitor APK (Android) / IPA (iOS) — ERP data stays on device
- **Service Cloud (online):** Capacitor APK/IPA — connects to cloud backend
- **Desktop:** Electron (Mac/Windows) — cloud or on-premises mode

---

## Data Flow: Tenant Isolation

```
HTTP Request
  → JWT verification (global auth middleware)
  → tenantId extracted from JWT
  → X-Tenant-ID header overwritten with JWT tenantId
  → requestContext (AsyncLocalStorage) populated
  → pool.query() override: BEGIN + SET LOCAL app.tenant_id + query + COMMIT
  → FORCE RLS: tenant_id = current_setting('app.tenant_id') enforced at DB
  → Response scoped to single tenant
```
