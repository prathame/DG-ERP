---
sidebar_label: Coverage Gates
title: Coverage Gates — 90%/75% on Scoped Modules
description: Why DG-ERP enforces strict coverage thresholds on a small, deliberately chosen slice of the codebase instead of the whole repo.
---

# Coverage Gates

`vitest.config.ts` enforces coverage thresholds that will **fail the test run itself** (not a separate CI step — `npx vitest run --coverage` exits non-zero on its own if thresholds aren't met) if unmet. The critical detail nearly everyone misses on first read: **these thresholds apply to a narrow, explicit `include` list, not the whole codebase.**

## The actual config

```ts
// vitest.config.ts
coverage: {
  provider: 'v8',
  include: [
    'server/utils/**/*.ts',
    'server/services/**/*.ts',
    'server/routes/mobile.ts',
    'src/platforms/mobile/offline/cache.ts',
    'src/platforms/mobile/offline/queue.ts',
    'src/platforms/mobile/online/companyStorage.ts',
  ],
  exclude: ['**/*.test.ts', '**/*.js'],
  thresholds: {
    statements: 90,
    branches: 75,
    functions: 90,
    lines: 90,
  },
  reporter: ['text', 'json-summary'],
},
```

## Why 90% for statements/functions/lines but only 75% for branches

Branch coverage (every possible `if`/`else`, ternary, `&&`/`||` short-circuit path) is structurally the hardest metric to fully satisfy — some branches exist purely as defensive guards for conditions that are difficult or undesirable to actually trigger in a test (e.g. a `catch` block for a database connection dropping mid-query, or a fallback branch for malformed data that "shouldn't happen" but is handled anyway per this codebase's defensive style). Setting branch coverage to 75% instead of 90% is an honest acknowledgment that chasing the last 15-25% of branch coverage on defensive/error-handling code often means writing brittle, contrived tests that assert very little real value — a classic coverage-metric trap. Statement/function/line coverage at 90% is a more achievable and more meaningful bar for the code that's actually included in scope.

## Why only these specific files/directories, and not `server/routes/*.ts` broadly

This is the part worth really understanding, because it's counterintuitive at first: **most of `server/routes/*.ts` — the largest, most business-critical files in the backend — are explicitly NOT in the coverage-threshold `include` list.**

This does **not** mean routes are untested — recall [API Integration Testing](./api-integration): `tests/api/*.test.ts` covers nearly every route file with real Supertest requests. It means route-file coverage is **not gated by a numeric threshold that fails the build**. Why:

1. **Route files are large and heterogeneous** (validation branches, GST math, PDF generation triggers, audit logging, WhatsApp message formatting) — a single numeric threshold across a 400-line route file tends to either be trivially satisfiable (happy-path tests hit most lines) while missing important edge cases, or to force writing low-value tests just to hit an arbitrary branch count.
2. **`server/utils/**` and `server/services/**` are exactly the opposite** — small, focused, pure-ish modules (`pii.ts`, `pagination.ts`, `helpers.ts`, `secret-crypto.ts`, `nic-api.ts`) where every branch genuinely matters and 90/75% is both achievable and meaningful. A bug in `redactPii`'s regex, or in `splitGst`'s tax-split math (in `helpers.ts`), has an outsized, hard-to-notice blast radius precisely because it's used everywhere and rarely re-verified by eye.
3. **`server/routes/mobile.ts` earns an explicit exception to the "routes aren't scoped" rule** — mobile onboarding (invite redemption, heartbeat, device registry) is public-path-heavy (see [Mobile deployment](/deployment/mobile)) and security-sensitive in a way that benefits from strict, numerically-enforced coverage more than most route files do.
4. **The three specific `src/platforms/mobile/*` files** (`cache.ts`, `queue.ts`, `companyStorage.ts`) are the offline-mutation-queue logic — exactly the kind of edge-case-heavy, easy-to-subtly-break logic (see [Lab: Offline Queue](/labs/lab-offline-queue)) that benefits from a hard coverage floor, because a regression here silently drops user data rather than throwing a visible error.

**The takeaway:** coverage scope here is a curated list of "code where a coverage regression is a real, likely-costly bug," not a blanket policy. When you add a new file, ask whether it belongs in this list by the same criteria — small, focused, high-blast-radius-if-wrong, and reasonably testable without heroics — rather than assuming "more coverage everywhere" is automatically better.

## Where thresholds are enforced in CI

| Workflow | Step |
|---|---|
| `pr-check.yml` | `test` job: `npx vitest run --coverage` |
| `build.yml` | `test` job: same command, same config, same thresholds |
| `release.yml` | Does **not** run the coverage-gated Vitest suite directly — it runs the Python E2E suite instead (see [E2E Testing](./e2e)) |

Both PR-gating workflows run the exact same command against the exact same config — there's no separate "stricter for release" coverage tier; the gate is uniform.

## Running coverage locally

```bash
npm run test:coverage        # vitest run --coverage
```

Output includes a text summary in the terminal plus a `json-summary` reporter output (useful for tooling/badges, though nothing in this repo currently consumes that JSON file automatically — another small, honest gap: a coverage badge or trend chart could read it but doesn't yet).

If your PR touches a file in the `include` list and coverage drops below threshold, the **entire Vitest run fails** — not just a warning. Read the text reporter's per-file breakdown to find exactly which lines/branches you introduced without a covering test.

## What to do if you're stuck under threshold

1. **First, check if you actually need a test for the specific uncovered branch**, or if it's genuinely unreachable/defensive dead code — if the latter, consider whether the branch should even exist (see [How to Add Tests](./how-to-add-tests)).
2. **Write the missing test** — this is almost always the right answer for files in the `include` scope; they were chosen specifically because their branches matter.
3. **Do not casually add a new file to `exclude`** to dodge the threshold — that defeats the purpose of the curated scope above. If a file genuinely doesn't belong in coverage scope, that's a real conversation to have with the team, documented, not a solo workaround.

## Related pages

- [Testing Overview](./overview.md)
- [API Integration Testing](./api-integration.md)
- [How to Add Tests](./how-to-add-tests.md)
- [CI/CD](/deployment/cicd)
- [Scaling → Tech Debt Register](/scaling/tech-debt-register)
