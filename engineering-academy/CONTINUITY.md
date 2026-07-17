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

## How to continue in a new chat

> Continue the Dhandho Engineering Academy at `engineering-academy/` inside DG-ERP.  
> SRE and Labs are deferred. Prefer depth on distribution, GST, purchases, Electron on-prem, mobile offline.  
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
