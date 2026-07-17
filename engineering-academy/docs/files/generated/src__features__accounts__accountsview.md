---
sidebar_label: "AccountsView.tsx"
title: "File src/features/accounts/AccountsView.tsx"
description: "Deep walkthrough of src/features/accounts/AccountsView.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/features/accounts/AccountsView.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/features/accounts/AccountsView.tsx` is part of Dhandho (DG-ERP). Approximate size: **761 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `react`
- `motion/react`
- `lucide-react`
- `../../lib/utils`
- `../../lib/businessTypeConfig`
- `../../components/ui`
- `../../api`
- `../../lib/billTemplates`

## Exports and symbols

**Exported names:** `AccountsView`

**Classes:** _none_

## Functions (28 detected)

### Function: fmtCurrency

```ts
fmtCurrency(n: number)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `fmtCurrency` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: AccountsView

```ts
AccountsView({ accessLevel = 'full' }: { accessLevel?: 'hidden' | 'view' | 'print' | 'full' } = {})
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `AccountsView` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: StatCard

```ts
StatCard({ label, value, color, sub }: { label: string; value: string; color: string; sub?: string })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `StatCard` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: ProfitLoss

```ts
ProfitLoss({ data, ds, cfg }: { data: Record<string, unknown>; ds: boolean; cfg: ReturnType<typeof useBusinessConfig> })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `ProfitLoss` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: BalanceSheet

```ts
BalanceSheet({ data, ds }: { data: Record<string, unknown>; ds: boolean })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `BalanceSheet` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: CashFlow

```ts
CashFlow({ data, ds }: { data: Record<string, unknown>; ds: boolean })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `CashFlow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: Ledger

```ts
Ledger({ data }: { data: Record<string, unknown> })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `Ledger` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: DayBook

```ts
DayBook({ data, ds }: { data: Record<string, unknown>; ds: boolean })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `DayBook` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: NotesView

```ts
NotesView({ data, onRefresh }: { data: Record<string, unknown>; onRefresh: ()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `NotesView` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: ReportTable

```ts
ReportTable({ tab, data, ds }: { tab: string; data: Record<string, unknown>; ds: boolean })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `ReportTable` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: Gstr2bReconciliation

```ts
Gstr2bReconciliation()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `Gstr2bReconciliation` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: Gstr3bView

```ts
Gstr3bView({ data }: { data: Record<string, unknown> })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `Gstr3bView` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: loadData

```ts
loadData(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `loadData` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handlePrint

```ts
handlePrint(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handlePrint` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: rows

```ts
rows(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `rows` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: monthly

```ts
monthly(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `monthly` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: entries

```ts
entries(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `entries` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: rawEntries

```ts
rawEntries(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `rawEntries` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: notes

```ts
notes(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `notes` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleCreate

```ts
handleCreate(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleCreate` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: totals

```ts
totals(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `totals` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: b2b

```ts
b2b(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `b2b` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: hsn

```ts
hsn(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `hsn` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleUpload

```ts
handleUpload(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleUpload` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: statusBadge

```ts
statusBadge(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `statusBadge` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: exportCsv

```ts
exportCsv(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `exportCsv` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: Section

```ts
Section(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `Section` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: Row

```ts
Row(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/accounts/AccountsView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `Row` before deleting. |
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
rg -n "AccountsView" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **761**. Large view/route files are refactor candidates.

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

1. Open `src/features/accounts/AccountsView.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__features__accounts__accountsview`*
