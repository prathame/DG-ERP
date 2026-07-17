---
sidebar_label: "app.ts"
title: "File server/app.ts"
description: "Deep walkthrough of server/app.ts in DG-ERP / Dhandho"
---

# File walkthrough: `server/app.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`server/app.ts` is part of Dhandho (DG-ERP). Approximate size: **583 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `express`
- `path`
- `fs`
- `crypto`
- `helmet`
- `compression`
- `express-rate-limit`
- `jsonwebtoken`
- `./pg-db`
- `./middleware/permissions`
- `./routes/super-admin`
- `./routes/products`
- `./routes/sales`
- `./routes/distribution`
- `./routes/warranties`
- `./routes/replacements`
- `./routes/rewards`
- `./routes/customers`
- `./routes/vendors`
- `./routes/banks`
- `./routes/finance`
- `./routes/invoice-finance`
- `./routes/onprem`
- `./routes/mobile`
- `./routes/auth`
- `./routes/admin`
- `./routes/dashboard`
- `./routes/search`
- `./routes/reports`
- `./routes/purchases`
- `./routes/quotations`
- `./routes/orders`
- `./routes/price-lists`
- `./routes/accounts`
- `./routes/masters`
- `./routes/mapping`
- `./routes/audit`
- `./routes/chatbot`
- `./routes/bill-settings`
- `./routes/payroll`
- `./routes/expenses`
- `./routes/gst-api`
- `./routes/invoices`
- `./routes/notifications`
- `./utils/logger`
- `./utils/http-error`
- `./utils/authCache`

## Exports and symbols

**Exported names:** `createApp`

**Classes:** _none_

## Functions (7 detected)

### Function: isPublicApiPath

```ts
isPublicApiPath(apiRelativePath: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/app.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `isPublicApiPath` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: createApp

```ts
createApp()
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/app.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `createApp` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: allowedOrigins

```ts
allowedOrigins(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/app.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `allowedOrigins` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: tenant

```ts
tenant(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/app.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `tenant` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: correlationId

```ts
correlationId(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/app.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `correlationId` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: user

```ts
user(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/app.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `user` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: tenantId

```ts
tenantId(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/app.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `tenantId` before deleting. |
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
rg -n "app" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **583**. Large view/route files are refactor candidates.

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

1. Open `server/app.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `server__app`*
