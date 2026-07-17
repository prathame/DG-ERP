# Academy meta

Curriculum design notes for maintainers of the Dhandho Engineering Academy.

## Pedagogy principles

1. **WHY before WHAT** — every chapter opens with business value  
2. **Threats next to features** — security is not a separate silo only  
3. **Labs beat lectures** — each major module has a hands-on  
4. **Generated completeness + curated narrative** — 208 file pages + staff-written spines  
5. **Assume AI-authored product code** — teach how to inherit it safely  

## Directory roles

| Path | Role |
|---|---|
| `docs/` | Published Docusaurus content |
| `diagrams/` | Exportable Mermaid sources |
| `scripts/` | Generators (`generate-file-deepdives`, `ensure-stubs`) |
| `quizzes/` `labs/` `animations/` | Optional raw assets mirrored into `docs/` |
| `glossary/` | Term bank drafts |

## Updating after product changes

1. Pull latest DG-ERP  
2. `npm run generate:files`  
3. Update curated chapter if behavior/architecture changed  
4. Add a quiz question if a footgun appeared  
5. `npm run build`  

## Versioning

Docusaurus versioning can be enabled later (`npm run docusaurus docs:version 2.2.0`) when you cut academy releases aligned to product tags.
