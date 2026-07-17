---
sidebar_label: "authCache.ts"
title: "File server/utils/authCache.ts"
description: "Deep walkthrough of server/utils/authCache.ts in DG-ERP / Dhandho"
---

# File walkthrough: `server/utils/authCache.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`server/utils/authCache.ts` is part of Dhandho (DG-ERP). Approximate size: **65 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

_No static imports detected._

## Exports and symbols

**Exported names:** `CachedAuthRow`, `getCachedAuth`, `setCachedAuth`, `invalidateAuthCache`, `clearAuthCache`

**Classes:** _none_

## Functions (5 detected)

### Function: cacheKey

```ts
cacheKey(userId: string, tenantId: string, iat: number | undefined)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/authCache.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `cacheKey` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: getCachedAuth

```ts
getCachedAuth(userId: string, tenantId: string, iat: number | undefined)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/authCache.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `getCachedAuth` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: setCachedAuth

```ts
setCachedAuth(userId: string, tenantId: string, iat: number | undefined, row: CachedAuthRow)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/authCache.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `setCachedAuth` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: invalidateAuthCache

```ts
invalidateAuthCache(userId: string, tenantId: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/authCache.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `invalidateAuthCache` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: clearAuthCache

```ts
clearAuthCache()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/authCache.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `clearAuthCache` before deleting. |
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
rg -n "authCache" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **65**. Large view/route files are refactor candidates.

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

1. Open `server/utils/authCache.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `server__utils__authcache`*
