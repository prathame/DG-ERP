---
sidebar_label: Interview Question Bank
title: Interview Question Bank
description: Staff-level interview questions grounded in the real Dhandho / DG-ERP architecture — with what a strong answer actually sounds like, not just a topic list.
---

# Interview Question Bank

Use these for hiring onto the Dhandho team, for calibrating a technical interview loop, or as a self-interview after finishing onboarding — if you can answer these convincingly and specifically (not just in generic architecture-speak), you understand this codebase, not just architecture in general.

:::tip What separates a strong answer from a weak one here
A weak answer describes the *general pattern* ("use tenant IDs to scope data"). A strong answer names the **actual file, function, and specific trade-off** this codebase made, and can articulate what would break if it were done differently. Grade accordingly.
:::

## Multi-tenancy

1. Explain the three isolation layers in this system. Which is primary in practice, and why do the other two exist if they're not primary?
2. How would you design a linter or CI check that catches a query missing `WHERE tenant_id`? What false positives would you need to guard against (hint: platform tables have no `tenant_id` at all)?
3. The vendor portal is effectively tenancy-within-tenancy. Walk through exactly how `vendorScopeId()` and `assertVendorAccess()` prevent Vendor A from viewing Vendor B's distribution records, and name the HTTP status code a correctly-implemented route should return for the attempt.
4. Why was `FORCE ROW LEVEL SECURITY` tried and reverted? What specific failure mode made it worse than the status quo, not just no-better?
5. Design (verbally) a migration path to horizontal database sharding by tenant, given the current schema's composite `(id, tenant_id)` keys. What becomes hard? What stays easy?

## AuthN / AuthZ

1. Why does the auth middleware re-fetch role/status from the database on every request (via a 30-second cache) instead of trusting the JWT's embedded claims for its full 24-hour lifetime?
2. How does a password change invalidate all previously-issued sessions without maintaining a token blocklist/revocation table?
3. Compare `localStorage`-stored JWTs against `HttpOnly` cookie sessions specifically for this SPA + Electron + Capacitor product shape — where does each option's weakness actually bite, given the three different runtime environments?
4. Two independent authorization layers exist: module permissions and route-level role guards. Give a concrete example where a user could pass one layer and fail the other, and explain why that's not a bug but the intended design.
5. Why does `getAccessLevel()` give Admin/Super Admin an unconditional bypass of the stored `permissions` JSON, rooted in the `role` column instead?

## Data & GST

1. Why centralize GST calculation SQL fragments/helpers rather than duplicating tax-rate logic per route? What's the failure mode of *not* centralizing it?
2. Walk through the quotation-to-distribution conversion locking strategy (`FOR UPDATE SKIP LOCKED`) — what race condition does it prevent, and what would happen under concurrent conversion attempts without it?
3. What's specifically dangerous about generating an IRN (Invoice Reference Number) twice for the same invoice, given how the government's NIC system treats duplicate submissions? How does the code guard against accidental duplicate generation?
4. `NUMERIC(12,2)` is used for money columns instead of `FLOAT`/`DOUBLE`. What concrete bug would floating-point money cause in this domain, beyond "it's imprecise"?

## Frontend & platforms

1. How does the mobile offline mutation queue avoid replaying a request with stale or leaked authorization headers when connectivity returns after a long offline period (e.g. the JWT expired while offline)?
2. Why manually configured Vite chunks (`manualChunks`) *and* a 256KB gzip CI gate, rather than relying on Vite's default chunking heuristics alone?
3. Argue both sides: hand-rolled tab routing vs. adopting React Router in `App.tsx`. What does each choice optimize for, and what does this specific product's URL/navigation needs actually require?
4. `src/platforms/{shared,desktop,mobile}` is the seam that lets one feature codebase run on four surfaces. Describe a hypothetical new feature that needs genuinely different behavior on mobile vs. web, and where exactly that branching logic should live.

## Ops & SRE

1. Render's build command is `npm ci --include=dev` even though the runtime shouldn't need devDependencies. Why is `--include=dev` actually necessary here specifically (hint: think about what the build step itself needs, not the running server)?
2. Design a rollback strategy for a bad schema change, given that `initSchema()` is idempotent and additive-only. What's your actual recovery plan the day someone ships a schema change that breaks production?
3. What belongs in a runbook versus what belongs in code comments versus what belongs in this documentation site? Give one concrete example of content that would be miscategorized in each of the two wrong places.
4. `GET /api/health` does a real `SELECT 1`. What's one failure mode this check would *not* catch, and how would you extend observability to catch it?

## Design judgment (open-ended, no single right answer)

1. If you joined this team today and had one week to reduce operational risk with no new features, what would you spend it on, and why — pick from the [Tech Debt Register](/scaling/tech-debt-register) or propose your own.
2. Is raw `pg` + hand-written SQL still the right call at 10x the current tenant count? At 100x? Where's the line, and what would you measure to know you've crossed it?
3. The accepted risk register includes JWT-in-`localStorage`, the `xlsx` CVE, and no migration framework. Rank these three by how urgently you'd want to address them, and defend your ranking against someone who ranks them differently.

## Scoring rubric

| Signal | Strong answer mentions | Weak answer looks like |
|---|---|---|
| **Security depth** | IDOR, XSS/CSP trade-offs, secret derivation chains (`JWT_SECRET` → AES key), fail-open vs. fail-closed | Generic "use HTTPS and validate input" |
| **Pragmatism** | Names specific accepted risks and their compensating controls; distinguishes "not done" from "deliberately deferred" | Treats every simplification as an unqualified flaw to "fix" |
| **Ownership/operability** | References correlation IDs, `logAudit`, specific runbooks, test layers by name | Vague appeals to "monitoring" and "testing" without specifics |
| **Systems thinking** | Traces a request or a bug across multiple files/layers unprompted | Answers stay confined to a single file or function |

## Hands-on exercise

1. Pick five questions above spanning at least three sections, and answer them in writing, citing an actual file path or function name in every answer.
2. Give this document to someone else who's read the same set of academy chapters and have them interview you cold on three random questions — time-box each answer to 90 seconds.
3. Write one new question of your own, in the same style, for a section of the codebase this bank doesn't yet cover (e.g. warranty/replacement lifecycle, rewards computation) — include what a strong answer would mention.

## Related

- [Learning Index](/learning)
- [Tech Debt Register](/scaling/tech-debt-register)
- [Quiz: Architecture](/quizzes/quiz-architecture)
- [Quiz: Security](/quizzes/quiz-security)
- [Threat Model](/security/threat-model)
