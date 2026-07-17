#!/usr/bin/env node
/**
 * Replaces generic stubs with section-aware mentoring pages.
 * Skips files that no longer contain the stub marker.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS = path.resolve(__dirname, '../docs');
const MARKER = 'Chapter in the living academy';

const SECTION_BODY = {
  overview: `## Business context

Dhandho sells operational clarity to Indian SMEs: stock, distribution, GST bills, and collections in one system. This chapter sits in the **overview** track — product intent before code.

## Key concepts

| Term | Meaning here |
| --- | --- |
| Tenant | One company / data plane |
| Slug | URL brand key \`/{slug}\` |
| Business type | Preset that drives \`tab_config\` |
| Super Admin | Platform operator, not a tenant user |

## Why this architecture serves the business

Four surfaces (web, Electron cloud, Electron on-prem, Capacitor) share one Express+Postgres brain so features are not rewritten per channel.

\`\`\`mermaid
flowchart LR
  SME[SME owner] --> Web
  SME --> Mobile
  SME --> Desktop
  Web --> API[Express]
  Mobile --> API
  Desktop --> API
  API --> PG[(Postgres)]
\`\`\`

## Alternatives considered

| Alternative | Why rejected (for now) |
| --- | --- |
| Separate native apps per OS | 3× engineering cost |
| Generic global ERP fork | Weak GST/UPI fit |
| Microservices Day 1 | Ops overhead vs team size |

## Common mistakes for new owners

1. Treating Super Admin like Tenant Admin  
2. Changing \`tab_config\` only in the frontend  
3. Ignoring plan limits when adding bulk import  

## Hands-on

1. Create two tenants of different business types  
2. Diff visible sidebar tabs  
3. Find the preset source in \`server/routes/super-admin.ts\` and \`src/lib/businessTypeConfig.ts\`

## Interview question

*How does business type affect both UX and authorization surface?*

:::info Answer sketch

It changes which modules appear (\`tab_config\`) and therefore which API modules users hit; permissions still enforce server-side even if a tab is hidden.

:::
`,

  architecture: `## Architectural role

This chapter explains **structure and force multipliers** of the monolith: request path, tenancy, surfaces, and workflows.

## Invariants (tattoo these)

1. Tenant id comes from verified JWT, not client whim  
2. Every tenant SQL predicate includes \`tenant_id\`  
3. RLS is a seatbelt; application SQL is the brake pedal  
4. One codebase → four surfaces  

\`\`\`mermaid
flowchart TB
  C[Clients] --> M[Middleware spinal cord]
  M --> R[Domain routers]
  R --> DB[(PG + locks)]
  R --> NIC[GST NIC]
\`\`\`

## Trade-offs to defend in design review

| Preference | Cost |
| --- | --- |
| Monolith simplicity | Vertical scale first |
| Raw SQL | More boilerplate |
| Tab SPA routing | Weaker deep links |

## Debugging mindset

When something is wrong, ask: *Did middleware reject it, did SQL return zero rows, or did the UI hide it?* Those are three different bugs.

## Exercise

Trace \`POST /api/distribution\` from \`DistributionView\` through middleware to the transaction that locks inventory.

## Related deep dives

- [/architecture/system-overview](/architecture/system-overview)  
- [/architecture/multi-tenancy](/architecture/multi-tenancy)  
- [/architecture/request-lifecycle](/architecture/request-lifecycle)
`,

  backend: `## Backend ownership notes

Server code lives under \`server/\`. Runtime is \`tsx\` executing TypeScript directly. There is **no ORM**.

## Request admission control

Order matters: correlation → helmet → CORS → rate limit → JWT hydrate → module permissions → handler.

## Patterns you will copy

| Pattern | Where |
| --- | --- |
| \`BEGIN/COMMIT\` + \`FOR UPDATE\` | inventory mutations |
| \`safeError\` allow-list | GST routes |
| GST SQL fragments | \`utils/helpers.ts\` |
| \`authCache\` 30s | hot path auth |
| Fail-closed plan limits | \`planLimits.ts\` |

## What breaks production

- Query without \`tenant_id\`  
- Returning driver errors to clients  
- Trusting JWT \`role\` without DB hydrate  
- Blocking the event loop with huge sync parses  

## Lab link

Practice with [/labs/lab-add-endpoint](/labs/lab-add-endpoint) and [/labs/lab-debug-403](/labs/lab-debug-403).

## Complexity cheat sheet

| Op | Typical cost |
| --- | --- |
| JWT verify | O(1) |
| Indexed tenant select | O(log n) |
| Unindexed ilike search | O(n) — paginate! |
| Bulk insert | chunk ≤5000 rows (PG param limit) |
`,

  frontend: `## Frontend ownership notes

React 19 + Vite 6 SPA. **No Redux. No React Router.** State is feature-local + \`session\` localStorage + toast/i18n context.

## Shell responsibilities (\`App.tsx\`)

- Public routes: landing, privacy, terms, download, super-admin  
- Tenant slug login branding  
- Authenticated tab switch + mobile bottom nav  
- Permission-gated lazy feature views  
- Impersonation token consumption  

## Data access

All HTTP goes through \`fetchApi\` → platform-aware base URL → retries/cache/offline queue.

\`\`\`mermaid
flowchart LR
  View --> fetchApi --> apiBase --> Network
  fetchApi --> MemCache[3s Map]
  fetchApi --> OfflineQ[mobile queue]
\`\`\`

## Platforms matrix

| | Online | Offline-ish |
| --- | --- | --- |
| Mobile | heartbeat + API | cache + mutation queue |
| Desktop on-prem | local Express | full local DB |
| Web | cloud only | banner only |

## Performance rules of thumb

- Keep authenticated shell main chunk under CI gzip gate (256KB)  
- Lazy-load heavy views (distribution, accounts)  
- Dynamic-import \`xlsx\`  

## Exercise

Disable network in Chrome, perform a mobile-mode mutation (or simulate \`isMobileClient\`), inspect offline queue keys in localStorage.
`,

  database: `## Database ownership notes

PostgreSQL 16. Schema authored in \`server/pg-db.ts\` via idempotent DDL. Platform tables lack \`tenant_id\`; tenant tables almost always have it + RLS policy.

## ER spine

\`products → product_inventory → product_distribution / product_sales → warranties/rewards\`

Purchases feed inventory barcodes so stock is sellable immediately.

## Isolation

\`\`\`sql
-- Primary
WHERE tenant_id = $1
-- Safety net
USING (tenant_id = current_setting('app.tenant_id', true))
\`\`\`

Pool owner can bypass RLS — never remove WHERE clauses.

## Migrations philosophy

Expand/contract manually inside \`initSchema\`. No down migrations. On-prem self-heals by booting new code.

## Performance

- Composite indexes on \`(tenant_id, …)\`  
- Paginate list endpoints  
- Chunk bulk inserts (5000)  
- Use \`FOR UPDATE SKIP LOCKED\` for allocation races  

## Exercise

\`EXPLAIN ANALYZE\` a products list query with and without \`tenant_id\` first in the index — discuss order.
`,

  api: `## API ownership notes

~34 Express routers under \`server/routes\`. JSON camelCase outward; SQL snake_case inward.

## Cross-cutting headers

| Header | Role |
| --- | --- |
| \`Authorization: Bearer\` | JWT |
| \`X-Tenant-ID\` | echoed/derived context (server authoritative) |
| \`X-Correlation-ID\` | support tracing |

## Error shape

\`\`\`json
{ "error": "Human message" }
\`\`\`

5xx become generic + \`correlationId\`.

## AuthZ reminders

- Module permissions after JWT  
- \`blockVendors\` / \`assertVendorAccess\` on sensitive domains  
- Super Admin routes use different middleware  

## Conventions checklist for new endpoints

1. Register router in \`app.ts\`  
2. Add \`moduleForPath\` mapping  
3. Parameterized SQL with \`tenant_id\`  
4. Vitest in \`tests/api\`  
5. Optional \`api.*\` wrapper in \`src/api.ts\`  

## Related

- [/api/conventions](/api/conventions)  
- [/backend/routes-catalog](/backend/routes-catalog)
`,

  security: `## Security ownership notes

Highest severity class: **cross-tenant disclosure**. Second: GST secret leakage. Third: XSS → JWT theft (localStorage).

## Control highlights

| Control | Mechanism |
| --- | --- |
| AuthN | JWT HS256, bcrypt, rate limits |
| AuthZ | roles + module ranks + vendor scope |
| Secrets | env + AES-GCM for GST fields |
| Transport | HTTPS at edge; helmet CSP |
| Abuse | login/forgot/chatbot limiters |
| Audit | \`audit_log\` + SA actions |

## Threat drills

1. Vendor IDOR  
2. Impersonation replay after 15m  
3. Backup restore column injection (allowlist)  
4. Stolen laptop with localStorage JWT  

## Accepted risks (do not "quietly undo")

Documented in [/security/accepted-risks](/security/accepted-risks): JWT storage, xlsx CVE, RLS not forced.

## Exercise

Map one recent PR to OWASP categories in [/security/owasp](/security/owasp).
`,

  performance: `## Performance ownership notes

CI enforces **main chunk gzip &lt; 256KB**. Manual Vite chunks split react/motion/scanner/xlsx/icons.

## Hot paths

| Path | Care |
| --- | --- |
| Auth middleware | \`authCache\` 30s |
| GET lists | 3s memory cache; paginate |
| Distribution UI | largest view — code-split |
| Reports | heavy SQL — date bounds required |
| Mobile offline | durable cache TTL |

## Anti-patterns

- \`SELECT *\` without limit  
- N+1 barcode loops  
- Sync parsing multi‑MB XLS on request thread  
- Re-rendering entire masters table on each keystroke (debounce!)  

## Challenge

Find one list endpoint missing pagination; propose API + UI change with complexity before/after.
`,

  sre: `## SRE ownership notes

Today: \`/api/health\`, correlation IDs, PII-redacted logger, optional Logtail. Tomorrow: Prometheus histograms + Grafana.

## Golden signals mapping

| Signal | Dhandho proxy |
| --- | --- |
| Latency | p95 login + product list |
| Traffic | req/min per instance |
| Errors | 5xx ratio + correlationId volume |
| Saturation | DB pool wait, CPU on Render |

## Runbook reflex

1. Check health  
2. Check Render/deploy version  
3. Grep correlationId  
4. Determine blast radius (one tenant vs all)  
5. Rollback if needed  

See [/runbooks](/runbooks).
`,

  deployment: `## Deployment ownership notes

| Target | Path |
| --- | --- |
| Cloud | Render via \`render.yaml\` |
| Containers | Dockerfile multi-stage + compose |
| Desktop | electron-builder cloud/onprem |
| Mobile | Capacitor \`dist-mobile\` |

## Render footgun

\`NODE_ENV=production\` during build skips devDependencies — hence \`npm ci --include=dev\` so Tailwind/Vite exist at build time. Tests must **not** run against prod DB.

## Release gates

lint → security grep → vitest+coverage → typecheck → build → gzip size → (tag) e2e + desktop artifacts.

## Exercise

Read \`docs/DEPLOYMENT.md\` in the product repo and reconcile every env var with [/deployment/env-vars](/deployment/env-vars).
`,

  testing: `## Testing ownership notes

Vitest + supertest + **real Postgres**. Helpers: \`createTestToken\`, \`cleanupTestData\`. Coverage gates on critical modules (utils/services/mobile) at 90%/75% branches.

## What is missing

Few React Testing Library component tests — UI risk is carried by API contracts + manual \`tests/cases/*.md\`.

## How to add a test

1. Create tenant fixtures in \`beforeAll\`  
2. Hit \`createApp()\` with supertest  
3. Assert status + tenant isolation  
4. Cleanup in \`afterAll\`  

## Exercise

Write a failing test that would catch a missing \`tenant_id\` on a new endpoint — then implement the endpoint correctly.
`,

  runbooks: `## Runbook format

1. **Symptoms**  
2. **Immediate mitigation**  
3. **Diagnosis steps**  
4. **Resolution**  
5. **Prevention**  

Always capture \`correlationId\` and tenant slug before restarting anything.

## Severity guide

| Sev | Example |
| --- | --- |
| SEV1 | All logins failing / DB down |
| SEV2 | GST IRN failing for many tenants |
| SEV3 | Single tenant misconfig |

## Related

- [/sre/failure-scenarios](/sre/failure-scenarios)  
- [/deployment/render](/deployment/render)
`,

  learning: `## Learning module structure

Each module should leave you able to **teach it back** in five minutes.

Includes: summary, glossary terms, interview Qs, hands-on, debugging drill, optimization challenge, quiz.

## Suggested order

1. Multitenancy  
2. AuthZ  
3. Distribution + GST  
4. Platforms (mobile/on-prem)  
5. Accounts/reports  

## Capstone

Ship a small production-safe PR: pagination fix, permission mapping, or test for IDOR — with academy links in the PR description.
`,

  labs: `## Lab norms

- Time-box yourself  
- Write down expected vs actual  
- Prefer breaking your local DB over guessing  
- Never point labs at production  

## Grading yourself

You pass a lab when you can explain the failing check without looking at notes.
`,

  quizzes: `## How to use quizzes

Answer first on paper. Then open the details. Wrong answers → open the linked chapter → retry next day.

## Score bands

| Score | Meaning |
| --- | --- |
| &lt;50% | Re-do Day-1 path |
| 50–80% | Pair with a lab |
| &gt;80% | Ready to own on-call for that area |
`,

  animations: `## Animation lesson kit

Every lesson includes: storyboard table, narration script cues, timing, Mermaid frames, SVG plan, quiz, estimated duration.

Use them in onboarding live sessions — don't only read silently.
`,

  glossary: `## Glossary usage

Prefer linking glossary terms from feature chapters. When product language drifts (e.g. "dealer" vs "vendor"), document both.
`,

  scaling: `## Scaling & redesign

Scale problems worth solving **after** metrics prove pain:

1. DB CPU from unindexed filters  
2. Event-loop blocking parses  
3. Multi-instance sticky authCache assumptions  
4. Schema migrations needing true versioning  

## Redesign options (when earned)

| Move | Trigger |
| --- | --- |
| Extract reporting read replica | Report queries starve OLTP |
| Job queue for IRN/EWB | NIC latency blocks UX |
| React Query | Cache bugs across views |
| Real migration tool | Destructive schema changes frequent |

See tech debt register for scored items from prior audits (82→88).
`,

  files: `## File mentoring lens

For this file/module family:

1. Purpose & business value  
2. Imports/exports  
3. Call hierarchy  
4. Tenancy & authz touchpoints  
5. Failure modes  
6. Perf & security  
7. Refactors & alternatives  

Use the [generated index](/files/generated) for exhaustive coverage; use curated pages for narrative.
`,

  tutorials: `## Tutorial norms

Do the steps in order. Exit criteria are binary — you either can or cannot demo the skill.

Pair with [/tutorials/day-1-onboarding](/tutorials/day-1-onboarding).
`,
};

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'generated') continue; // don't touch generated deep-dives
      walk(p, acc);
    } else if (e.name.endsWith('.md')) acc.push(p);
  }
  return acc;
}

function titleFrom(id) {
  return id
    .split('/')
    .pop()
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

function enrich(id, section) {
  const title = titleFrom(id);
  const body = SECTION_BODY[section] || SECTION_BODY.overview;
  return `---
sidebar_label: ${title}
title: ${title}
description: Dhandho Engineering Academy — ${id}
---

# ${title}

:::tip Curriculum chapter
Part of the **Dhandho Engineering Academy** (\`${id}\`). Built for ownership transfer of DG-ERP — not a wiki stub.
:::

## Learning objectives

- Explain why this area exists in the product narrative  
- Point to the concrete files that implement it  
- Name one failure mode and one mitigation  
- Complete the exercise before marking yourself done  

${body}

## Cross-links

- [Welcome](/)  
- [System overview](/architecture/system-overview)  
- [Multi-tenancy](/architecture/multi-tenancy)  
- [Threat model](/security/threat-model)  
- [Labs](/labs)  
- [Runbooks](/runbooks)  
- [Glossary](/glossary)  
- [Generated file index](/files/generated)  

## Further reading

- Product repo \`DEVELOPER.md\`, \`docs/architecture.md\`  
- Academy continuity: \`CONTINUITY.md\` at academy root  
`;
}

function main() {
  const files = walk(DOCS);
  let n = 0;
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    if (!text.includes(MARKER)) continue;
    const rel = path.relative(DOCS, f).replace(/\\/g, '/').replace(/\.md$/, '');
    const section = rel.split('/')[0];
    fs.writeFileSync(f, enrich(rel, section));
    n++;
  }
  console.log('Enriched', n, 'stub pages');
}

main();
