---
sidebar_label: "barcode.ts"
title: "File server/utils/barcode.ts"
description: "Deep walkthrough of server/utils/barcode.ts in DG-ERP / Dhandho"
---

# File walkthrough: `server/utils/barcode.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`server/utils/barcode.ts` is part of Dhandho (DG-ERP). Approximate size: **73 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `pg`

## Exports and symbols

**Exported names:** `barcodeExists`, `expandBarcodeRange`, `getMaxBarcodeNumber`, `generateBarcodesFromPrefix`

**Classes:** _none_

## Functions (5 detected)

### Function: barcodeExists

```ts
barcodeExists(pool: Pool, tenantId: string, barcode: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/barcode.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `barcodeExists` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: expandBarcodeRange

```ts
expandBarcodeRange(start: string, end: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/barcode.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `expandBarcodeRange` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: getMaxBarcodeNumber

```ts
getMaxBarcodeNumber(pool: Pool, tenantId: string, prefix: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/barcode.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `getMaxBarcodeNumber` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: generateBarcodesFromPrefix

```ts
generateBarcodesFromPrefix(pool: Pool, tenantId: string, prefix: string, quantity: number, padLength?: number)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/barcode.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `generateBarcodesFromPrefix` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: startNum

```ts
startNum(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/barcode.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `startNum` before deleting. |
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
rg -n "barcode" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **73**. Large view/route files are refactor candidates.

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

1. Open `server/utils/barcode.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `server__utils__barcode`*
