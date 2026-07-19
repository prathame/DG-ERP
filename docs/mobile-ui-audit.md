# Mobile UI Audit Report (Phase 1)

Date: 2026-07-17  
Scope: Phone layouts for Offline Mobile + Cloud under `lg` (320–480px). Desktop preserved via `sm:` / `lg:` gates.  
Goal: Native-like ERP usability — no redesign, no API/business-logic changes.

---

## 1. Findings (root causes)

| Issue | Root cause |
|-------|------------|
| Invoice create cramped / horizontal scroll | `CreateInvoiceModal` used a `min-w-[720px]` line-item table inside a single tall centered dialog; 3 footer buttons in one row |
| Purchases / Quotations line editors | Same desktop table-in-modal pattern |
| Drawer whitespace / Settings float | Aside lacked sticky profile + pinned footer; nav scroll mixed with chrome |
| Toasts under notch | `ToastProvider` used `top-4` without safe-area |
| No shared modal | Hand-rolled overlays; only `ConfirmDialog` had bottom-sheet-on-phone |

---

## 2. Components refactored / added

| Component | Role |
|-----------|------|
| `AppModal` | Bottom sheet on phone, centered on `sm+`; sticky header/footer; Escape + focus trap |
| `ModalActions` / `ModalActionButton` | Stacked primary/secondary on phone; row on desktop |
| `FormSection` / `FormGrid` / `FormField` | 1-col phone / 2-col `sm+` form layout |
| `LineItemCard` | Collapsible vertical line-item editor for phones |
| `MobileStepper` | Party → Items → Review (invoice create, phone only) |

---

## 3. Files modified

| File | Change |
|------|--------|
| `src/components/ui/AppModal.tsx` | New |
| `src/components/ui/ModalActions.tsx` | New |
| `src/components/ui/FormSection.tsx` | New |
| `src/components/ui/LineItemCard.tsx` | New |
| `src/components/ui/MobileStepper.tsx` | New |
| `src/components/ui/index.ts` | Exports |
| `src/components/ui/Toast.tsx` | Safe-area top offset |
| `src/features/invoices/InvoicesView.tsx` | Stepper + item cards + AppModal |
| `src/features/purchases/PurchasesView.tsx` | AppModal + LineItemCard |
| `src/features/quotations/QuotationsView.tsx` | AppModal + LineItemCard |
| `src/App.tsx` | Drawer sticky profile / scroll nav / pinned settings; header touch targets |
| `tests/cases/service-mobile.md` | Cases 5g–5i |
| `tests/cases/cloud-mobile.md` | Cases 13–15 |

---

## 4. Before vs after

| Before | After |
|--------|--------|
| Invoice line table scrolls sideways on phone | Stacked `LineItemCard`s; no horizontal scroll |
| Cancel / Draft / Send squeezed in one row | Full-width stacked actions on phone |
| One huge scrollable invoice dialog | Phone stepper (Party / Items / Review); desktop still shows all sections |
| Drawer Settings mid-scroll | Pinned settings footer + safe-area |
| Toasts under status bar | Offset by `env(safe-area-inset-top)` |

---

## 5. Phase 2 — Emergent-style phone shell (dense)

| Change | Detail |
|--------|--------|
| Bottom nav IA | Analytics · Masters · Invoice · Quotes · More (Stock/Finance under More) |
| `MobileShell` | Pill tabs, KPI cards, FAB, empty state, list rows, quick actions |
| Analytics | Quick actions, dense KPIs, compact activity |
| Masters | Pill filters (All / Parties / Catalog / Finance) + dense list rows |
| Invoices / Quotes | Outstanding KPIs, status pills, compact cards/rows, phone FAB |
| More drawer | Avatar header, 3×2 shortcut grid (Stock / Finance / Accounts / …) |

---

## 6. Remaining improvements (follow-up)

- Cardify Masters detail tables (Staff, Customers, Vendors, Bank, Price List)
- Accounts report tables (beyond existing GSTR helpers)
- Distribution / Warranty dense editors
- Landscape phone tuning
- Rebuild Offline Mobile APK after merge for device QA

---

## 7. Local test gate (before APK)

```bash
npx vite --mode service-mobile --port 3000 --host
```

Chrome DevTools device widths: 320 / 360 / 375 / 390 / 412 / 430 / 480.  
Checklist: create invoice (3+ lines), purchases/quotes line cards, drawer Settings pinned, toast below notch, no page horizontal scroll, desktop `lg+` unchanged.

---

## Rules honored

- Desktop visual design preserved (`sm:` / `lg:` gates)
- No API or business-logic changes
- No branding / color / font system change
