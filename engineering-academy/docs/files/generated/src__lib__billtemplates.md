---
sidebar_label: "billTemplates.ts"
title: "File src/lib/billTemplates.ts"
description: "Deep walkthrough of src/lib/billTemplates.ts in DG-ERP / Dhandho"
---

# File walkthrough: `src/lib/billTemplates.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/lib/billTemplates.ts` is part of Dhandho (DG-ERP). Approximate size: **595 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `../api`

## Exports and symbols

**Exported names:** `esc`, `safeColor`, `safeImgSrc`, `placeOfSupplyLabel`, `buildDistributionBillSlice`, `generateSalesInvoiceHtml`, `generateDistributionChallanHtml`

**Classes:** _none_

## Functions (17 detected)

### Function: esc

```ts
esc(text: unknown)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `esc` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: safeColor

```ts
safeColor(c: string | null | undefined)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `safeColor` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: safeImgSrc

```ts
safeImgSrc(src: unknown)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `safeImgSrc` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: placeOfSupplyLabel

```ts
placeOfSupplyLabel(buyerGstin?: string | null, sellerGstin?: string | null)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `placeOfSupplyLabel` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: fmtDate

```ts
fmtDate(dateStr: string | null | undefined)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `fmtDate` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: buildDistributionBillSlice

```ts
buildDistributionBillSlice(bill: DistributionBillData,
  items: DistributionBillData['items'],
  totalValue: number,)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `buildDistributionBillSlice` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: generateSalesInvoiceHtml

```ts
generateSalesInvoiceHtml(bill: SaleBillData, options?: { showGst?: boolean; qrDataUrl?: string })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `generateSalesInvoiceHtml` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: generateDistributionChallanHtml

```ts
generateDistributionChallanHtml(bill: DistributionBillData, options?: {
  showGst?: boolean;
  fullyPaid?: boolean;
  qrDataUrl?: string;
  irnQrDataUrl?: string;
})
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `generateDistributionChallanHtml` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: billConfig

```ts
billConfig(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `billConfig` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: tagline

```ts
tagline(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `tagline` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: invPrefix

```ts
invPrefix(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `invPrefix` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: footerText

```ts
footerText(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `footerText` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: warrantySection

```ts
warrantySection(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `warrantySection` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: numberToWords

```ts
numberToWords(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `numberToWords` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: convert

```ts
convert(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `convert` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: chPrefix

```ts
chPrefix(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `chPrefix` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: vendorGstin

```ts
vendorGstin(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/billTemplates.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `vendorGstin` before deleting. |
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
rg -n "billTemplates" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **595**. Large view/route files are refactor candidates.

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

1. Open `src/lib/billTemplates.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__lib__billtemplates`*
