# Dhandho Engineering Academy

Interactive internal engineering onboarding portal for **[DG-ERP / Dhandho](https://github.com/prathame/DG-ERP)**.

This is **not** product documentation. It is a training platform: architecture, every major file/function, security, SRE, labs, quizzes, animations, and runbooks — so a new engineer can become productive without tribal knowledge from the original developer.

## Quick start

```bash
cd engineering-academy
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000).

```bash
npm run build   # production static site
npm run serve   # preview build
```

## Curriculum map

| Track | Path |
|---|---|
| Welcome & overview | `/` · `/overview/*` |
| Architecture | `/architecture/*` |
| Backend | `/backend/*` |
| Frontend | `/frontend/*` |
| Database | `/database/*` |
| API | `/api/*` |
| File walkthrough | `/files/*` |
| Security / Performance / SRE | `/security/*` · `/performance/*` · `/sre/*` |
| Deployment & runbooks | `/deployment/*` · `/runbooks/*` |
| Labs, quizzes, animations | `/labs/*` · `/quizzes/*` · `/animations/*` |
| Glossary & scaling | `/glossary/*` · `/scaling/*` |

## Source of truth

This folder lives inside the DG-ERP monorepo. Generators scan the repo root (`..`). When product code changes, update the matching chapter and run `npm run generate:files`.

## Stack

- [Docusaurus 3](https://docusaurus.io/)
- Mermaid diagrams (`@docusaurus/theme-mermaid`)
- Local search (`@easyops-cn/docusaurus-search-local`)
- Dark mode, versioning-ready docs layout
