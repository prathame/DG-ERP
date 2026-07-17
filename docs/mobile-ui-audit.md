# Mobile UI Audit Report (Cloud app)

Date: 2026-07-17  
Scope: Cloud-based Dhandho app (tenant shell + Super Admin + marketing/login).  
Goal: Improve phone usability (320–430px) **without** redesigning desktop or changing business logic/APIs.

PR: https://github.com/prathame/DG-ERP/pull/77

---

## 1. Mobile UI Audit Report

The tenant shell already had bottom nav, drawer sidebar, and partial safe-area helpers. Gaps were:

- Missing / incomplete safe-area variables and header padding
- Super Admin permanently stealing width with a desktop sidebar on phones
- Bare / clipped tables on phones
- Modals taller or wider than the viewport (including `max-w-5xl` / `max-w-6xl`)
- Hover-only actions invisible on touch
- Dense form grids inside overlays
- Chat full-screen, staff drawers, and distribution sheets ignoring notch / home indicator

Desktop layouts were preserved via `sm:` / `lg:` gates and CSS scoped under `max-width` media queries.

---

## 2. Responsive Issues Found

| Priority | Area | Issue |
|----------|------|--------|
| P0 | Shell | Notch / status bar overlap; bottom nav covering content |
| P0 | Super Admin | Fixed `ml-64` sidebar on all viewports |
| P0 | Tables | Invoices, Orders line items, Quotations detail, Settings permissions, Finance bank match — clip without scroll |
| P0 | Modals | Large create dialogs (`max-w-3xl`–`6xl`) and tall payment forms exceed viewport |
| P1 | Forms | Sales barcode row, Purchases 3-col grid cramped at 320px |
| P1 | Touch | Icon `p-1` / `p-1.5` actions; Sales actions `opacity-0` until hover |
| P1 | Sheets | Staff payment drawer, Chat full-screen, Distribution vendor sheet — no safe-area |
| P2 | Marketing | Landing / SA login safe-area gaps |

---

## 3. Files Modified

| File | Change |
|------|--------|
| `src/index.css` | `--safe-*` vars, `.app-header-safe`, modal max-w up to 7xl + max-height, overlay grids stack, table `:has()` scroll, 44px icon hits, overflow clip |
| `src/App.tsx` | Settings nav touch target |
| `src/components/ui/ConfirmDialog.tsx` | Bottom sheet on phones + safe-area padding |
| `src/components/layout/ChatWidget.tsx` | Full-screen safe-area header/input |
| `src/components/layout/LandingPage.tsx` | Safe-area nav/hero |
| `src/features/super-admin/SuperAdminApp.tsx` | Mobile drawer; desktop rail unchanged |
| `src/features/super-admin/SuperAdminLogin.tsx` | `100dvh` + safe-area |
| `src/features/invoices/InvoicesView.tsx` | Mobile cards; detail table scroll |
| `src/features/sales/SalesEntryView.tsx` | Wrap barcode row; always-visible actions on small screens |
| `src/features/orders/OrdersView.tsx` | Line-item table `overflow-x-auto` |
| `src/features/purchases/PurchasesView.tsx` | `grid-cols-1 sm:grid-cols-3` |
| `src/features/quotations/QuotationsView.tsx` | Detail table scroll; convert modal max-height |
| `src/features/finance/InvoiceFinanceView.tsx` | Payment modal scroll |
| `src/features/finance/VendorFinanceView.tsx` | Bank match table overflow |
| `src/features/distribution/DistributionView.tsx` | Vendor sheet safe-area; payment modal scroll |
| `src/features/masters/StaffMasterView.tsx` | Drawer wrap + safe-area |
| `src/features/masters/CustomerMasterView.tsx` | Purchases modal horizontal scroll |
| `src/features/masters/PriceListView.tsx` | Modal max-height |
| `src/features/accounts/AccountsView.tsx` | GSTR table overflow wrappers |
| `src/features/settings/SettingsView.tsx` | Permissions matrix overflow |
| `src/platforms/service-cloud/ServiceCloudGate.tsx` | Busy/offline sheet fits viewport |
| `docs/mobile-ui-audit.md` | This report |

---

## 4. Mobile Improvements Applied

- Safe areas for header, bottom nav, chat, drawers, distribution sheet, confirm dialog, landing, SA login
- Super Admin off-canvas drawer below `lg`; desktop sidebar unchanged
- Invoices: card UI under `sm`; table from `sm` up
- Global modal fit (`max-width` + `max-height` + scroll) through `max-w-7xl`
- Overlay form grids stack to one column under `lg`
- Bare card tables get horizontal scroll under `lg`
- 44px min hit area for dense icon buttons on phones
- Hover-only row actions visible on phones
- Sales barcode row wraps; Verify full-width on narrow phones
- Tall payment / price / convert modals scroll within ~90dvh

---

## 5. Before vs After Summary

| Before | After |
|--------|--------|
| Header under status bar | `.app-header-safe` + `--safe-top` clears notch |
| SA panel unusable on phone | Full-width content + hamburger drawer |
| Invoice table clipped | Cards on phone; same table on desktop |
| Tall / wide modals clipped | Scrollable within ~90dvh; width ≤ viewport − 1.5rem |
| Sales actions invisible on touch | Visible below `sm` |
| Chat / drawers under home indicator | Safe-area padding |
| Confirm dialog centered awkwardly | Bottom sheet on phones |

---

## 6. Remaining Mobile Issues

- Distribution / Purchases / Quotations / Warranty: dense line-item editors still use horizontal scroll (not full card UIs)
- Accounts report tables beyond GSTR may still need summary cards
- Landscape phones: usable, not specially tuned
- Some intentional 2-col metric strips stay 2-up by design
- Offline Mobile / Capacitor APK must be rebuilt to pick up client CSS/layout changes
- Full visual QA on physical iOS/Android still recommended
- Automated coverage: Vitest gates target `server/utils` + `server/services` — UI/CSS changes are covered by manual cases in `tests/cases/cloud-mobile.md`

## 7. Review follow-ups (post #77)

| Finding | Severity | Fix |
|---------|----------|-----|
| Chat full-screen could not be dismissed | High | Header close + Escape |
| Invoice mobile cards nested `role=button` around action buttons | Medium | Summary is a `<button>`; actions are siblings |
| No mobile automated tests | Low | Knowledge cases + Escape contract unit test |

---

## Rules honored

- Desktop visual design preserved (`lg:` / `sm:` gates + media-query CSS)
- No API or business-logic changes
- No new design system / branding change
- Cloud-focused (tenant + SA + public pages)
