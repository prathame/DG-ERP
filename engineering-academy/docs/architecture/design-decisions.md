---
sidebar_label: Design Decisions
title: Design Decisions & Rejected Alternatives
description: The major architectural choices in DG-ERP, why each was made, what was considered and rejected, and the accepted risks that follow from each choice.
---

# Design Decisions & Rejected Alternatives

Every "why didn't they just use X" question you'll have in your first month has an answer on this page. Treat this as the ADR (Architecture Decision Record) log this codebase never formally wrote down — reconstructed from the code, the comments, and the product constraints in [Business Goals](/overview/business-goals).

:::tip How to read this page
Each decision includes a **rejected alternatives table**. If you're proposing to revisit a decision, start by checking whether the reasons it was rejected before still apply — if the product/team constraints have genuinely changed, that's a legitimate reason to reopen it. If they haven't, you're about to relearn a lesson the codebase already paid for.
:::

## Decision: No ORM — raw SQL via `pg`

Every query in `server/routes/` is hand-written parameterized SQL against `node-postgres`'s `Pool`. There is no Prisma, Drizzle, TypeORM, or Sequelize.

| Option | Pros | Why rejected |
|---|---|---|
| **Raw SQL** (chosen) | Full control over complex GST/aggregate queries; zero abstraction tax; schema can evolve with plain `ALTER TABLE`; no code-generation step to keep in sync | Loses compile-time query safety; easy to forget `WHERE tenant_id` (mitigated by RLS — see [Multi-tenancy](./multi-tenancy.md)) |
| Prisma / Drizzle | Type-safe queries, migration tooling, less boilerplate | Schema-first codegen friction against a schema that changes via ad-hoc `ALTER TABLE IF NOT EXISTS` on every boot; ORMs make certain GST aggregate/report queries (multi-table joins with conditional tax math) harder to express than raw SQL |
| TypeORM / Sequelize | Familiar "active record" style | Heavier runtime abstraction, less control over exact query shape, historically weaker TypeScript ergonomics |

**Accepted trade-off**: query correctness is a human/review responsibility, not a compiler guarantee. This is exactly why tenant-scoping discipline (Layer 2 in [Multi-tenancy](./multi-tenancy.md)) matters so much here specifically.

## Decision: No React Router — manual routing in `App.tsx`

There is no `react-router-dom` dependency. Navigation is a mix of `window.location.pathname` parsing (for the `/:slug` tenant entry point and Super Admin/download/legal pages) and in-app tab state for the authenticated app shell.

| Option | Pros | Why rejected |
|---|---|---|
| **Manual routing** (chosen) | Zero extra dependency; the authenticated app is fundamentally a tabbed dashboard, not a multi-page document — tabs aren't really "routes" in the traditional sense; slug resolution is a one-time parse, not a routing tree | Deep-linking to a specific in-app tab/state is weaker; no built-in route-level code splitting patterns (handled manually via `React.lazy`) |
| React Router | Declarative routes, nested layouts, built-in code-splitting patterns, browser history integration | The authenticated app's navigation model (a persistent sidebar + tab switch, not page navigation) doesn't map cleanly onto a route tree; would add a dependency and an abstraction layer for a navigation pattern that's closer to "which panel is visible" than "which URL am I on" |

**Accepted trade-off**: no automatic browser back/forward support for in-app tab switches, and URL state for the authenticated app is minimal. This was judged acceptable because the primary navigation pattern (switch tabs within one logged-in session) doesn't benefit much from URL-addressability, while the actually-important URLs (`/:slug`, `/admin`, `/download`, `/privacy`) are handled explicitly and correctly.

## Decision: No migrations framework — idempotent `initSchema()`

`server/pg-db.ts` runs `CREATE TABLE IF NOT EXISTS` and `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` statements unconditionally on every server boot, in chronological order of when each feature was added. There is no `migrations/` folder, no migration history table, no `up`/`down` pair.

