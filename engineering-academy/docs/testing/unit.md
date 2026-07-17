---
sidebar_label: Unit Testing
title: Unit Testing
description: What DG-ERP's unit tests cover, why they're limited to pure/isolated logic, and how to write a good one.
---

# Unit Testing

`tests/unit/*.test.ts` covers logic that can be tested **without** a database connection or an HTTP request — pure functions, or functions with tightly controlled, mockable dependencies.

## What's actually in `tests/unit/` today

| File | Tests | Why it's a unit test and not an API test |
|---|---|---|
| `pii.test.ts` | `redactPii`, `redactContext`, `safeErrorMessage` (`server/utils/pii.ts`) | Pure string-in, string-out regex logic — zero I/O |
| `pagination.test.ts` | `parsePagination` (`server/utils/pagination.ts`) | Pure math/validation on query params — no DB needed to test "does `limit=9999` get clamped" |
| `authCache.test.ts` | `getCachedAuth`/`setCachedAuth` (`server/utils/authCache.ts`) | An in-memory `Map`-backed cache — testable by calling set then get, no real users table required |
| `env.test.ts` | `assertCriticalEnv` (`server/utils/env.ts`) | Tests against a *fake* `process.env`-shaped object passed as a parameter (`assertCriticalEnv(fakeEnv)`), not the real process env — this is exactly why the function accepts an optional `env` parameter instead of always reading `process.env` directly |
| `impersonation-token.test.ts` | Super-admin impersonation token shape/expiry logic | JWT signing/verification logic, mockable without a live server |
| `mobile-onboarding.test.ts` | Invite code parsing/validation logic | String/format validation, no network |
| `offline-mobile.test.ts` | `src/platforms/mobile/offline/{queue,cache}.ts` logic | `localStorage`-backed, but `localStorage` itself is mockable/available in the Vitest `node` environment via a small shim — no real device needed |

## Why `assertCriticalEnv` accepts a parameter — a lesson in testable design

```ts
// server/utils/env.ts
export function assertCriticalEnv(env: NodeJS.ProcessEnv = process.env): void {
```

This one signature choice is the difference between "testable" and "not testable" for this function. If it read `process.env` directly with no override, testing "what happens when `JWT_SECRET` is missing" would require mutating the *actual* process environment mid-test-run — fragile, order-dependent, and risky (a test that forgets to restore `process.env.JWT_SECRET` afterward silently breaks every subsequent test in the same process). By accepting an injectable `env` object defaulting to `process.env`, tests pass a fresh, disposable fake object per test case:

```ts
// tests/unit/env.test.ts (pattern)
it('fails without DATABASE_URL', () => {
  expect(() => assertCriticalEnv({ JWT_SECRET: 'x'.repeat(32) } as NodeJS.ProcessEnv))
    .toThrow(/DATABASE_URL/);
});
```

**Generalize this pattern**: any time you're about to write a function that reads a global (`process.env`, a singleton cache, `Date.now()`), ask whether accepting it as an optional parameter (defaulting to the real global) would make it unit-testable without changing any call site's behavior in production.

## What does NOT belong in `tests/unit/`

- Anything that queries `pool` (even read-only) — that's an [API integration test](./api-integration.md), because a query's correctness (does it actually scope to `tenant_id`? does the SQL even parse against the real schema?) can only be verified against a real Postgres instance, not a mock.
- Anything that needs a full Express app/middleware chain — also an API integration test.
- Full user workflows spanning multiple endpoints — that's [E2E](./e2e.md) territory.

## Anatomy of a good unit test here

```ts
import { describe, it, expect } from 'vitest';
import { redactPii } from '../../server/utils/pii';

describe('redactPii', () => {
  it('redacts Indian mobile numbers', () => {
    expect(redactPii('call 9876543210 now')).toBe('call [REDACTED_PHONE] now');
  });

  it('redacts emails', () => {
    expect(redactPii('contact a@b.com')).toBe('contact [REDACTED_EMAIL]');
  });

  it('does not redact non-PII numbers', () => {
    // A 6-digit pincode should survive — it's not a 10-digit mobile number
    expect(redactPii('pincode 380001')).toBe('pincode 380001');
  });

  it('handles nested context objects', () => {
    // redactContext should recurse, not just redact top-level strings
  });
});
```

Notice the third test — testing the *boundary* of a regex (what should NOT match) is as valuable as testing what should. PII redaction regexes are exactly the kind of code where an overly greedy pattern silently corrupts legitimate data (imagine a product SKU or HSN code accidentally matching the phone regex).

## Running unit tests only

```bash
npx vitest run tests/unit/
npx vitest run tests/unit/pii.test.ts    # a single file
npx vitest --ui tests/unit/               # interactive watch mode
```

## Related pages

- [Testing Overview](./overview.md)
- [API Integration Testing](./api-integration.md)
- [How to Add Tests](./how-to-add-tests.md)
- [File Walkthrough: server/utils](/files/server/utils)
