---
sidebar_label: "InvoicesView.tsx"
title: "File src/features/invoices/InvoicesView.tsx"
description: "Deep walkthrough of src/features/invoices/InvoicesView.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/features/invoices/InvoicesView.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/features/invoices/InvoicesView.tsx` is part of Dhandho (DG-ERP). Approximate size: **1145 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `react`
- `motion/react`
- `lucide-react`
- `../../lib/utils`
- `../../api`
- `../../components/ui`
- `../../lib/useEscapeKey`
- `../../lib/hsnRates`
- `../../lib/session`
- `../../types`

## Exports and symbols

**Exported names:** `InvoicesView`, `InvoicePartyPrefill`, `CreateInvoiceModal`

**Classes:** _none_

## Functions (15 detected)

### Function: esc

```ts
esc(t: unknown)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `esc` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: resolveCatalogPrice

```ts
resolveCatalogPrice(product: Product, rules: PriceRule[], vendorId: string | null, qty: number)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `resolveCatalogPrice` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: InvoicesView

```ts
InvoicesView()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `InvoicesView` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: CreateInvoiceModal

```ts
CreateInvoiceModal({
  onClose,
  onCreated,
  initialParty,
}: {
  onClose: ()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `CreateInvoiceModal` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: emptyRow

```ts
emptyRow(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `emptyRow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: load

```ts
load(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `load` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleDelete

```ts
handleDelete(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleDelete` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleStatus

```ts
handleStatus(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleStatus` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: statusBadge

```ts
statusBadge(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `statusBadge` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: printInvoice

```ts
printInvoice(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `printInvoice` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: selectParty

```ts
selectParty(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `selectParty` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: applyCatalogItem

```ts
applyCatalogItem(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `applyCatalogItem` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: updateRowQty

```ts
updateRowQty(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `updateRowQty` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: taxable

```ts
taxable(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `taxable` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleSubmit

```ts
handleSubmit(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/invoices/InvoicesView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleSubmit` before deleting. |
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
rg -n "InvoicesView" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **1145**. Large view/route files are refactor candidates.

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

1. Open `src/features/invoices/InvoicesView.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__features__invoices__invoicesview`*
