# DG-ERP Production Readiness Report
> Date: 2026-08-14 | Phase 2.8

---

## Environment Variables & Secrets

### Required for Production

| Variable | Purpose | Where Set |
|---|---|---|
| `DATABASE_URL` | Neon PostgreSQL connection string | Render Dashboard |
| `JWT_SECRET` | JWT signing key (32+ chars) | Render Dashboard |
| `SUPER_ADMIN_EMAIL` | Platform owner email | Render Dashboard |
| `SUPER_ADMIN_PASSWORD` | Platform owner password (12+ chars) | Render Dashboard |
| `NODE_ENV` | `production` | render.yaml |
| `ALLOWED_ORIGINS` | Frontend origin(s) | render.yaml |
| `DATABASE_SSL` | `true` for Neon/managed PG | render.yaml |

### Optional but Recommended

| Variable | Purpose | Default |
|---|---|---|
| `SENTRY_DSN` | Error monitoring | Disabled |
| `VITE_SENTRY_DSN` | Frontend error monitoring (build-time) | Disabled |
| `LOGTAIL_TOKEN` | Log shipping to Better Stack | Disabled |
| `SECRETS_ENCRYPTION_KEY` | Dedicated secrets key (separate from JWT) | Falls back to JWT_SECRET |
| `DATABASE_POOL_SIZE` | Connection pool size | 20 (set in render.yaml) |
| `CRON_SECRET` | WhatsApp reminder cron authentication | Disabled |

### Security Status

| Check | Status |
|---|---|
| Secrets committed to git | ✅ NONE — .env is gitignored |
| VITE_* frontend exposure | ✅ SAFE — VITE_SENTRY_DSN is a write-only public key; VITE_DEPLOYMENT_MODE/VERSION are not secrets |
| Secrets in error responses | ✅ SANITIZED — 500 responses strip all body content |
| Secrets in logs | ✅ REDACTED — pii.ts redacts passwords, tokens, JWTs in all log lines |
| Hardcoded API keys | ✅ NONE found in server/ or src/ |
| JWT_SECRET validation | ✅ assertCriticalEnv() rejects startup if missing or < 32 chars in production |
| Docker compose defaults | 🔧 FIXED — now uses ${VAR:?required} syntax; insecure fallbacks removed |
| .env.example accuracy | ✅ Up to date |

---

## Authentication & Session Security

| Check | Status | Notes |
|---|---|---|
| JWT algorithm | ✅ HS256 | Standard for server-controlled tokens |
| JWT expiry | ✅ 24 hours | Login tokens; 15 min for SA impersonation |
| JWT secret minimum length | ✅ Enforced (32 chars in prod) | assertCriticalEnv() |
| Single-device session | ✅ Enforced | user_sessions table + sessionId in JWT |
| Password hashing | ✅ bcrypt rounds=12 | |
| Password reset | ⚠️ Token-based, no email | Token stored in DB, retrieved by SA |
| Cookie flags | ✅ No cookies — Bearer token auth | N/A |
| Dev auth bypasses in prod | ✅ None | isTest checks are VITEST/NODE_ENV=test only |
| Rate limiting (login) | ✅ 5/min/IP | In-memory — single instance safe |
| Account lockout | ❌ None | P1 — IP-only rate limiting |
| MFA | ❌ Not implemented | P2 |
| Platform field required | ✅ `platform: web|desktop|mobile` in login body | 403 without it |

---

## CORS & HTTP Security

| Check | Status | Configuration |
|---|---|---|
| CORS origins | ✅ Explicit allowlist | ALLOWED_ORIGINS env var |
| CORS wildcard * | ✅ Never reflected | Unlisted origins get no Allow-Origin header |
| Capacitor origins | ✅ Fixed allowlist | capacitor://localhost, http://localhost |
| Dev CORS (loopback) | ✅ Non-production only | isProduction check |
| CSP | ✅ Configured | scriptSrc 'self' in production |
| HSTS | ✅ 1 year, includeSubDomains, preload | Helmet |
| X-Frame-Options | ✅ DENY | Helmet frameguard |
| X-Content-Type | ✅ Enabled | Helmet noSniff |
| Referrer-Policy | ✅ strict-origin-when-cross-origin | Helmet |
| Cross-Origin-Resource-Policy | ✅ cross-origin | Capacitor/Electron need this |
| X-DG-Client header | ✅ Required in production | Rejects bare API calls |
| Credentials header | ✅ true | Capacitor/Electron send cookies → none actually set |

---

## Database Production Readiness

