---
sidebar_label: "BarcodeLabelPrinter.tsx"
title: "File src/components/ui/BarcodeLabelPrinter.tsx"
description: "Deep walkthrough of src/components/ui/BarcodeLabelPrinter.tsx in DG-ERP / Dhandho"
---

# File walkthrough: `src/components/ui/BarcodeLabelPrinter.tsx`

:::info Ownership context
Auto-generated from the live source tree so **no file is invisible** during onboarding.
:::

## Purpose

`src/components/ui/BarcodeLabelPrinter.tsx` is part of Dhandho (DG-ERP). Approximate size: **367 lines**.

## Business value

Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*

## Imports

- `react`
- `lucide-react`
- `../../api`
- `./index`
- `../../lib/utils`
- `../../lib/session`
- `../../lib/billTemplates`

## Exports and symbols

**Exported names:** `BarcodeLabelPrinter`

**Classes:** _none_

## Functions (9 detected)

### Function: generateBarcodeDataUrl

```ts
generateBarcodeDataUrl(text: string)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/BarcodeLabelPrinter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `generateBarcodeDataUrl` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: generateQrDataUrl

```ts
generateQrDataUrl(text: string, size: number = 100)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/BarcodeLabelPrinter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `generateQrDataUrl` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: BarcodeLabelPrinter

```ts
BarcodeLabelPrinter({ productId, onClose, barcodeRange }: BarcodeLabelPrinterProps)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/BarcodeLabelPrinter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `BarcodeLabelPrinter` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: JsBarcode

```ts
JsBarcode(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/BarcodeLabelPrinter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `JsBarcode` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: companyName

```ts
companyName(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/BarcodeLabelPrinter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `companyName` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: toggleBarcode

```ts
toggleBarcode(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/BarcodeLabelPrinter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `toggleBarcode` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: selectAll

```ts
selectAll(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/BarcodeLabelPrinter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `selectAll` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: selectNone

```ts
selectNone(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/BarcodeLabelPrinter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `selectNone` before deleting. |
| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |
| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |
| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |

### Function: handlePrint

```ts
handlePrint(...)
```

| Aspect | Detail |
| --- | --- |
| Purpose | Symbol in `src/components/ui/BarcodeLabelPrinter.tsx`. Open the source and read the body. |
| Parameters | See signature above. |
| What breaks if removed | Search the repo for `handlePrint` before deleting. |
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
rg -n "BarcodeLabelPrinter" --glob '!node_modules' -g '*.ts' -g '*.tsx'
```

## Performance impact

Line count **367**. Large view/route files are refactor candidates.

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

1. Open `src/components/ui/BarcodeLabelPrinter.tsx` in the IDE.
2. Breakpoint the largest exported function.
3. Trigger via UI or supertest.
4. Write one sentence on why this file exists in the product narrative.

---

*Generated by scripts/generate-file-deepdives.mjs · slug: `src__components__ui__barcodelabelprinter`*
