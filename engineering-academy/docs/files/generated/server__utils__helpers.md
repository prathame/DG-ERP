---
sidebar_label: "helpers.ts"
title: "File server/utils/helpers.ts"
description: "Deep walkthrough of server/utils/helpers.ts in DG-ERP / Dhandho"
---

# File walkthrough: `server/utils/helpers.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`server/utils/helpers.ts` is part of Dhandho (DG-ERP). Approximate size: **159 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `bcrypt`
- `crypto`
- `pg`

## Exports and symbols

**Exported names:** `uid`, `isValidPhone`, `isValidEmail`, `isValidGstin`, `DISTRIBUTION_BILL_UNIT_SQL`, `DISTRIBUTION_TAXABLE_SQL`, `DISTRIBUTION_TAX_SQL`, `PURCHASE_TAXABLE_SQL`, `PURCHASE_TAX_SQL`, `splitGst`, `placeOfSupplyLabel`, `gstFromExclusive`, `parsePagination`, `applyDateFilter`, `logAudit`, `hashPassword`, `mapProduct`

**Classes:** _none_

## Functions (12 detected)

### Function: uid

```ts
uid(prefix: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `uid` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: isValidPhone

```ts
isValidPhone(phone: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `isValidPhone` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: isValidEmail

```ts
isValidEmail(email: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `isValidEmail` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: isValidGstin

```ts
isValidGstin(gstin: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `isValidGstin` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: splitGst

```ts
splitGst(taxAmt: number,
  sellerGstin?: string | null,
  buyerGstin?: string | null,)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `splitGst` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: placeOfSupplyLabel

```ts
placeOfSupplyLabel(buyerGstin?: string | null, sellerGstin?: string | null)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `placeOfSupplyLabel` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: gstFromExclusive

```ts
gstFromExclusive(taxable: number, ratePercent: number)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `gstFromExclusive` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: parsePagination

```ts
parsePagination(query: Record<string, unknown>)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `parsePagination` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: applyDateFilter

```ts
applyDateFilter(query: Record<string, unknown>, dateColumn: string, params: unknown[], paramOffset?: number)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `applyDateFilter` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: logAudit

```ts
logAudit(pool: Pool, tenantId: string, action: string, entityType: string, entityId?: string, details?: string, userId?: string, userName?: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `logAudit` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: hashPassword

```ts
hashPassword(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `hashPassword` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: mapProduct

```ts
mapProduct(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/helpers.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `mapProduct` before deleting. |
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
rg -n "helpers" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **159**. Large view/route files are refactor candidates.

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

1. Open `server/utils/helpers.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `server__utils__helpers`*
