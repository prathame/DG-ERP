---
sidebar_label: "queue.ts"
title: "File src/platforms/mobile/offline/queue.ts"
description: "Deep walkthrough of src/platforms/mobile/offline/queue.ts in DG-ERP / Dhandho"
---

# File walkthrough: `src/platforms/mobile/offline/queue.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/platforms/mobile/offline/queue.ts` is part of Dhandho (DG-ERP). Approximate size: **116 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

_No static imports detected._

## Exports and symbols

**Exported names:** `OfflineMutation`, `getOfflineQueue`, `offlineQueueCount`, `enqueueOfflineMutation`, `removeOfflineMutation`, `clearOfflineQueue`, `flushOfflineQueue`

**Classes:** _none_

## Functions (10 detected)

### Function: sanitizeHeaders

```ts
sanitizeHeaders(headers?: Record<string, string>)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/queue.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `sanitizeHeaders` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: read

```ts
read()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/queue.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `read` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: write

```ts
write(items: OfflineMutation[])
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/queue.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `write` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: getOfflineQueue

```ts
getOfflineQueue()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/queue.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `getOfflineQueue` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: offlineQueueCount

```ts
offlineQueueCount()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/queue.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `offlineQueueCount` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: dedupeKey

```ts
dedupeKey(m: Pick<OfflineMutation, 'method' | 'path' | 'body'>)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/queue.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `dedupeKey` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: enqueueOfflineMutation

```ts
enqueueOfflineMutation(m: Omit<OfflineMutation, 'id' | 'createdAt'>)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/queue.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `enqueueOfflineMutation` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: removeOfflineMutation

```ts
removeOfflineMutation(id: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/queue.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `removeOfflineMutation` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: clearOfflineQueue

```ts
clearOfflineQueue()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/queue.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `clearOfflineQueue` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: flushOfflineQueue

```ts
flushOfflineQueue(fetchFn: typeof fetch = fetch,)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/queue.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `flushOfflineQueue` before deleting. |
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
rg -n "queue" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **116**. Large view/route files are refactor candidates.

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

1. Open `src/platforms/mobile/offline/queue.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__platforms__mobile__offline__queue`*
