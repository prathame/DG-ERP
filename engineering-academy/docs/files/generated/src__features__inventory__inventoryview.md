---
sidebar_label: "InventoryView.tsx"
title: "File src/features/inventory/InventoryView.tsx"
description: "Deep walkthrough of src/features/inventory/InventoryView.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/features/inventory/InventoryView.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/features/inventory/InventoryView.tsx` is part of Dhandho (DG-ERP). Approximate size: **600 lines**.

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
- `../../components/ui/CsvImport`
- `../../components/ui/BarcodeLabelPrinter`
- `../../hooks/useDebounce`
- `../../lib/useEscapeKey`
- `../../lib/session`
- `../../lib/hsnRates`
- `../../components/ui/ColumnPicker`
- `../../hooks/useConfirm`

## Exports and symbols

**Exported names:** `InventoryView`

**Classes:** _none_

## Functions (10 detected)

### Function: InventoryView

```ts
InventoryView({ accessLevel = 'full' }: { accessLevel?: 'hidden' | 'view' | 'print' | 'full' } = {})
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/inventory/InventoryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `InventoryView` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: barcodeSystemEnabled

```ts
barcodeSystemEnabled(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/inventory/InventoryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `barcodeSystemEnabled` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: u

```ts
u(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/inventory/InventoryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `u` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: inventoryTrackingEnabled

```ts
inventoryTrackingEnabled(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/inventory/InventoryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `inventoryTrackingEnabled` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: warrantyVisible

```ts
warrantyVisible(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/inventory/InventoryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `warrantyVisible` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: toggleSort

```ts
toggleSort(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/inventory/InventoryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `toggleSort` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleDelete

```ts
handleDelete(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/inventory/InventoryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleDelete` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: isLowStock

```ts
isLowStock(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/inventory/InventoryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `isLowStock` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: code

```ts
code(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/inventory/InventoryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `code` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: hasPack

```ts
hasPack(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/inventory/InventoryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `hasPack` before deleting. |
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
rg -n "InventoryView" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **600**. Large view/route files are refactor candidates.

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

1. Open `src/features/inventory/InventoryView.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__features__inventory__inventoryview`*
