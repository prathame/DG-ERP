---
sidebar_label: "gst-api.ts"
title: "File server/routes/gst-api.ts"
description: "Deep walkthrough of server/routes/gst-api.ts in DG-ERP / Dhandho"
---

# File walkthrough: `server/routes/gst-api.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`server/routes/gst-api.ts` is part of Dhandho (DG-ERP). Approximate size: **404 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `express`
- `../middleware/auth`
- `../pg-db`
- `../utils/helpers`
- `../utils/secret-crypto`
- `../services/nic-api`

## Exports and symbols

**Exported names:** _none detected_

**Classes:** _none_

## Functions (9 detected)

### Function: fmtDate

```ts
fmtDate(iso: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/gst-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `fmtDate` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: safeError

```ts
safeError(err: unknown)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/gst-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `safeError` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: resolveSellerGstin

```ts
resolveSellerGstin(mode: GstApiMode,
  fromSettings: string | undefined,
  fromTenant: string | undefined,
  fromCreds: string,)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/gst-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `resolveSellerGstin` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: resolvePins

```ts
resolvePins(mode: GstApiMode,
  sellerPinIn: string | undefined,
  buyerPinIn: string | undefined,
  settingsPin: string,)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/gst-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `resolvePins` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: g

```ts
g(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/gst-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `g` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: row

```ts
row(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/gst-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `row` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: creds

```ts
creds(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/gst-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `creds` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: locked

```ts
locked(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/gst-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `locked` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: vendor

```ts
vendor(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/routes/gst-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `vendor` before deleting. |
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
rg -n "gst-api" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **404**. Large view/route files are refactor candidates.

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

1. Open `server/routes/gst-api.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `server__routes__gst-api`*
