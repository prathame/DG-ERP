---
sidebar_label: "OnPremView.tsx"
title: "File src/features/super-admin/OnPremView.tsx"
description: "Deep walkthrough of src/features/super-admin/OnPremView.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/features/super-admin/OnPremView.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/features/super-admin/OnPremView.tsx` is part of Dhandho (DG-ERP). Approximate size: **904 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `react`
- `motion/react`
- `lucide-react`
- `../../lib/utils`
- `../../components/ui`

## Exports and symbols

**Exported names:** `OnPremView`

**Classes:** _none_

## Functions (17 detected)

### Function: timeAgo

```ts
timeAgo(ts: string | null)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `timeAgo` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: summarizeSettings

```ts
summarizeSettings(s: Record<string, unknown> | undefined | null)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `summarizeSettings` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: isSyncPending

```ts
isSyncPending(lic: Pick<License, 'settingsPushedAt' | 'settingsAppliedAt'>)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `isSyncPending` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: OnPremView

```ts
OnPremView({ saToken }: { saToken: string })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `OnPremView` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: tc

```ts
tc(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `tc` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: load

```ts
load(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `load` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: waitForDeviceConfirm

```ts
waitForDeviceConfirm(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `waitForDeviceConfirm` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: copyKey

```ts
copyKey(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `copyKey` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleCreate

```ts
handleCreate(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleCreate` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleUpdate

```ts
handleUpdate(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleUpdate` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: buildMergedSettings

```ts
buildMergedSettings(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `buildMergedSettings` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: pushToDevice

```ts
pushToDevice(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `pushToDevice` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handleDelete

```ts
handleDelete(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handleDelete` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: whatsappMsg

```ts
whatsappMsg(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `whatsappMsg` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: businessType

```ts
businessType(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `businessType` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: patchTab

```ts
patchTab(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `patchTab` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: val

```ts
val(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/features/super-admin/OnPremView.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `val` before deleting. |
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
rg -n "OnPremView" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **904**. Large view/route files are refactor candidates.

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

1. Open `src/features/super-admin/OnPremView.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__features__super-admin__onpremview`*
