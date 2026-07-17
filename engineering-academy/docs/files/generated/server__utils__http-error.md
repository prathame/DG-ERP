---
sidebar_label: "http-error.ts"
title: "File server/utils/http-error.ts"
description: "Deep walkthrough of server/utils/http-error.ts in DG-ERP / Dhandho"
---

# File walkthrough: `server/utils/http-error.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`server/utils/http-error.ts` is part of Dhandho (DG-ERP). Approximate size: **135 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `express`
- `./logger`
- `./pii`

## Exports and symbols

**Exported names:** `ApiErrorOptions`, `handleApiError`, `logAuthEvent`, `logSlowOperation`

**Classes:** _none_

## Functions (5 detected)

### Function: extractRequestMeta

```ts
extractRequestMeta(req: Request)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/http-error.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `extractRequestMeta` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleApiError

```ts
handleApiError(req: Request,
  res: Response,
  err: unknown,
  message = 'Request failed',
  options: ApiErrorOptions = {},)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/http-error.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleApiError` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: logAuthEvent

```ts
logAuthEvent(event: string,
  req: Request,
  context?: Record<string, unknown>,
  level: 'info' | 'warn' | 'error' = 'warn',)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/http-error.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `logAuthEvent` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: logSlowOperation

```ts
logSlowOperation(operation: string,
  durationMs: number,
  thresholdMs: number,
  context?: Record<string, unknown>,)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/http-error.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `logSlowOperation` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: correlationId

```ts
correlationId(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/http-error.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `correlationId` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |


## Execution flow

1. Module loaded by Node (`tsx`) or Vite.
2. Top-level imports initialize dependencies.
3. Callers import exported symbols.

## Call hierarchy

```bash
# From DG-ERP repo root
rg -n "http-error" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **135**. Large view/route files are refactor candidates.

## Security impact

Review for: tenant scoping, IDOR, secrets in logs, XSS, path traversal on backups.

## Scalability

In-memory caches (authCache, GET Map) do **not** share across instances.

## Refactoring opportunities

- Extract pure helpers for unit tests
- Split modules larger than ~800 lines
- Deduplicate GST math via shared SQL fragments

## Common mistakes

- Forgetting `tenant_id` in a new query
- Trusting JWT role claims without live DB hydration
- Putting secrets in `VITE_*` env vars
- Returning raw DB errors to clients

## Alternative implementations

| Approach | Trade-off |
| --- | --- |
| Keep as-is | Fast to ship; harder to test |
| Split module | Clearer ownership; more files |
| Shared package | Reuse across surfaces; packaging cost |

## Related academy pages

- [File index](/files/)
- [Generated index](/files/generated/)
- [Architecture](/architecture/system-overview)
- [Security threat model](/security/threat-model)

## Hands-on

1. Open `server/utils/http-error.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `server__utils__http-error`*