| Option | Pros | Why rejected |
|---|---|---|
| **Idempotent boot-time DDL** (chosen) | Zero extra tooling; deploying a schema change is just deploying code; identical mechanism works on hosted Postgres *and* the embedded on-prem Postgres — no separate migration runner needed for the offline deployment target | No rollback story; no explicit migration history; a destructive change (dropping/renaming a column) has no clean two-step pattern and must be handled very carefully by hand |
| Knex / node-pg-migrate | Explicit up/down migrations, history tracking, safer destructive changes | Extra tooling and a migration-runner step to keep working identically against embedded Postgres on a customer's laptop; more ceremony for the additive, `IF NOT EXISTS`-style changes that make up the vast majority of this schema's history |
| Prisma Migrate | Type-safe, integrated with a Prisma schema | Bundled with the "adopt an ORM" decision already rejected above |

**Accepted trade-off**: destructive schema changes (dropping a column, renaming a table) are rare, manual, and higher-risk than they'd be with a real migration framework. In practice, this codebase almost never drops columns — it adds new ones and leaves old ones as either unused or repurposed, which sidesteps the sharpest edge of not having rollback tooling. If you need to actually remove something, treat it as a special, carefully-reviewed operation, not routine schema work.

## Decision: JWT in `localStorage`, accepted risk

The auth token is stored in `localStorage` (via `src/lib/session.ts`, slug-scoped) and sent as an `Authorization: Bearer` header, rather than in an httpOnly cookie.

