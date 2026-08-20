# Barcode & Label Template Designer — Implementation Report

**Status:** IMPLEMENTED (MVP — production-ready core; physical printer calibration not verified)

## Overview

Tenant-scoped visual label template designer under **Settings → Bill Customization → Barcode & Label Templates**. Reuses existing DG-ERP patterns (tenant auth, `bill_settings` logo, JsBarcode, print window utilities).

## Architecture

| Layer | Location |
|-------|----------|
| Shared schema & validation | `shared/barcodeLabelTemplate.ts` |
| Render / print HTML | `src/lib/barcodeLabelRender.ts` |
| API routes | `server/routes/barcode-label-templates.ts` |
| DB table | `barcode_label_templates` in `server/pg-db.ts` |
| Template list UI | `src/features/settings/barcodeLabels/BarcodeLabelTemplatesSection.tsx` |
| Visual designer | `src/features/settings/barcodeLabels/BarcodeLabelDesigner.tsx` |
| Settings integration | `src/features/settings/SettingsView.tsx` (Bill tab) |
| Product label print | `src/components/ui/BarcodeLabelPrinter.tsx` (uses default template when set) |

## Database

Table `barcode_label_templates` (tenant-scoped, RLS enabled):

- `id`, `tenant_id`, `name`, `description`
- `width_mm`, `height_mm`, `orientation`
- `status` (`draft` \| `active` \| `archived`)
- `is_default` (partial unique index: one active default per tenant)
- `version` (incremented on each save)
- `elements` JSONB array
- `created_by`, `updated_by`, timestamps

## API Endpoints

| Method | Path |
|--------|------|
| GET | `/api/barcode-label-templates` |
| GET | `/api/barcode-label-templates/default` |
| GET | `/api/barcode-label-templates/:id` |
| POST | `/api/barcode-label-templates` |
| PUT | `/api/barcode-label-templates/:id` |
| POST | `/api/barcode-label-templates/:id/duplicate` |
| PUT | `/api/barcode-label-templates/:id/default` |
| DELETE | `/api/barcode-label-templates/:id` (archive) |

All routes use authenticated tenant context from JWT — never trust client `tenantId`.

## Dynamic fields (actual DG-ERP data)

Exposed fields map to real product/company data:

- `product.name`, `product.barcode`, `product.price` (MRP), `product.hsn`, `product.gstRate`, `product.batchNumber`
- `company.name`, `company.logo`, `company.gstin`, `company.phone`, `company.address`

Fields **not** invented: separate SKU column, serial number, expiry (not on cloud `products`).

## Barcode types

JsBarcode: CODE128, EAN13, EAN8, CODE39, UPC. EAN-13 checksum validated server-side and at print time.

QR codes: `qrcode` npm package (real encoding, not CSS placeholder).

## Printing

- `@page` size set from template mm dimensions
- Test print from designer and template list
- Inventory **Print Barcode Labels** uses active default template when configured; otherwise legacy A4 grid layout

## Security

- Tenant isolation via `tenant_id` + RLS
- Admin-only create/update/delete
- Cross-tenant ID access returns 404

## Tests

- `tests/unit/barcode-label-template.test.ts` — validation, EAN checksum, dynamic fields
- `tests/api/http-barcode-label-templates.test.ts` — CRUD, default, cross-tenant

**Last run:** `npm run typecheck` ✓ · unit + API tests: **28 passed** (11 unit + 1 render + 16 API)

Optional Playwright (manual): `npm run test:e2e:barcode-labels` (requires dev server + test tenant)

## Known limitations

- Physical printer mm accuracy depends on browser/OS print drivers — not lab-verified
- Designer canvas shows placeholders; full WYSIWYG preview is in print/test output
- Import/export JSON not yet implemented
- Alignment distribute tools partially covered (manual X/Y in inspector)
- Mobile: list + test print; full editor is desktop-oriented

## Files created

- `shared/barcodeLabelTemplate.ts`
- `src/lib/barcodeLabelRender.ts`
- `server/routes/barcode-label-templates.ts`
- `src/features/settings/barcodeLabels/BarcodeLabelTemplatesSection.tsx`
- `src/features/settings/barcodeLabels/BarcodeLabelDesigner.tsx`
- `tests/unit/barcode-label-template.test.ts`
- `tests/api/http-barcode-label-templates.test.ts`
- `BARCODE_LABEL_TEMPLATE_IMPLEMENTATION.md`

## Files modified

- `server/pg-db.ts` — table + RLS
- `server/app.ts` — router mount
- `src/api.ts` — client API
- `src/features/settings/SettingsView.tsx` — Bill Settings section
- `src/components/ui/BarcodeLabelPrinter.tsx` — default template print path
- `tests/helpers.ts` — cleanup table list
- `package.json` / `package-lock.json` — `qrcode` dependency
