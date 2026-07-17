---
sidebar_label: "network.ts"
title: "File src/platforms/mobile/offline/network.ts"
description: "Deep walkthrough of src/platforms/mobile/offline/network.ts in DG-ERP / Dhandho"
---

# File walkthrough: `src/platforms/mobile/offline/network.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/platforms/mobile/offline/network.ts` is part of Dhandho (DG-ERP). Approximate size: **70 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `@capacitor/network`
- `../../shared/apiBase`
- `../../../lib/session`
- `./queue`

## Exports and symbols

**Exported names:** `ConnectionState`, `getConnectionState`, `subscribeConnection`, `initNetworkMonitor`

**Classes:** _none_

## Functions (6 detected)

### Function: emit

```ts
emit()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/network.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `emit` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: getConnectionState

```ts
getConnectionState()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/network.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `getConnectionState` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: subscribeConnection

```ts
subscribeConnection(fn: Listener)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/network.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `subscribeConnection` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: tryFlush

```ts
tryFlush()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/network.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `tryFlush` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: initNetworkMonitor

```ts
initNetworkMonitor()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/network.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `initNetworkMonitor` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: sync

```ts
sync(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/network.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `sync` before deleting. |
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
rg -n "network" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **70**. Large view/route files are refactor candidates.

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

1. Open `src/platforms/mobile/offline/network.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__platforms__mobile__offline__network`*
