---
sidebar_label: "price-resolve.ts"
title: "File server/utils/price-resolve.ts"
description: "Deep walkthrough of server/utils/price-resolve.ts in DG-ERP / Dhandho"
---

# File walkthrough: `server/utils/price-resolve.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`server/utils/price-resolve.ts` is part of Dhandho (DG-ERP). Approximate size: **72 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `../pg-db`

## Exports and symbols

**Exported names:** `ResolvedPrice`, `resolvePrice`, `hasExplicitUnitPrice`, `unitPricesAfterDiscount`

**Classes:** _none_

## Functions (5 detected)

### Function: resolvePrice

```ts
resolvePrice(tenantId: string,
  productId: string,
  vendorId: string | null | undefined,
  quantity: number,)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/price-resolve.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `resolvePrice` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: hasExplicitUnitPrice

```ts
hasExplicitUnitPrice(value: unknown)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/price-resolve.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `hasExplicitUnitPrice` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: unitPricesAfterDiscount

```ts
unitPricesAfterDiscount(opts: {
  basePrice: number;
  discountPercent: number;
  withGst: boolean;
  priceIncludesGst: boolean;
  gstRate: number;
})
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/price-resolve.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `unitPricesAfterDiscount` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: rule

```ts
rule(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/price-resolve.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `rule` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: product

```ts
product(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/utils/price-resolve.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `product` before deleting. |
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
rg -n "price-resolve" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **72**. Large view/route files are refactor candidates.

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

1. Open `server/utils/price-resolve.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `server__utils__price-resolve`*