| Check | Status | Notes |
|---|---|---|
| TLS required | ✅ DATABASE_SSL=true enforced in prod | assertCriticalEnv() |
| Connection pool | ✅ DATABASE_POOL_SIZE=20 | Set in render.yaml |
| Connection timeout | ✅ 10s | pg-db.ts |
| Idle timeout | ✅ 30s | pg-db.ts |
| Statement timeout | ❌ Not configured | P2 — add PGOPTIONS=-c statement_timeout=30s |
| FORCE RLS | ✅ All 29 tenant tables | Phase 2 implementation |
| Parameterized queries | ✅ Throughout | No string concatenation in queries |
| Migrations | ✅ runner.ts at boot | server/migrations/index.ts |
| Migration rollback | ❌ No rollback mechanism | P1 — manual intervention required |
| Startup with existing DB | ✅ Idempotent (IF NOT EXISTS) | initSchema() |
| Startup after migration | ✅ Verified | Migration 0001/0002/0003 all succeed |
| Failed migration | ✅ Logs fatal + exits | Process exits with error |
| Weak DB password | ✅ Rejected at startup | assertCriticalEnv() regex check |
| Maximum connections | 20 (app pool) → Neon pgBouncer | Neon free: 100 total |

---

## Database Backup & Disaster Recovery

| Check | Status | Notes |
|---|---|---|
| Automated DB backups | ✅ Neon managed | 7-day PITR on free, 30-day on paid |
| Application-level backup | ✅ GET /api/backup | JSON export, admin-only |
| Backup encryption | ✅ Neon encrypts at rest | Application backup is plain JSON |
| Restore procedure | ✅ POST /api/backup/restore | Tested in Phase 2.5 |
| Cross-tenant restore blocked | ✅ _meta.tenantId validation | Phase 2.5 P1 fix |

**RPO (Recovery Point Objective):** 1 hour (Neon PITR free tier)
**RTO (Recovery Time Objective):** 30 minutes (Neon restore + app restart)

**Disaster Recovery Procedure:**
1. Restore Neon DB to last known good point via Neon Console → Restore
2. Deploy last known good app version via Render rollback
3. Verify `/api/health` returns 200
4. Verify super admin can login
5. Spot-check one tenant's invoice list

---

## Health Endpoints

| Endpoint | Purpose | DB Required | Status |
|---|---|---|---|
| `GET /api/live` | Liveness (process up) | No | ✅ Returns `{ok:true}` |
| `GET /api/ready` | Readiness (DB reachable) | Yes | ✅ Returns `{ok:true,db:"up"}` or 503 |
| `GET /api/health` | Deep health (alias of ready) | Yes | ✅ Same as /ready |
| `GET /api/hello` | Keep-alive ping | No | ✅ Returns `{ok:true,ts:"..."}` |

All health endpoints:
- Return structured JSON
- Do NOT expose DB credentials, config, or secrets
- Use correct HTTP status (200 up, 503 down)

---

## Rate Limiting

| Endpoint | Limit | Window |
|---|---|---|
| All `/api/` | 300 requests | 1 minute |
| `/api/auth/login` | 5 attempts | 1 minute |
| `/api/super-admin/login` | 5 attempts | 1 minute |
| `/api/auth/forgot-password` | 3 requests | 1 hour |
| `/api/auth/reset-password` | 5 attempts | 1 hour |
| `/api/auth/signup` | 3 requests | 1 hour |
| `/api/settings/change-password` | 20 attempts | 15 minutes |
| `/api/chatbot` | 30 requests | 1 minute |

**Limitation:** Rate limiter uses in-memory MemoryStore. At 2+ instances, limit multiplies. → Redis store needed for scale-out (deferred).

---

## File Upload Security

| Check | Status | Notes |
|---|---|---|
| File type validation | 🔧 FIXED (Phase 2.8) | Extension check added to multer fileFilter |
| Accepted types | ✅ .rar, .zip only | Miracle CMP import |
| Size limit | ✅ 80MB | multer limit |
| Upload destination | ✅ /tmp/miracle-uploads/ | Cleaned after extraction |
| File execution | ✅ Not possible | Server does not serve upload directory |
| Auth required | ✅ requireAdmin middleware | Admin-only endpoint |
| Temp file cleanup | ✅ fs.unlinkSync on completion | books.ts |

---

## Email

❌ **Email is NOT implemented.** No SMTP/email library exists in the codebase.

**Current password reset flow:**
1. `POST /api/auth/forgot-password` → generates token, stores in DB
2. Token is **not emailed** — must be retrieved by SA via admin API or console
3. `POST /api/auth/reset-password` → validates token, updates password

**Impact:** Users cannot self-service password resets. SA must retrieve reset tokens manually.

**P1 gap:** Implement email (e.g., Resend, SendGrid, AWS SES) before public launch.

