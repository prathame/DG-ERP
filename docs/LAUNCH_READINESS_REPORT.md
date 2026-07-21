# Production Launch Readiness Report — Dhandho (DG-ERP)

**Date:** 2026-07-21  
**Repo:** https://github.com/prathame/DG-ERP  
**Branch:** `chore/prod-launch-hardening`  
**Committee:** Architecture · Backend · Frontend · DB · Security · DevSecOps · SRE · Cloud · Performance · Multi-Tenant SaaS · ERP/Finance · QA · A11y · Mobile · API

---

## 1. Executive Summary

Dhandho is a **mature multi-tenant SME ERP** (Vite + Express + PostgreSQL) with strong prior hardening (Helmet/CSP, CORS allowlist, JWT live checks, rate limits, parameterized SQL, tenant filters, optional Logtail).

This pass **implemented** safe Critical/High fixes (auth-cache invalidation, bill bank PII redaction, Cap seat claim race, invoice number uniqueness + allocation lock, graceful shutdown, dedicated secrets key support).

Against the **full enterprise checklist** in the audit brief (K8s, Prometheus, verified DR drills, soft-delete, payment idempotency keys, FORCE RLS, load test to 5k users): the product is **not** there yet.

**Final recommendation:** ❌ **NO-GO** for “enterprise SaaS launch committee” criteria as written.

**Conditional path for current cloud SME production (Render):** ✅ **GO-WITH-CONDITIONS** after this PR merges **and** the Launch Checklist ops items below are completed (paid DB/backups, `ALLOWED_ORIGINS`, `SECRETS_ENCRYPTION_KEY`, Logtail).

---

## 2–36. Scorecard

| Area | Score | Notes |
|------|------:|-------|
| Production readiness (enterprise brief) | **72** | Gaps: DR proof, K8s, soft-delete, payment idempotency |
| Production readiness (current SME cloud) | **86** | After this PR + ops checklist |
| Security | **84** | Strong baseline; JWT-in-localStorage + xlsx CVE residual |
| Multi-tenant safety | **88** | App-layer filters solid; RLS not FORCE’d for pool owner |
| Architecture | **82** | Clear surfaces; god-files remain |
| Maintainability | **70** | Large views/router; boot-time schema DDL |
| Reliability | **78** | Graceful shutdown fixed; free Render sleeps |
| Scalability | **68** | Pool 10; unpaginated lists; no queues |
| Performance | **80** | Code-split + CI bundle gate; float GST math OK for paise |
| ERP readiness | **85** | GST split + locks on payments/stock; invoice UNIQUE now |
| Observability | **72** | Health + correlation IDs + Logtail real; no Prometheus |
| Mobile | **80** | Cap Online/Offline; bank QR redacted for Staff |
| Accessibility | **75** | Prior dialog/login work; not full WCAG audit this pass |
| DR | **45** | Manual backup API; Render plan-dependent; no RTO/RPO drill |

---

## Fixes shipped this pass

| Severity | Fix | Files |
|----------|-----|-------|
| High | Invalidate auth cache on role/permission edit | `server/routes/admin.ts` |
| High | Redact bank/UPI on bill settings GET for Staff/Warehouse | `server/routes/bill-settings.ts` |
| High | Cap seat claim TOCTOU (`machine_id IS NULL` + 409) | `server/routes/service-cloud.ts` |
| High | UNIQUE `(tenant_id, invoice_number)` + advisory lock allocate | `server/pg-db.ts`, `server/routes/invoices.ts` |
| High | Prefer `SECRETS_ENCRYPTION_KEY` (dual-decrypt with JWT) | `server/utils/secret-crypto.ts` |
| High | Graceful shutdown: `server.close` + `pool.end` | `server/index.ts` |
| Med | `/settings/*` module gate (was bill-only) | `server/middleware/permissions.ts` |
| Ops | Document free-tier upgrade; env example for secrets key | `render.yaml`, `.env.example` |

---

## Remaining Critical / High (not auto-fixed — product / ops)

1. **Render free DB/web** — upgrade before paying GST tenants; confirm backup retention.  
2. **No soft-delete** — hard DELETE on invoices/masters; rely on backups + audit.  
3. **Payment idempotency keys** — overpay blocked under `FOR UPDATE`; double-submit under balance still possible.  
4. **Impersonation** — support SA gets Admin JWT; actions not dual-tagged.  
5. **FORCE RLS** — architectural; needs non-owner DB role.  
6. **`xlsx` high CVE** — no upstream fix; keep dynamic-import isolation.  
7. **JWT in localStorage** — XSS residual; cookie+CSRF redesign is a project.  
8. **No K8s / Prometheus / verified DR drill** — absent by design (Render).  
9. **Float GST math** — round-to-paise; acceptable for SME if returns reconcile.  
10. **God files** — `local/router.ts`, `DistributionView`, `SettingsView` — maintainability debt.

---

## Launch Checklist (ops — before calling production)

- [ ] Merge this hardening PR; deploy to Render  
- [ ] Set `ALLOWED_ORIGINS` (no wildcards)  
- [ ] Set `SECRETS_ENCRYPTION_KEY` ≠ `JWT_SECRET` (32+ chars)  
- [ ] Set `LOGTAIL_TOKEN` (or equivalent log drain)  
- [ ] Upgrade Postgres (+ web) off **free**; verify automated backups / PITR  
- [ ] Confirm `SUPER_ADMIN_*` rotated and strong  
- [ ] Smoke: login, create invoice (two parallel tabs), Cap claim device, demote user → immediate 403  
- [ ] Manual `/api/backup` export for one tenant; restore on staging  
- [ ] Document RTO/RPO targets for the team (even if aspirational)

---

## Validation (this branch)

| Check | Result |
|-------|--------|
| `npm run lint` | Pass (0 errors) |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 90 files / 738 tests |
| `npm run build` | Pass |
| `npm audit --omit=dev` | 1 residual high (`xlsx`, no fix) |

---

## Final Recommendation

| Question | Answer |
|----------|--------|
| Enterprise board GO? | ❌ **NO-GO** |
| SME cloud continue serving / ship hardening? | ✅ **GO-WITH-CONDITIONS** (checklist above) |

Do **not** market as “enterprise Kubernetes-ready / DR-certified” until paid DB backups are proven, payment idempotency lands, and a DR restore drill is recorded.