| Option | Pros | Why rejected (for now) |
|---|---|---|
| **`localStorage` + Bearer header** (chosen) | Simple to implement identically across all four surfaces (a cookie's domain/SameSite rules get genuinely awkward across a Capacitor WebView, an Electron `file://`-adjacent context, and a hosted web origin); trivially portable token handling in `api.ts` | Readable by any JavaScript running on the page — a successful XSS attack can steal the token |
| httpOnly cookie | Immune to JavaScript-based token theft | Cookie behavior differs meaningfully across browser, Electron, and Capacitor WebView contexts (domain scoping, `SameSite`, whether the "cookie jar" is even shared the way you'd expect); would need surface-specific handling, undermining the "one API contract for four clients" simplicity |

**Accepted trade-off, explicitly documented**: this is a known, named risk, not an oversight. It is mitigated — not eliminated — by: a strict CSP (`helmet()` in `app.ts`, disallowing inline scripts in production), sanitizing what's actually persisted in `localStorage` (`sanitizeUserForStorage()` strips phone/address/GST fields before they're ever written), a 24-hour token expiry, and password-change-invalidates-existing-sessions logic. See [Security → Accepted Risks](/security/accepted-risks) for the full write-up and the conditions under which this decision should be revisited.

:::warning Don't "fix" this in isolation
Switching to httpOnly cookies without solving the cross-surface cookie-scoping problem (particularly for Capacitor and Electron) would likely just trade one class of bug for another, more subtle one (silently broken auth on one surface). If you want to revisit this decision, it needs a surface-by-surface design, not a single PR.
:::

## Decision: Business-type presets over a generic workflow builder

Covered in depth in [Business Goals](/overview/business-goals) — summarized here for completeness: five fixed presets (`manufacturer`, `dealer`, `retail`, `service`, `custom`) rather than a configurable no-code workflow engine. Rejected because a general workflow builder is an order of magnitude more engineering effort for a benefit (perfect per-customer fit) that the actual customer base — Indian SMEs who want "the dealer app" or "the manufacturer app," not a blank canvas — doesn't need. The `custom` type is the deliberate escape hatch for the exceptions.

## Decision: RLS enabled, not forced

Covered in full in [Multi-tenancy](./multi-tenancy.md) — `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` plus a matching policy on every tenant-scoped table, but explicitly **not** `FORCE ROW LEVEL SECURITY`. Forcing it was tried and reverted because most queries use a pooled connection without a per-request `app.tenant_id` set, and a forced policy against an unset session variable returns zero rows silently rather than erroring — a worse failure mode than the omission it would guard against.

## Decision: Single shared Express monolith, not microservices

| Option | Pros | Why rejected |
|---|---|---|
| **Single Express monolith** (chosen) | Runs identically hosted *and* embedded inside an offline Electron on-prem install; one deployable artifact; simple mental model for a small team/AI-agent workflow | Less independent scalability per-domain; a bug in one route file can theoretically affect the whole process's stability (mitigated by the global error-handling middleware) |
| Microservices (per-domain services) | Independent scaling and deployment per domain | Cannot run "a service mesh" on a customer's offline laptop for the on-prem surface; massively more operational complexity for a team this size; network calls between services add latency and failure modes with no corresponding benefit at current scale |

## Decision: Accepted, documented `xlsx` (SheetJS) vulnerability

The `xlsx` npm package has open CVEs with no registry-published fix (the maintainers ship fixes only via their own CDN, not npm). Rather than silently ignore or hastily replace it:

| Option | Why rejected / status |
|---|---|
| Keep `xlsx` from npm (chosen, tracked) | Feature parity (ICICI/HDFC/SBI statement parsing, product CSV/Excel export) with no drop-in replacement found; input surface for parsing is constrained (bank statement uploads, admin-only CSV export) rather than arbitrary untrusted files from anonymous users |
| Switch to SheetJS's CDN-distributed fixed version | Breaks the normal `npm install` supply chain story; introduces a non-registry dependency source, itself a supply-chain risk trade-off |
| Replace with a different library | No evaluated alternative yet reaches full feature parity for both `.xls` (legacy Excel) and `.xlsx` parsing used by Indian bank statement exports |

This is tracked as an accepted risk with a documented rationale — see [Security → Accepted Risks](/security/accepted-risks) — precisely so it isn't rediscovered and "fixed" hastily without weighing the trade-off again.

## Decision matrix summary

| Decision | Primary driver | Where the trade-off lands |
|---|---|---|
| No ORM | Raw SQL control for GST/report queries + always-additive schema | Query correctness is a review/discipline responsibility |
| No React Router | App is tabs, not pages | Weaker deep-linking within the authenticated app |
| No migrations framework | Works identically on hosted and embedded Postgres | No rollback tooling for destructive changes |
| JWT in `localStorage` | Uniform auth across 4 surfaces | XSS-adjacent token theft risk, mitigated by CSP + sanitization |
| Business-type presets | Fast, predictable UX for the actual customer base | Less flexible than a generic workflow builder |
| RLS enabled, not forced | Avoid silent zero-row failures on pooled connections | RLS is a safety net, not the primary tenant-isolation mechanism |
| Monolith, not microservices | Must run offline on one customer machine | Less independent per-domain scalability |
| Keep `xlsx` despite CVEs | No feature-complete replacement found | Documented, monitored, accepted risk |

## Key concepts

- **Every "missing" piece of standard tooling here has a specific, product-shaped reason**, not an oversight.
- **Accepted risk ≠ ignored risk** — the difference is a written rationale and a monitoring/revisit trigger.
- **The on-prem deployment target constrains almost every backend decision** — it's the recurring "why" behind avoiding microservices, avoiding cloud-only migration tooling, and avoiding TLS-dependent assumptions.

## Common mistakes

1. Proposing to "just add" React Router, an ORM, or a migrations framework without first reading why they were rejected — you may be about to reintroduce a previously-solved-around constraint.
2. Treating an accepted risk as unaddressed technical debt to silently "clean up."
3. Assuming a decision made for the cloud surface (like httpOnly cookies) is a safe drop-in without checking how it behaves on Electron and Capacitor too.

## Interview question

> **Q: Someone on your team wants to introduce Prisma "to get type safety on our queries." How do you evaluate this proposal against the existing architecture?**
>
> Expected answer: acknowledge the real benefit (compile-time query safety) but weigh it against the specific reasons raw SQL was chosen here — the schema evolves via ad-hoc `ALTER TABLE IF NOT EXISTS` statements rather than a migration-first workflow Prisma expects, and several GST/report queries are complex multi-table aggregates that are often easier to express and tune directly in SQL. A good answer proposes either a scoped pilot (e.g., typed query *result* interfaces without a full ORM) or acknowledges that adopting Prisma would also require adopting Prisma Migrate, which reopens the "no migrations framework" decision and its own on-prem/embedded-Postgres constraint — not a decision to make in the same PR as "let's try an ORM."

## Related

- [Multi-tenancy](./multi-tenancy.md)
- [Four Surfaces](./four-surfaces.md)
- [Tech Stack](/overview/tech-stack)
- [AI Origin Assumptions](/overview/ai-origin-assumptions)
- [Security → Accepted Risks](/security/accepted-risks)
