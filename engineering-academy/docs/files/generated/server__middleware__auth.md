---
sidebar_label: "auth.ts"
title: "File server/middleware/auth.ts"
description: "Deep walkthrough of server/middleware/auth.ts in DG-ERP / Dhandho"
---

# File walkthrough: `server/middleware/auth.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`server/middleware/auth.ts` is part of Dhandho (DG-ERP). Approximate size: **187 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `express`
- `jsonwebtoken`
- `../pg-db`

## Exports and symbols

**Exported names:** `JwtPayload`, `AuthRequest`, `generateToken`, `generateSuperAdminToken`, `authMiddleware`, `authMiddlewareStrict`, `requireRole`, `requireAdmin`, `blockVendors`, `vendorScopeId`, `assertVendorLinked`, `assertVendorAccess`, `superAdminMiddleware`

**Classes:** _none_

## Functions (9 detected)

### Function: generateToken

```ts
generateToken(payload: object, expiresIn: string | number = '24h')
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/middleware/auth.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `generateToken` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: authMiddleware

```ts
authMiddleware(req: AuthRequest, res: Response, next: NextFunction)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/middleware/auth.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `authMiddleware` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: authMiddlewareStrict

```ts
authMiddlewareStrict(req: AuthRequest, res: Response, next: NextFunction)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/middleware/auth.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `authMiddlewareStrict` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: requireRole

```ts
requireRole(allowed: string[])
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/middleware/auth.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `requireRole` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: blockVendors

```ts
blockVendors(req: AuthRequest, res: Response, next: NextFunction)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/middleware/auth.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `blockVendors` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: vendorScopeId

```ts
vendorScopeId(req: AuthRequest)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/middleware/auth.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `vendorScopeId` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: assertVendorLinked

```ts
assertVendorLinked(req: AuthRequest)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/middleware/auth.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `assertVendorLinked` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: assertVendorAccess

```ts
assertVendorAccess(req: AuthRequest, vendorId: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/middleware/auth.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `assertVendorAccess` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: superAdminMiddleware

```ts
superAdminMiddleware(req: AuthRequest, res: Response, next: NextFunction)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/middleware/auth.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `superAdminMiddleware` before deleting. |
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
rg -n "auth" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **187**. Large view/route files are refactor candidates.

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

1. Open `server/middleware/auth.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `server__middleware__auth`*
