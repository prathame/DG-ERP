---
sidebar_label: "OfflineBanner.tsx"
title: "File src/platforms/mobile/offline/OfflineBanner.tsx"
description: "Deep walkthrough of src/platforms/mobile/offline/OfflineBanner.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/platforms/mobile/offline/OfflineBanner.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/platforms/mobile/offline/OfflineBanner.tsx` is part of Dhandho (DG-ERP). Approximate size: **79 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `react`
- `lucide-react`
- `./network`
- `./queue`

## Exports and symbols

**Exported names:** `OfflineBanner`

**Classes:** _none_

## Functions (5 detected)

### Function: OfflineBanner

```ts
OfflineBanner()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/OfflineBanner.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `OfflineBanner` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: refreshQueue

```ts
refreshQueue(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/OfflineBanner.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `refreshQueue` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: onForce

```ts
onForce(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/OfflineBanner.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `onForce` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: d

```ts
d(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/OfflineBanner.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `d` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: onAvail

```ts
onAvail(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/platforms/mobile/offline/OfflineBanner.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `onAvail` before deleting. |
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
rg -n "OfflineBanner" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **79**. Large view/route files are refactor candidates.

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

1. Open `src/platforms/mobile/offline/OfflineBanner.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__platforms__mobile__offline__offlinebanner`*
