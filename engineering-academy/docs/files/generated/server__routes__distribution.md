---
sidebar_label: "distribution.ts"
title: "File server/routes/distribution.ts"
description: "Deep walkthrough of server/routes/distribution.ts in DG-ERP / Dhandho"
---

# File walkthrough: `server/routes/distribution.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`server/routes/distribution.ts` is part of Dhandho (DG-ERP). Approximate size: **1523 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `express`
- `../middleware/auth`
- `../pg-db`
- `../utils/helpers`

## Exports and symbols

**Exported names:** _none detected_

**Classes:** _none_

## Functions (29 detected)

### Function: totalDistributed

```ts
totalDistributed(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `totalDistributed` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: vendorStats

```ts
vendorStats(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `vendorStats` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: rows

```ts
rows(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `rows` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: payRows

```ts
payRows(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `payRows` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: product

```ts
product(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `product` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: vendorName

```ts
vendorName(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `vendorName` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: invRows

```ts
invRows(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `invRows` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: tenantType

```ts
tenantType(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `tenantType` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: firstRow

```ts
firstRow(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `firstRow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: units

```ts
units(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `units` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: company

```ts
company(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `company` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: billSettingsRow

```ts
billSettingsRow(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `billSettingsRow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: allRows

```ts
allRows(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `allRows` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: vendorRow

```ts
vendorRow(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `vendorRow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: applyPricing

```ts
applyPricing(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `applyPricing` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: remaining

```ts
remaining(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `remaining` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: batch

```ts
batch(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `batch` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: ownerCheck

```ts
ownerCheck(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `ownerCheck` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: jwtUser

```ts
jwtUser(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `jwtUser` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: items

```ts
items(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `items` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: vendor

```ts
vendor(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `vendor` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: tenant

```ts
tenant(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `tenant` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: user

```ts
user(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `user` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: sellerGstin

```ts
sellerGstin(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `sellerGstin` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: buyerGstin

```ts
buyerGstin(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `buyerGstin` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: stateFromGstin

```ts
stateFromGstin(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `stateFromGstin` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: pinFromAddress

```ts
pinFromAddress(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `pinFromAddress` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: m

```ts
m(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `m` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: shipTo

```ts
shipTo(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/distribution.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `shipTo` before deleting. |
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
rg -n "distribution" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **1523**. Large view/route files are refactor candidates.

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

1. Open `server/routes/distribution.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `server__routes__distribution`*
