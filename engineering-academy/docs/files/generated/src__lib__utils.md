---
sidebar_label: "utils.ts"
title: "File src/lib/utils.ts"
description: "Deep walkthrough of src/lib/utils.ts in DG-ERP / Dhandho"
---

# File walkthrough: `src/lib/utils.ts`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/lib/utils.ts` is part of Dhandho (DG-ERP). Approximate size: **318 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `clsx`
- `tailwind-merge`
- `./session`

## Exports and symbols

**Exported names:** `fetchImageAsDataUrl`, `bizTypeLabel`, `useTabLabel`, `cn`, `formatDate`, `resolveIrnQrPayload`, `PRINT_POPUP_BLOCKED`, `openPrintWindow`, `printBillInWindow`, `writePrintHtml`, `saveBillAsPdf`, `shareViaWhatsApp`, `shareViaEmail`, `formatSalesInvoiceText`, `formatDistributionChallanText`, `exportToCsv`

**Classes:** _none_

## Functions (23 detected)

### Function: fetchImageAsDataUrl

```ts
fetchImageAsDataUrl(url: string, timeoutMs = 4000)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `fetchImageAsDataUrl` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: bizTypeLabel

```ts
bizTypeLabel(type: string | null | undefined, companyName?: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `bizTypeLabel` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: useTabLabel

```ts
useTabLabel(tabId: string, defaultLabel: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `useTabLabel` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: cn

```ts
cn(...inputs: ClassValue[])
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `cn` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: formatDate

```ts
formatDate(dateStr: string | null | undefined)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `formatDate` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: resolveIrnQrPayload

```ts
resolveIrnQrPayload(r: { qrCode?: string | null; signedQrCode?: string | null; irnQr?: string | null })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `resolveIrnQrPayload` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: openPrintWindow

```ts
openPrintWindow(placeholder = 'Preparing…')
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `openPrintWindow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: applyPrintTitle

```ts
applyPrintTitle(html: string, filename?: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `applyPrintTitle` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: triggerPrintWhenReady

```ts
triggerPrintWhenReady(win: Window)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `triggerPrintWhenReady` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: printBillInWindow

```ts
printBillInWindow(win: Window, html: string, filename?: string, opts?: { autoPrint?: boolean })
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `printBillInWindow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: printViaIframe

```ts
printViaIframe(html: string, autoPrint = true)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `printViaIframe` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: writePrintHtml

```ts
writePrintHtml(win: Window | null,
  html: string,
  options?: { filename?: string; autoPrint?: boolean },)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `writePrintHtml` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: saveBillAsPdf

```ts
saveBillAsPdf(html: string, filename?: string, win?: Window | null)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `saveBillAsPdf` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: shareViaWhatsApp

```ts
shareViaWhatsApp(phone: string, message: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `shareViaWhatsApp` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: shareViaEmail

```ts
shareViaEmail(email: string, subject: string, body: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `shareViaEmail` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: formatSalesInvoiceText

```ts
formatSalesInvoiceText(bill: {
  id: string; barcode: string; productName: string; category?: string | null;
  salePrice: number; warrantyMonths: number; purchaseDate: string;
  customerName: string; customerPhone: string; customerEmail?: string | null;
  vendor: { name: string; contactPerson?: string | null; phone?: string | null };
  warranty?: { expiryDate: string } | null;
  company: { name: string; phone?: string | null; address?: string | null };
  rewardPointsEarned: number;
})
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `formatSalesInvoiceText` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: formatDistributionChallanText

```ts
formatDistributionChallanText(bill: {
  challanId: string; distributionDate: string;
  vendor: { name: string; contactPerson?: string | null; phone?: string | null };
  company: { name: string; phone?: string | null; address?: string | null };
  items: { sno: number; barcode: string; productName: string }[];
  groupedItems?: { sno: number; productName: string; barcodeRange: string; quantity: number; netPrice: number; lineTotal: number }[];
  totalQuantity: number; totalValue: number;
  ewbNumber?: string | null;
  irn?: string | null;
  irnAckNo?: string | null;
  payment?: { totalDistributedValue: number; totalPaid: number; balance: number };
})
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `formatDistributionChallanText` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: escapeCsv

```ts
escapeCsv(val: unknown)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `escapeCsv` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: exportToCsv

```ts
exportToCsv(data: Record<string, unknown>[], filename: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `exportToCsv` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: printNow

```ts
printNow(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `printNow` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: check

```ts
check(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `check` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: cleanup

```ts
cleanup(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `cleanup` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: run

```ts
run(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/lib/utils.ts`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `run` before deleting. |
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
rg -n "utils" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **318**. Large view/route files are refactor candidates.

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

1. Open `src/lib/utils.ts` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__lib__utils`*
