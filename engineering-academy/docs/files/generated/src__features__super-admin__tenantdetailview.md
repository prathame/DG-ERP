---
sidebar_label: "TenantDetailView.tsx"
title: "File src/features/super-admin/TenantDetailView.tsx"
description: "Deep walkthrough of src/features/super-admin/TenantDetailView.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/features/super-admin/TenantDetailView.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/features/super-admin/TenantDetailView.tsx` is part of Dhandho (DG-ERP). Approximate size: **1406 lines**.

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

**Exported names:** `TenantDetailView`

**Classes:** _none_

## Functions (14 detected)

### Function: TenantDetailView

```ts
TenantDetailView({ tenantId, onBack }: TenantDetailViewProps)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `TenantDetailView` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: getDefaultTabConfig

```ts
getDefaultTabConfig(businessType?: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `getDefaultTabConfig` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: TabCustomization

```ts
TabCustomization({
  tenantId,
  tabConfig,
  tenant,
  onSaved,
}: {
  tenantId: string;
  tabConfig: Record<string, { label: string; visible: boolean }> | null;
  tenant: Record<string, unknown>;
  onSaved: ()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `TabCustomization` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: fetchTenant

```ts
fetchTenant(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `fetchTenant` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleResetToken

```ts
handleResetToken(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleResetToken` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleStatusChange

```ts
handleStatusChange(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleStatusChange` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: subscriptionActive

```ts
subscriptionActive(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `subscriptionActive` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleChangePlan

```ts
handleChangePlan(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleChangePlan` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleImpersonate

```ts
handleImpersonate(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleImpersonate` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: data

```ts
data(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `data` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: updateLabel

```ts
updateLabel(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `updateLabel` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: toggleVisible

```ts
toggleVisible(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `toggleVisible` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: isLocked

```ts
isLocked(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `isLocked` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleSave

```ts
handleSave(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/TenantDetailView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleSave` before deleting. |
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
rg -n "TenantDetailView" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **1406**. Large view/route files are refactor candidates.

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

1. Open `src/features/super-admin/TenantDetailView.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__features__super-admin__tenantdetailview`*
