---
sidebar_label: "DistributionView.tsx"
title: "File src/features/distribution/DistributionView.tsx"
description: "Deep walkthrough of src/features/distribution/DistributionView.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/features/distribution/DistributionView.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/features/distribution/DistributionView.tsx` is part of Dhandho (DG-ERP). Approximate size: **2630 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `react`
- `motion/react`
- `lucide-react`
- `../../lib/utils`
- `../../api`
- `../../types`
- `../../components/ui`
- `../../lib/billTemplates`
- `../../lib/useEscapeKey`
- `../../lib/session`
- `../../components/ui/SearchSelect`
- `../../hooks/useConfirm`

## Exports and symbols

**Exported names:** `DistributionView`

**Classes:** _none_

## Functions (24 detected)

### Function: buildGstPrintOptions

```ts
buildGstPrintOptions(bill: import('../../api')
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `buildGstPrintOptions` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: EInvoiceButtons

```ts
EInvoiceButtons({
  batchId,
  initialIrn,
  initialQr,
  initialEwb,
}: {
  batchId: string;
  initialIrn?: string | null;
  initialQr?: string | null;
  initialEwb?: string | null;
})
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `EInvoiceButtons` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: DistributionView

```ts
DistributionView({
  user,
  accessLevel = 'full',
  businessType = 'manufacturer',
}: {
  user: { id: string; role?: string; vendorId?: string } | null;
  accessLevel?: 'hidden' | 'view' | 'print' | 'full';
  businessType?: string;
})
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `DistributionView` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: bs

```ts
bs(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `bs` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: generateIrn

```ts
generateIrn(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `generateIrn` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: generateEwb

```ts
generateEwb(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `generateEwb` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: challanOptions

```ts
challanOptions(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `challanOptions` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: load

```ts
load(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `load` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: addDistRow

```ts
addDistRow(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `addDistRow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: removeDistRow

```ts
removeDistRow(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `removeDistRow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: updateDistRow

```ts
updateDistRow(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `updateDistRow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: resolveDistRowPrice

```ts
resolveDistRowPrice(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `resolveDistRowPrice` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: token

```ts
token(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `token` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: defaultGstRate

```ts
defaultGstRate(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `defaultGstRate` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleDistributeAll

```ts
handleDistributeAll(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleDistributeAll` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: confirmDeleteBatch

```ts
confirmDeleteBatch(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `confirmDeleteBatch` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleDeleteBatch

```ts
handleDeleteBatch(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleDeleteBatch` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: openEdit

```ts
openEdit(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `openEdit` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: updateEditRow

```ts
updateEditRow(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `updateEditRow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: billParams

```ts
billParams(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `billParams` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: productList

```ts
productList(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `productList` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: ds

```ts
ds(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `ds` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: lines

```ts
lines(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `lines` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: makeSplitBill

```ts
makeSplitBill(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/distribution/DistributionView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `makeSplitBill` before deleting. |
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
rg -n "DistributionView" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **2630**. Large view/route files are refactor candidates.

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

1. Open `src/features/distribution/DistributionView.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__features__distribution__distributionview`*
