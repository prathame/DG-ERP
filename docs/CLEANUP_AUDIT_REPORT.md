# Repository cleanup audit — Dhandho (DG-ERP)

**Date:** 2026-07-21  
**Branch:** `chore/repo-cleanup`  
**Goal:** Mature SaaS hygiene without breaking cloud / Electron / Capacitor surfaces.

---

## Phase 1 — Audit summary

### Architecture

Single-package monorepo: React 19 + Vite 6 SPA (`src/`), Express + PostgreSQL (`server/`), unified Electron desktop (`electron/desktop`), Capacitor phone shells (`service-phone` / `service-cloud` / `service-mobile`), shared domain helpers (`shared/`). Docs product: `engineering-academy/`.

### Project structure (intentional)

| Area | Role |
|------|------|
| `src/features/*` | Domain UI (lazy-loaded) |
| `src/components/{layout,ui}` | Shell + shared UI |
| `src/platforms/*` | Cap + Electron client adapters |
| `src/lib`, `src/hooks`, `src/i18n` | Client utilities |
| `server/routes`, `services`, `middleware` | API |
| `public/` | Runtime static + installer icons |
| `assets/branding/` | Brand masters (pipeline) |
| `tests/{unit,api}`, `tests/e2e_by_type.py` | Automated tests |

A Stripe-style full rename of `src/` was **rejected** for this pass: Cap modes, Electron packaging, and Vite aliases make a big-bang reorg high-risk for low product value.

### Dead code (high confidence)

| Path | Verdict |
|------|---------|
| `src/features/payroll/PayrollView.tsx` | Orphan — payroll UX lives in `StaffMasterView` |
| `src/features/super-admin/TenantsView.tsx` | Orphan — replaced by SA Cloud/On-Prem/Offline Mobile views |
| `src/features/masters/AuditLogSection.tsx` | Orphan — SA uses `SuperAdminAuditLog` |
| `src/components/layout/index.ts` | Unused barrel |

### Dependencies

No safe unused production deps. `embedded-postgres` has no TS import of the package name but is required for on-prem Electron binary packing — **keep**. Dual stacks (`bcrypt`/`bcryptjs`, `jsonwebtoken`/`jose`, `html2pdf.js`/`jspdf`) are intentional platform splits.

### Assets

All `public/branding/*`, `public/icons/*`, and `assets/branding/*` **kept** (product + installer + brand pipeline). Some public icon variants are pipeline outputs not referenced in React; they remain for Electron/Android/iOS regeneration.

### Smells

| Signal | Finding |
|--------|---------|
| `TODO` / `FIXME` / `HACK` | ~0 in `src`/`server`/`electron` |
| `console.log` | Mostly Electron boot + logger sinks + stress test |
| `*.bak` / `*.old` / `*.temp` | None tracked |
| Deep `../../../../` imports | None found under `src/` |
| God files | Top: `service-mobile/local/router.ts` (~4k), `DistributionView`, `SettingsView`, `App.tsx` — split deferred |

### Env / config drift

- `JWT_EXPIRES_IN` — documented historically, never read (tokens hardcoded `24h`)
- `PUBLIC_APP_URL` — in Render/docker for ops notes; **not** read by server TS
- Deprecated shims still referenced by CI path filters: `capacitor.cloud.config.ts`, `electron-cloud/onprem.config.cjs`, `scripts/cap-sync-cloud.sh` — **left in place** until CI globs are updated in a dedicated PR

### Duplicate helpers (document only)

- `src/lib/deviceId.ts` vs `service-mobile/deviceId.ts` — same algorithm, different storage keys (`dg_sc_*` / `dg_sm_*`); do not merge blindly
- Client vs server `logger.ts` — different runtimes

---

## Phases 2–11 — What we did vs deferred

### Done (this branch)

1. Stop tracking IDE/agent dirs + Cap phone dist (prior commits on branch)
2. Drop legacy `tests/e2e_full.py` + Capacitor example Android unit tests (prior)
3. Remove four orphan UI/barrel files (above)
4. Clarify dead env vars in `.env.example`
5. Refresh `docs/architecture.md`, `DEVELOPER.md` platforms map, docs index
6. This audit + cleanup log

### Explicitly deferred (risk / scope)

| Item | Why deferred |
|------|----------------|
| Full `src/` reorg to `ui/layout/forms/...` | Breaks Cap/Electron/lazy import graph; no functional gain |
| Mass rename PascalCase/camelCase files | Touch surface huge; git history noise |
| Split 1k–4k line views / `router.ts` | Needs dedicated feature PRs + regression tests |
| Delete “unused” public icons / logo-meaning masters | Brand + installer pipeline; user keep-images policy |
| Remove deprecated Cap/Electron config files | CI `paths:` still list them |
| Remove `embedded-postgres` or PDF dual stack | Would break offline/Cap |
| Auto-prune unused Tailwind classes | Requires careful purge config; Tailwind 4 already trees well |
| Wire or delete `PUBLIC_APP_URL` in server | Product decision (absolute invite/PDF links) |

---

## Phase 12 — Validation (2026-07-21)

| Check | Result |
|-------|--------|
| `npm run lint` | Pass (0 errors; pre-existing warnings unchanged) |
| `npm run typecheck` | Pass |
| `npm test` | Pass — 90 files / 738 tests |
| `npm run build` | Pass |

---

## Final metrics (this cleanup wave)

| Metric | Estimate |
|--------|----------|
| Orphan UI files removed | 4 |
| Lines removed (orphans) | ~450 |
| Images removed | 0 (kept by policy) |
| npm packages removed | 0 |
| Bundle reduction | Negligible (orphans were unreferenced) |
| Technical debt removed | Dead SA/payroll UI shells; env doc footguns |
| DX | Clearer architecture docs; honest `.env.example` |

### Remaining recommendations (priority order)

1. **Incremental god-file splits** — start with `SettingsView` / `DistributionView` extract hooks; leave `local/router.ts` for a dedicated Offline Mobile epic
2. **CI-only deprecate pass** — drop path triggers for `capacitor.cloud.config.ts` / legacy electron configs, then delete shims
3. **Decide `PUBLIC_APP_URL`** — implement absolute URL helper or remove from `render.yaml` / compose
4. **Optional:** consolidate device-id algorithm into one module with keyed storage (behavior-preserving)
5. **Optional:** stop committing compiled `server/**/*.js` if packaging always uses `tsx` (verify Electron first)
