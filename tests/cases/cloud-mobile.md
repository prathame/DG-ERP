# Cloud Mobile UX — Manual / E2E Cases

Phone usability for the **cloud** tenant app + Super Admin (320–430px). Desktop must stay unchanged. See also `docs/mobile-ui-audit.md`.

| # | Case | Steps | Expected |
|---|------|-------|----------|
| 1 | Notch / header | Open tenant app on notched phone | Header clear of status bar; title readable |
| 2 | Bottom nav clearance | Scroll a long list (Invoices / Inventory) | Last rows not hidden under bottom tabs + home indicator |
| 3 | SA drawer | Super Admin on phone → hamburger | Drawer opens; content full width; desktop rail unchanged ≥1024 |
| 4 | Invoice cards | Invoices tab on phone | Cards with actions; tap summary opens detail; actions do not nest as a button-in-button |
| 5 | Invoice desktop table | Invoices ≥640px | Same table layout as before mobile work |
| 6 | Tall modal scroll | Create Invoice / Distribution / Record Payment | Modal fits viewport; body scrolls; keyboard does not trap forever |
| 7 | Chat dismiss | Open chatbot on phone | **X** in header closes; Escape closes; can return to app |
| 8 | Confirm sheet | Trigger delete confirm on phone | Bottom sheet with Cancel/Confirm; usable safe-area |
| 9 | Sales barcode row | Sales Entry on 320px | Input + Verify wrap; no horizontal page scroll |
| 10 | Table overflow | Orders create line items / Quotation detail | Horizontal scroll inside table only, not whole page |
| 11 | Touch targets | Tap print/status/delete icons on phone | Targets ≥44px; succeed without zoom |
| 12 | Service Cloud gate | Busy/offline overlay on phone | Sheet fits screen; readable; does not clip home indicator |

**Automated (related):** `tests/unit/useEscapeKey.test.ts` (Escape contract). UI layout is CSS/manual — not under Vitest coverage gates (`server/utils` / `server/services`).