---

## Background Jobs

| Job | Trigger | Frequency | Status |
|---|---|---|---|
| WhatsApp reminders | External cron → POST /api/vendor-finance/reminders-run | Manual/scheduled | Optional (requires CRON_SECRET) |
| Keep-alive ping | GitHub Actions | Every 10 minutes | Active (prevent Render sleep) |

No internal schedulers or background workers exist. All background operations are triggered externally.

---

## Dependency Security

Run: `npm audit --json`

| Severity | Count | Production | Fix Available |
|---|---|---|---|
| Critical | 0 | — | — |
| **High** | **10** | **1 (xlsx)** | 9/10 (all except xlsx) |
| Moderate | 2 | 0 | Yes |
| Low | 0 | — | — |

**xlsx HIGH (no fix):** SheetJS xlsx has a known vulnerability with no upstream patch. It is used client-side only for bank statement CSV import/export. Mitigation: only authenticated admin users can trigger xlsx parsing; no server-side xlsx parsing.

**Other HIGH vulnerabilities:** All in devDependencies (Playwright, postcss, etc.) or transitive devDeps. Not included in production bundle. Blocked from reaching production users.

**CI configuration:** Security.yml fails on critical. xlsx HIGH is explicitly whitelisted (comment in CI). Other transitive devDep highs are acceptable given they never reach production.

---

## CI/CD Pipeline

| Gate | Status | Pipeline |
|---|---|---|
| Typecheck | ✅ Required | lint.yml, pr-check.yml |
| Lint | ✅ Required | lint.yml |
| Tests | ✅ Required | build.yml, pr-check.yml |
| Build | ✅ Required | build.yml |
| Bundle size check | ✅ < 256KB gzip main chunk | pr-check.yml |
| npm audit critical | ✅ Fails on critical | security.yml |
| Secret detection | ✅ Grep scan | security.yml |
| No dangerouslySetInnerHTML | ✅ | security.yml |
| Migration ordering | ⚠️ Manual | No automated migration ordering check |

---

## Production Configuration Scan

| Pattern | Occurrences | Classification |
|---|---|---|
| `console.log` in server/ | 2 | DEV-ONLY — in startup/electron contexts only |
| `TODO/FIXME` in server/ | 0 | CLEAN |
| `localhost:3001` in server/ | 1 | DEV-ONLY — CORS fallback, gated by !isProduction |
| `isTest` bypasses | 10+ | SAFE — all gated by VITEST=true or NODE_ENV=test |
| `127.0.0.1` | 0 in server/ | CLEAN |

---

## Graceful Shutdown

Shutdown handler (`SIGTERM`, `SIGINT`) in `server/index.ts`:
1. Stop accepting new connections
2. Complete in-flight requests (30s timeout)
3. Close DB pool
4. Flush logs to Sentry/Logtail
5. Exit 0

**Financial transaction safety:** Transactions use DB-level COMMIT/ROLLBACK. A mid-request kill would abort the connection, triggering PostgreSQL to rollback the open transaction automatically. No partial financial data.

---

## Cost Estimate (Baseline)

| Component | Free Tier | Paid Estimate |
|---|---|---|
| Render web service | Free (sleeps) | ~$7/month (starter, no sleep) |
| Neon PostgreSQL | Free (0.5GB, 100 conn) | ~$19/month (launch plan, 10GB) |
| Sentry | Free (5K events/month) | ~$26/month (team) |
| Logtail | Free (1GB/month) | ~$29/month (10GB) |
| GitHub Actions | Free (2,000 min/month) | — |
| **Total** | **~$0/month** | **~$80/month** |

**Runaway cost risks:**
- Unbounded Sentry events: mitigated by Books failure being a throw (not a warn loop)
- Large Logtail volume: structured logs are terse; analytics/overview runs 40 RTTs per request but each is a single log line
- Neon compute: serverless autoscale; idle = $0

---

## Known Risks

| Risk | Severity | Status |
|---|---|---|
| Email not implemented (password reset) | P1 | Open — must fix before public launch |
| Account lockout (per-user) missing | P1 | Open |
| Rate limiter in-memory (multi-instance) | P2 | Open (Redis deferred) |
| Statement timeout not configured | P2 | Open |
| Migration rollback procedure | P1 | Open (no automated rollback) |
| Desktop builds unsigned (Mac/Windows) | P1 | Open |
| NIC E-invoice sandbox not tested | P1 | Open |
| PDF visual quality manual only | P1 | Open |

---

## Verdict

**CONTROLLED FIRST TENANT:** GO ✅

**PUBLIC LAUNCH:** NO-GO ❌ (email implementation and account lockout are P1 gaps)
