# Continuity Guide — Engineering Academy

This academy is designed to grow incrementally without losing the curriculum map.

## Location

`DG-ERP/engineering-academy/` (this folder inside the monorepo).

## Current inventory (approx.)

| Asset | Count / location |
|---|---|
| Curated docs | `docs/**` |
| Generated per-file deep-dives | `docs/files/generated/**` |
| Diagrams | `diagrams/*.mmd` |
| Generators | `scripts/generate-file-deepdives.mjs`, `scripts/ensure-stubs.mjs`, `scripts/enrich-stubs.mjs` |

## Recently completed (gap close-out)

| Gap | Resolution |
|---|---|
| Marketing landing missing Silver / Hotel | `LandingPage.tsx` TYPES + FEATURES updated; 3-col grid |
| Hotel Finance showed Vendor Finance | `App.tsx` uses `InvoiceFinanceView` for `hotel_restaurant` (and `service` / service phone UX) |
| `tabAccess` vs `hospitality` module | `resolveTabAccess` maps `hospitality` → `hosp_*`; unit tests added |
| Hospitality glossary / quiz | `glossary/domain-terms` + `quizzes/quiz-hospitality` + sidebar |
| Hospitality deep-dives | Generated pages under `docs/files/generated/*hospitality*` |
| Python E2E | `tests/e2e_by_type.py` adds `hotel_restaurant` suite |

### 2026-07 — Hospitality academy sync (earlier)

Landing, product-domain, features-catalog, `api/hospitality.md`, workflow 7, permissions docs, tenant-tables, design-decisions / business-goals.

## Optional follow-ups

| Item | Notes |
|---|---|
| Full `generate:files` index refresh | Large churn; hospitality deep-dives already committed individually |
| Marketing hero copy | Still goods-centric tagline; optional broaden later |

## How to continue in a new chat

> Continue the Dhandho Engineering Academy at `engineering-academy/` inside DG-ERP.  
> SRE and Labs are deferred. Prefer depth on distribution, GST, purchases, Electron on-prem, mobile offline, silver casting, hospitality.  
> Keep `cd engineering-academy && npm run build` green.

## Deferred (skip until asked)

- **SRE** (`docs/sre/*`)
- **Labs** (`docs/labs/*`)

## Commands

```bash
cd engineering-academy
npm install
npm start                 # http://localhost:3000
npm run generate:files    # refresh file pages from repo root
npm run build
```

## Do not

- Link to `/labs/index` — use `/labs` (Docusaurus strips `index`)
- Commit secrets into academy content
- Re-run blind stub enrichers that overwrite deep chapters without review
