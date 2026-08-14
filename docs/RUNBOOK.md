# DG-ERP Operations Runbook
> Last updated: 2026-08-14

This runbook covers common operational scenarios for DG-ERP on Render.com + Neon PostgreSQL.

---

## Quick Reference

| Issue | First Check | Command |
|---|---|---|
| App down | Render Dashboard → Service status | `curl https://dhandho-2kdx.onrender.com/api/live` |
| DB down | Neon Console → Database status | `curl https://dhandho-2kdx.onrender.com/api/ready` |
| High 5xx | Sentry → Issues | Check Logtail for error patterns |
| Slow API | Logtail → filter `durationMs > 1000` | Check DB pool and query logs |
| Books failure | Sentry → filter `alert:books_dual_write_failure` | Check BOOKS_STRICT env var |

---

## 1. APPLICATION DOWN

**Symptoms:** `curl /api/live` returns connection refused or 5xx; Render shows "Crashed"

**Checks:**
```bash
# Liveness
curl https://dhandho-2kdx.onrender.com/api/live

# If connection refused: service is crashed, not just unhealthy
# Check Render Dashboard → Service → Logs for startup error
```

**Likely causes:**
1. **Migration failure at boot** — check logs for `Failed to initialize database`
   - Recovery: check `server/migrations/index.ts` for the failing migration
   - Fix the migration SQL and redeploy
2. **DATABASE_URL missing or invalid** — check Render env vars
3. **OOM kill** — memory spike (rare on free tier); check Render metrics
4. **Port conflict** — ensure PORT=3001 is set

**Recovery:**
1. Render Dashboard → Manual Deploy → select last working commit
2. If migration bad: rollback migration code, redeploy with `--skip-migration` flag (not built in — must comment out failing migration temporarily)

---

## 2. DATABASE DOWN

**Symptoms:** `/api/live` returns 200, `/api/ready` returns 503 `{"ok":false,"db":"down"}`

**Checks:**
```bash
curl https://dhandho-2kdx.onrender.com/api/ready
# → {"ok":false,"db":"down","message":"Database unavailable"}
```

**Likely causes:**
1. **Neon serverless wake-up lag** — free tier sleeps after 5 min idle; first request takes 3-10s
   - Solution: keep-alive cron (already configured in `.github/workflows/keep-alive.yml`)
2. **Neon maintenance window** — check Neon status at https://neonstatus.com
3. **Connection pool exhausted** — check Logtail for `connectionTimeoutMillis` errors
4. **Invalid DATABASE_URL** — check Render env vars

**Recovery:**
1. If Neon sleep: wait 10s, retry `/api/ready`
2. If maintenance: wait for Neon to complete
3. If pool exhausted: increase `DATABASE_POOL_SIZE` or reduce concurrent users
4. Emergency DB restart: Render → Manual Deploy → restarts app, reconnects pool

---

## 3. HIGH 5XX RATE

**Symptoms:** Sentry spike alert fires; many 500 responses in Logtail

**Checks:**
```bash
# Filter Logtail for 5xx
# msg contains "HTTP request" AND statusCode >= 500

# Check for Books failures
# alert = "books_dual_write_failure"

# Check circuit breaker
# alert = "circuit_breaker_open"
```

**Likely causes:**
1. **DB connection failure** → see §2 (Database Down)
2. **Circuit breaker open** — DB was failing, breaker opened
   - Recovery: breaker auto-resets after 10s; if DB recovered, requests will resume
   - Check Logtail: `alert: circuit_breaker_open`
3. **Books dual-write failure** (BOOKS_STRICT=1 in production)
   - Check Logtail: `alert: books_dual_write_failure`
   - Cause: Books COA missing for tenant → Books posting fails → invoice creation fails
   - Recovery: SA → tenant → resync Books desk
   - Emergency: set `BOOKS_STRICT=0` in Render env → redeploy (ops will succeed, Books desynced)
4. **Unhandled exception** — check Sentry for stack trace

