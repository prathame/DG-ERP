---
sidebar_label: "nic-api.ts"
title: "File server/services/nic-api.ts"
description: "Deep walkthrough of server/services/nic-api.ts in DG-ERP / Dhandho"
---

# File walkthrough: `server/services/nic-api.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`server/services/nic-api.ts` is part of Dhandho (DG-ERP). Approximate size: **517 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `crypto`
- `../utils/secret-crypto`
- `../utils/helpers`
- `../utils/logger`

## Exports and symbols

**Exported names:** `GstApiMode`, `GstApiCredentials`, `IrnResult`, `EwbResult`, `getGstnPublicKey`, `isValidPin`, `resolveSupplyType`, `buildIrnPayload`, `buildEwbPayload`, `NicApiClient`, `loadGstCredentials`, `loadSellerPin`

**Classes:** `NicApiClient`

## Functions (15 detected)

### Function: loggedFetch

```ts
loggedFetch(url: string, init: RequestInit & { signal?: AbortSignal }, op: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `loggedFetch` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: getGstnPublicKey

```ts
getGstnPublicKey(mode: GstApiMode)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `getGstnPublicKey` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: aesEncrypt

```ts
aesEncrypt(data: string, keyBase64: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `aesEncrypt` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: aesDecrypt

```ts
aesDecrypt(encData: string, keyBase64: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `aesDecrypt` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: isValidPin

```ts
isValidPin(pin: string | undefined | null)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `isValidPin` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: resolveSupplyType

```ts
resolveSupplyType(buyerGstin: string | undefined)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `resolveSupplyType` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: buildIrnPayload

```ts
buildIrnPayload(opts: {
  sellerGstin: string;
  sellerName: string;
  sellerAddr: string;
  sellerPin: string;
  buyerGstin?: string;
  buyerName: string;
  buyerAddr: string;
  buyerPin: string;
  invoiceNo: string;
  invoiceDate: string;
  items: {
    hsnCode: string;
    productName: string;
    qty: number;
    unitPrice: number;
    gstRate: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }[];
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  grandTotal: number;
  supplyType?: string;
  docType?: string;
})
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `buildIrnPayload` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: buildEwbPayload

```ts
buildEwbPayload(opts: {
  supplyType: string;
  subSupplyType: string;
  docType: string;
  docNo: string;
  docDate: string;
  sellerGstin: string;
  sellerName: string;
  sellerAddr: string;
  sellerPin: string;
  buyerGstin: string;
  buyerName: string;
  buyerAddr: string;
  buyerPin: string;
  items: {
    productName: string;
    hsnCode: string;
    qty: number;
    taxable: number;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  }[];
  totalTaxable: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  grandTotal: number;
  vehicleNo: string;
  vehicleType?: string;
  transportMode?: string;
  transporterId?: string;
  transporterName?: string;
  distance: number;
})
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `buildEwbPayload` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: loadGstCredentials

```ts
loadGstCredentials(pool: import('pg')
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `loadGstCredentials` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: loadSellerPin

```ts
loadSellerPin(pool: import('pg')
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `loadSellerPin` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: method

```ts
method(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `method` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: pem

```ts
pem(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `pem` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: data

```ts
data(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `data` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: row

```ts
row(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `row` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: mode

```ts
mode(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `server/services/nic-api.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `mode` before deleting. |
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
rg -n "nic-api" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **517**. Large view/route files are refactor candidates.

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

1. Open `server/services/nic-api.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `server__services__nic-api`*
