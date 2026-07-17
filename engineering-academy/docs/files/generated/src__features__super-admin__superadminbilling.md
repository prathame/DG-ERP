---
sidebar_label: "SuperAdminBilling.tsx"
title: "File src/features/super-admin/SuperAdminBilling.tsx"
description: "Deep walkthrough of src/features/super-admin/SuperAdminBilling.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/features/super-admin/SuperAdminBilling.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/features/super-admin/SuperAdminBilling.tsx` is part of Dhandho (DG-ERP). Approximate size: **246 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `react`
- `motion/react`
- `lucide-react`
- `../../lib/utils`
- `../../components/ui`
- `../../lib/session`

## Exports and symbols

**Exported names:** `SuperAdminBilling`

**Classes:** _none_

## Functions (8 detected)

### Function: SuperAdminBilling

```ts
SuperAdminBilling()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/SuperAdminBilling.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `SuperAdminBilling` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: CreateInvoiceModal

```ts
CreateInvoiceModal({ tenants, onClose, onCreated }: { tenants: { id: string; companyName: string; planName?: string }[]; onClose: ()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/SuperAdminBilling.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `CreateInvoiceModal` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: fetchInvoices

```ts
fetchInvoices(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/SuperAdminBilling.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `fetchInvoices` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: markPaid

```ts
markPaid(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/SuperAdminBilling.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `markPaid` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: deleteInvoice

```ts
deleteInvoice(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/SuperAdminBilling.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `deleteInvoice` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: esc

```ts
esc(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/SuperAdminBilling.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `esc` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: printInvoice

```ts
printInvoice(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/SuperAdminBilling.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `printInvoice` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleSubmit

```ts
handleSubmit(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/SuperAdminBilling.tsx`. Open the source and read the body. |
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
rg -n "SuperAdminBilling" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **246**. Large view/route files are refactor candidates.

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

1. Open `src/features/super-admin/SuperAdminBilling.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__features__super-admin__superadminbilling`*
