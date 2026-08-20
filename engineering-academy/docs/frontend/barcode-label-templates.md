---
title: Barcode & Label Template Designer
description: Visual tenant-scoped label templates for inventory barcode printing.
---

# Barcode & Label Template Designer

## What it is

A **visual print-layout editor** under **Settings → Bill Customization → Barcode & Label Templates**. Tenants design reusable product/barcode labels (mm-accurate canvas, drag/resize elements, dynamic fields, real barcodes) and set one **default** template used when printing from Inventory.

This is **not** a one-off barcode generator — templates are saved, versioned, duplicated, and tenant-isolated.

## Architecture

| Layer | Path |
|-------|------|
| Shared schema & validation | `shared/barcodeLabelTemplate.ts` |
| Render / print HTML | `src/lib/barcodeLabelRender.ts` |
| API | `server/routes/barcode-label-templates.ts` |
| DB | `barcode_label_templates` (`server/pg-db.ts`, RLS enabled) |
| List UI | `src/features/settings/barcodeLabels/BarcodeLabelTemplatesSection.tsx` |
| Designer | `src/features/settings/barcodeLabels/BarcodeLabelDesigner.tsx` |
| Inventory print | `src/components/ui/BarcodeLabelPrinter.tsx` (default template → legacy A4 fallback) |

## Database model

- `barcode_label_templates`: tenant-scoped row with `width_mm`, `height_mm`, `status`, `is_default`, `version`, `elements` JSONB.
- Partial unique index: one active default per tenant.
- Elements store position in **millimeters** (`xMm`, `yMm`, `widthMm`, `heightMm`), `zIndex`, `visible`, and type-specific `properties`.

## Dynamic fields

Only fields that exist in DG-ERP:

- Product: `name`, `barcode`, `price` (MRP), `hsn`, `gstRate`, `batchNumber`
- Company: `name`, `logo`, `gstin`, `phone`, `address`

Syntax: `{{product.name}}`, `{{company.logo}}`, etc. See `LABEL_DYNAMIC_FIELDS` in shared module.

## Barcode generation

- **Linear barcodes:** JsBarcode (CODE128, EAN13, EAN8, CODE39, UPC)
- **QR:** `qrcode` package
- EAN-13 checksum validated server-side and at render time

## Printing

- `@page` size from template mm dimensions in `renderLabelHtml`
- Test print from designer / template list
- Inventory **Print Barcode Labels** uses active default when configured

## Security

- JWT + tenant context from middleware — never trust client `tenantId`
- Admin-only mutations (`blockVendors`)
- Cross-tenant template ID → 404

## Extending

1. **New element type:** add to `LabelElementType` + `normalizeLabelElement` + designer toolbox + `renderLabelHtml` branch.
2. **New dynamic field:** add to product/company context types and `resolveDynamicText` only if the DB/API exposes the field.
3. **New barcode type:** extend `BARCODE_FORMATS` and JsBarcode mapping; add validation rules.

## Troubleshooting

| Issue | Check |
|-------|--------|
| Print uses old A4 grid | No active default template, or template has no elements |
| Invalid EAN-13 | Value length/checksum; use sample data in preview |
| Logo missing | `bill_settings.logo_base64` or `{{company.logo}}` element |
| Wrong tenant template | RLS + `tenant_id` on API queries |

See also: `BARCODE_LABEL_TEMPLATE_IMPLEMENTATION.md` in the repository root.
