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

## Recently updated (product sync)

### 2026-07 — Hospitality + landing refresh (PR #172 era)

Synced academy with `hotel_restaurant` and broader named-type drift:

- Landing (`docs/intro.md`): business types, verticals card, Cap Online vs Service phone surfaces
- `overview/product-domain` — type #6 Hotel / Restaurant + hospitality module row
- `frontend/features-catalog` — Hospitality module + archetype list
- `api/hospitality.md` (new) + `api/overview` + sidebar
- `architecture/business-workflows` — Workflow 7; `design-decisions` — one-app-per-shell stance
- `database/tenant-tables` — `hosp_*`; `schema-overview` / `testing/e2e` type lists
- `backend/permissions` — 14th module `hospitality` + tab-id vs module-key tip

### Earlier

Party-linked standalone invoices + Invoice Finance `partyKey` + price-list bulk/PDF (PR #68): curated chapters in `overview/product-domain`, `frontend/features-catalog`, `api/finance-accounts`, `architecture/business-workflows` (workflows 5–6), `database/tenant-tables` + `erd`, `testing/api-integration`, `glossary/domain-terms`. Re-run `npm run generate:files` after pulling route changes.

## Still missing / worth a follow-up (not blocking)

| Gap | Notes |
|---|---|
| Product marketing `LandingPage.tsx` | Still lists only Retail / Dealer / Manufacturer / Service — no Silver Casting or Hotel cards (marketing, not academy) |
| App Finance branch for hotels | `businessTypeConfig.financeView: 'invoice'` but `App.tsx` only swaps Invoice Finance for `service` — document/fix separately |
| `tabAccess` ↔ `hospitality` module map | Documented tip; code fix optional |
| Generated file deep-dives | Re-run `npm run generate:files` so `hospitality.ts` / `hospitalitySeed.ts` appear under `/files/generated` |
| Glossary / quizzes | No hospitality terms or quiz questions yet |
| Python E2E (`e2e_by_type.py`) | Still framed around 4 goods/service types; silver/hotel are Vitest/API-first |

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
