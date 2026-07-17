---
sidebar_label: "OnlineStatus.tsx"
title: "File src/platforms/desktop/offline/OnlineStatus.tsx"
description: "Deep walkthrough of src/platforms/desktop/offline/OnlineStatus.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/platforms/desktop/offline/OnlineStatus.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/platforms/desktop/offline/OnlineStatus.tsx` is part of Dhandho (DG-ERP). Approximate size: **132 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `react`
- `lucide-react`
- `../../../lib/utils`

## Exports and symbols

**Exported names:** `OnlineStatus`

**Classes:** _none_

## Functions (5 detected)

### Function: formatSync

```ts
formatSync(iso: string | null)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/desktop/offline/OnlineStatus.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `formatSync` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: OnlineStatus

```ts
OnlineStatus({ collapsed }: { collapsed: boolean })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/desktop/offline/OnlineStatus.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `OnlineStatus` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: onOnline

```ts
onOnline(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/desktop/offline/OnlineStatus.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `onOnline` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: onOffline

```ts
onOffline(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/desktop/offline/OnlineStatus.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `onOffline` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: syncNow

```ts
syncNow(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/desktop/offline/OnlineStatus.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `syncNow` before deleting. |
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
rg -n "OnlineStatus" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **132**. Large view/route files are refactor candidates.

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

1. Open `src/platforms/desktop/offline/OnlineStatus.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__platforms__desktop__offline__onlinestatus`*
