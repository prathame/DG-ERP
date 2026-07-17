---
sidebar_label: "NotificationCenter.tsx"
title: "File src/components/ui/NotificationCenter.tsx"
description: "Deep walkthrough of src/components/ui/NotificationCenter.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/components/ui/NotificationCenter.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/components/ui/NotificationCenter.tsx` is part of Dhandho (DG-ERP). Approximate size: **325 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `react`
- `lucide-react`
- `../../lib/utils`
- `../../api`
- `../../lib/session`

## Exports and symbols

**Exported names:** `NotificationItem`, `NotificationCenter`

**Classes:** _none_

## Functions (15 detected)

### Function: storageScope

```ts
storageScope()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `storageScope` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: loadDismissed

```ts
loadDismissed()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `loadDismissed` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: saveDismissed

```ts
saveDismissed(ids: Set<string>)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `saveDismissed` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: isMuted

```ts
isMuted()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `isMuted` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: setMuted

```ts
setMuted(muted: boolean)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `setMuted` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: playSoftChime

```ts
playSoftChime()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `playSoftChime` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: highFingerprint

```ts
highFingerprint(items: NotificationItem[])
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `highFingerprint` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: NotificationCenter

```ts
NotificationCenter({ onNavigate, canAccessTab }: Props)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `NotificationCenter` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: u

```ts
u(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `u` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: onDoc

```ts
onDoc(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `onDoc` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: markAdminRead

```ts
markAdminRead(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `markAdminRead` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: dismissDigest

```ts
dismissDigest(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `dismissDigest` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: markAllRead

```ts
markAllRead(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `markAllRead` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: toggleMute

```ts
toggleMute(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `toggleMute` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: onClickItem

```ts
onClickItem(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/NotificationCenter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `onClickItem` before deleting. |
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
rg -n "NotificationCenter" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **325**. Large view/route files are refactor candidates.

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

1. Open `src/components/ui/NotificationCenter.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__components__ui__notificationcenter`*
