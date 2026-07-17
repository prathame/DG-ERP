---
sidebar_label: "SalesEntryView.tsx"
title: "File src/features/sales/SalesEntryView.tsx"
description: "Deep walkthrough of src/features/sales/SalesEntryView.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/features/sales/SalesEntryView.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/features/sales/SalesEntryView.tsx` is part of Dhandho (DG-ERP). Approximate size: **262 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `react`
- `motion/react`
- `lucide-react`
- `../../lib/utils`
- `../../api`
- `../../components/ui`
- `../../lib/billTemplates`
- `../../components/ui/BarcodeScanner`
- `../../lib/session`

## Exports and symbols

**Exported names:** `SalesEntryView`

**Classes:** _none_

## Functions (8 detected)

### Function: SalesEntryView

```ts
SalesEntryView({ user }: { user: { id: string; role?: string; vendorId?: string; autoWhatsapp?: boolean } | null })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/sales/SalesEntryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `SalesEntryView` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: barcodeSystemEnabled

```ts
barcodeSystemEnabled(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/sales/SalesEntryView.tsx`. Open the source and read the body. |
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
| Purpose | Symbol in `src/features/sales/SalesEntryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `u` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: loadSales

```ts
loadSales(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/sales/SalesEntryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `loadSales` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleValidate

```ts
handleValidate(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/sales/SalesEntryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleValidate` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: code

```ts
code(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/sales/SalesEntryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `code` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleSale

```ts
handleSale(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/sales/SalesEntryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleSale` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: bs

```ts
bs(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/sales/SalesEntryView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `bs` before deleting. |
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
rg -n "SalesEntryView" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **262**. Large view/route files are refactor candidates.

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

1. Open `src/features/sales/SalesEntryView.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__features__sales__salesentryview`*