**Recovery:**
1. Identify error pattern in Sentry/Logtail
2. If transient (DB blip): wait for circuit breaker to reset
3. If Books issue: fix Books COA for affected tenant(s)
4. If code bug: rollback via Render Dashboard → deploy previous release

---

## 4. SLOW API

**Symptoms:** Logtail shows `durationMs > 500` (slow API threshold); users complain about loading

**Checks:**
```bash
# Logtail filter: durationMs > 2000
# Look at: path, method, tenantId, userId

# For DB slow queries
# msg: "Slow database query" AND durationMs > 200
```

**Likely causes:**
1. **FORCE RLS pool.query overhead** — 4 RTTs per query; analytics/overview uses 40 RTTs
   - analytics/overview and notifications are known high-latency endpoints
   - Not a bug — documented P1 optimization (withTenantClient migration)
2. **Missing index** — check slow query log for full scans
3. **Neon cold start** — first query after idle is 3-10s
4. **Pool exhaustion** — queries queue behind busy connections

**Recovery:**
1. For analytics slow: expected, document for tenant; P1 optimization planned
2. For missing index: identify table + query, add index via migration
3. For Neon cold start: upgrade to Neon paid plan (compute always-on)

---

## 5. BOOKS DUAL-WRITE FAILURE

**Symptoms:** Sentry alert fires for `books_dual_write_failure`; invoice/payment creation fails with 500

**Checks:**
```bash
# Logtail/Sentry filter
# alert = "books_dual_write_failure"
# context = (invoice-create|vendor-payment-batch|etc.)
# Look at: tenantId, error message
```

**Likely causes:**
1. **Books COA not seeded** — new tenant without Books ledger setup
2. **Missing ledger** — a specific ledger referenced by opsToBooks doesn't exist for this tenant
3. **DB error during Books posting** — unlikely but possible during DB instability

**Recovery:**
1. Identify affected tenant from `tenantId` in log
2. SA → Tenant Detail → Sync Books Desk (triggers `ensureNativeBooksDesk`)
3. Re-submit the failed operation
4. Emergency bypass: set `BOOKS_STRICT=0` in Render env → redeploy
   - **Note:** This commits ops data without Books entries — financial desync. Fix Books as soon as possible.

---

## 6. DB POOL EXHAUSTION

**Symptoms:** Requests timeout with `connection timeout — no available clients`; Logtail shows pool wait errors

**Checks:**
```bash
# Logtail filter: connectionTimeoutMillis OR "pool" OR "timeout"
# Count: unique tenantIds making analytics requests simultaneously
```

**Likely causes:**
1. **Multiple users loading analytics/overview simultaneously** — each request uses 10 connections
2. **DATABASE_POOL_SIZE too low** — should be 20 (set in render.yaml)
3. **Long-running transactions blocking pool** — check for stuck transactions in Neon console

**Recovery:**
1. Immediate: Render → Manual Deploy → app restarts, pool resets
2. Short-term: check DATABASE_POOL_SIZE env var (should be 20)
3. Medium-term: migrate analytics/overview to withTenantClient() (P1 optimization)
4. Emergency: increase DATABASE_POOL_SIZE to 30-40 temporarily (check Neon connection limit)

---

## 7. FAILED DEPLOYMENT

**Symptoms:** Render deploy shows "Failed" or "Exited with status 1"

**Checks:**
```bash
# Render Dashboard → Service → Deploy logs
# Look for:
# - npm ci failure
# - vite build failure
# - tsx compilation error
# - Migration failure
# - assertCriticalEnv failure
```

**Likely causes:**
1. **Build failure** — TypeScript error or missing dependency
2. **Migration failure** — SQL error in server/migrations/index.ts
3. **Missing env var** — DATABASE_URL, JWT_SECRET, ALLOWED_ORIGINS, etc.

**Recovery:**
1. Build failure: fix code, push new commit
2. Migration failure: comment out failing migration, push, fix SQL, uncomment + push
3. Missing env: add to Render Dashboard → Environment → Save
4. Rollback: Render Dashboard → Manual Deploy → select previous successful deploy

---

## 8. FAILED MIGRATION

