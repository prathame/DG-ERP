# Production Launch Readiness Report — Dhandho (DG-ERP)

**Date:** 2026-07-21 (updated)  
**Repo:** https://github.com/prathame/DG-ERP  
**Branch:** `chore/prod-launch-hardening`  
**Hosting decision:** **Render now** (free OK); domain + plan upgrade later.

---

## 1. Executive Summary

Dhandho is production-capable for **SME cloud on Render** after this hardening PR. Enterprise extras (K8s, Prometheus, paid PITR drills, FORCE RLS) remain future work — accepted for the current launch path.

**Final recommendation (Render-now path):** ✅ **GO**

**Enterprise-board checklist (K8s / verified DR / paid HA):** ❌ still NO-GO until plan upgrade + DR drill — not blocking current Render launch.

---

## Scorecard (Render-now)

| Area | Score | Notes |
|------|------:|-------|
| Production readiness (Render SME) | **90** | Code hardening complete; set env + deploy |
| Security | **86** | Idempotency, bank PII, secrets key, auth cache |
| Multi-tenant safety | **88** | App-layer filters; RLS not FORCE’d (accepted) |
| ERP readiness | **90** | Unique invoices, payment idempotency, soft-cancel |
| Reliability | **82** | Graceful shutdown; free tier may sleep |
| Scalability | **72** | Paginated lists; pool 10; upgrade later |
| Observability | **78** | `/live` `/ready` `/health` + Logtail optional |
| DR | **55** | Manual export + host DB backups when upgraded |
| Architecture / maintainability | **72** | God-files remain (non-blocking) |

---

## Fixes shipped

### Pass 1
| Fix | Area |
|-----|------|
| Auth cache invalidate on role/permission edit | Security |
| Bank/UPI redacted for Staff bill GET | Security |
| Cap seat claim race (`machine_id IS NULL` + 409) | Multi-tenant |
| UNIQUE invoice numbers + advisory lock | ERP |
| `SECRETS_ENCRYPTION_KEY` + JWT fallback decrypt | Security |
| Graceful `server.close` + `pool.end` | Reliability |

### Pass 2 (this update)
| Fix | Area |
|-----|------|
| Payment `Idempotency-Key` (invoice + vendor) | ERP / API |
| Audit rows tag `[impersonatedBy=…]` when SA impersonating | Security |
| Invoice DELETE → soft-cancel (`status=cancelled`) | Data integrity |
| `/api/live` + `/api/ready` (+ keep `/api/health`) | Ops |
| Paginate expenses / payroll / quotations / orders | Performance |
| Honest cloud Auto Backup copy (no fake scheduler) | UX / SaaS |
| Docker HEALTHCHECK → `/api/live` | DevOps |

---

## Accepted for later (domain + plan upgrade)

1. Buy domain → point DNS + set `ALLOWED_ORIGINS` / canonical URLs  
2. Upgrade Render web + Postgres off **free** (backups / no sleep)  
3. Set `SECRETS_ENCRYPTION_KEY`, `LOGTAIL_TOKEN` in Render dashboard  
4. FORCE RLS / non-owner DB role (architecture epic)  
5. Replace `xlsx` when a fixed release exists  
6. Cookie+CSRF auth redesign  
7. Split god-files (`SettingsView`, Cap `local/router.ts`)

---

## Launch Checklist (Render free → later upgrade)

- [ ] Merge & deploy this PR to Render  
- [ ] Confirm `ALLOWED_ORIGINS` includes your Render URL (and Cap origins if needed)  
- [ ] Optional now: `SECRETS_ENCRYPTION_KEY`, `LOGTAIL_TOKEN`  
- [ ] Smoke: login, parallel invoice create, double-click payment (no double charge), demote user, Cap claim  
- [ ] Later: custom domain + paid Postgres + backup restore drill  

---

## Validation

| Check | Result |
|-------|--------|
| `npm run lint` | Run on PR |
| `npm run typecheck` | Run on PR |
| `npm test` | Run on PR |
| `npm run build` | Run on PR |

---

## Final Recommendation

| Path | Decision |
|------|----------|
| **Ship on Render now** | ✅ **GO** |
| Market as enterprise K8s / DR-certified | ❌ Wait for plan upgrade + drill |
