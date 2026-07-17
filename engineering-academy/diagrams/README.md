# Diagrams

Mermaid sources used across the Engineering Academy live primarily **inline in docs** (so they render with Docusaurus Mermaid).

This folder holds exportable copies for slide decks and onboarding PDFs.

| File | Topic |
|---|---|
| `system-overview.mmd` | Four surfaces → Express → Postgres |
| `request-lifecycle.mmd` | Middleware sequence |
| `multi-tenancy.mmd` | Three locks |
| `auth-flow.mmd` | Login + JWT |
| `erd-core.mmd` | Core ERD |
| `cicd.mmd` | GitHub Actions pipeline |
| `deploy-render.mmd` | Render architecture |

Regenerate PNGs (optional) with any Mermaid CLI:

```bash
npx -y @mermaid-js/mermaid-cli -i system-overview.mmd -o system-overview.png
```