**Symptoms:** Logs show `Migration failed — rolled back` then `Failed to initialize database` then process exit

**Example log:**
```json
{"level":"error","msg":"Migration failed — rolled back","id":"0002_book_voucher_entries_fk","error":{"message":"FK violation"}}
{"level":"fatal","msg":"Failed to initialize database","error":"FK violation"}
```

**Immediate action:**
1. Do NOT push more code — the migration is bad
2. Roll back the deploy to the previous release (Render → previous deploy)
3. Fix the migration SQL in `server/migrations/index.ts`
4. Test locally: run the migration against a copy of the production schema
5. Push fixed migration

**If migration partially applied:**
1. Connect to Neon database (via Neon Console SQL editor or `psql`)
2. Check `SELECT * FROM schema_migrations` — if the migration isn't recorded, it rolled back cleanly
3. If it IS recorded but broken: manual SQL fix + delete from schema_migrations + redeploy

---

## 9. BACKUP / RESTORE

**Full restore from application backup:**
```bash
# 1. Export backup from production
curl -H "Authorization: Bearer <admin-jwt>" \
     -H "X-Tenant-ID: <tenantId>" \
     https://dhandho-2kdx.onrender.com/api/backup \
     -o backup.json

# 2. Restore to same tenant (or staging)
curl -X POST \
     -H "Authorization: Bearer <admin-jwt>" \
     -H "X-Tenant-ID: <tenantId>" \
     -H "Content-Type: application/json" \
     -d @backup.json \
     https://dhandho-2kdx.onrender.com/api/backup/restore
```

**Neon PITR restore (full database restore):**
1. Neon Console → Database → Restore
2. Select restore point (PITR)
3. This restores ALL tenants — use for catastrophic data loss only
4. After PITR restore: verify tenant data with spot-check

---

## 10. TENANT ISOLATION INCIDENT

**Symptoms:** Tenant A reports seeing Tenant B's data; unexpected cross-tenant data in API response

**Immediate actions:**
1. Check Sentry for any errors around the time of the incident
2. Check Logtail for requests with mixed tenantId in the same session
3. Check if FORCE RLS is still enabled:
   ```sql
   SELECT tablename, rowsecurity, forcesecurity 
   FROM pg_tables t JOIN pg_class c ON c.relname = t.tablename 
   WHERE tablename IN ('products','vendors','customers');
   ```
4. Check if `app.tenant_id` was set correctly in pool.query override

**If data leakage confirmed:**
1. Suspend affected tenants immediately (SA → Tenant → Status: suspended)
2. Audit Logtail for all requests from both tenants in the time window
3. Check if any data was modified across tenant boundary
4. Notify affected tenants
5. Root cause: likely a missing WHERE tenant_id clause in a route

---

## 11. SECURITY INCIDENT

**Symptoms:** Unauthorized access; data exfiltration attempt; brute force; JWT compromise

**Immediate actions:**
1. Force-logout all sessions:
   ```sql
   DELETE FROM user_sessions WHERE tenant_id = '<affected-tenant>';
   ```
2. Rotate JWT_SECRET in Render env (logs out ALL tenants — use if JWT is compromised)
3. Suspend affected tenant: SA → Tenant → Status: suspended
4. Check Logtail for IP pattern and unusual request volumes
5. Check auth failure logs: `msg: "Authentication failed"` with reason

**For brute force:**
1. IP is rate-limited to 5 login attempts/min
2. Check if attacker is rotating IPs (distributed attack)
3. Render → DDoS protection → block suspicious IP ranges if needed

**Evidence collection:**
1. Export Logtail logs for the incident time window
2. Check `audit_log` table for the affected tenant
3. Preserve Sentry issue details

---

## 12. ON-CALL ESCALATION

| Severity | Response Time | Examples |
|---|---|---|
| P0 | Immediate | App down, DB down, data loss, security breach |
| P1 | < 2 hours | Books failures, slow API affecting all users, failed deployment |
| P2 | < 24 hours | Individual tenant issue, non-critical 5xx, performance degradation |
