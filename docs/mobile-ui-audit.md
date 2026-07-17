# Mobile UI Audit Report

Date: 2026-07-17  
Scope: Improve phone usability (320–430px) without redesigning desktop or changing business logic/APIs.

## 1. Audit summary

The tenant shell already had bottom nav, drawer sidebar, and partial safe-area helpers. Gaps were: missing `.app-header-safe` styles (addressed earlier), Super Admin permanently stealing width with a desktop sidebar, bare tables clipping on phones, modals taller than the viewport, hover-only actions, and form grids that stayed 2–4 columns inside overlays.

## 2. Responsive issues found

| Area | Issue |
|------|--------|
| Shell | Status bar / notch overlap; bottom nav covering content |
| Super Admin | Fixed `ml-64` sidebar on all viewports — content squeezed on phones |
| Tables | Invoices, Service Mobile, Settings permissions, Accounts GSTR, Finance bank match — no scroll / no cards |
| Modals | Width clamped but no `max-height` / overflow on many overlays |
| Forms | `grid-cols-2/3/4` inside modals cramped at 320px |
| Touch | Icon `p-1` / `p-1.5` actions; Sales actions `opacity-0` until hover |
| Marketing | Landing nav missing safe-area; tiny language chips |
| SA login | `min-h-screen`, no safe-area |

## 3. Files modified

- `src/index.css` — modal max-height, form grid stack, table scroll via `:has()`, touch targets, overflow clip
- `src/App.tsx` — settings nav 44px touch target
- `src/features/super-admin/SuperAdminApp.tsx` — mobile drawer + desktop rail preserved
- `src/features/super-admin/SuperAdminLogin.tsx` — `100dvh` + safe-area
- `src/features/super-admin/ServiceMobileView.tsx` — horizontal table scroll
- `src/features/invoices/InvoicesView.tsx` — mobile card list; desktop table unchanged
- `src/features/sales/SalesEntryView.tsx` — always-visible actions on small screens
- `src/features/accounts/AccountsView.tsx` — GSTR table overflow wrappers
- `src/features/finance/VendorFinanceView.tsx` — bank match table overflow
- `src/features/settings/SettingsView.tsx` — permissions table overflow
- `src/components/layout/LandingPage.tsx` — safe-area nav/hero; larger lang chips
- `src/platforms/service-mobile/ServiceMobileOnboarding.tsx` — (prior) safe-area setup
- `src/components/layout/DownloadPage.tsx` — (prior) safe-area
- `tests/cases/service-mobile.md` — safe-area case
- `engineering-academy/docs/deployment/service-mobile.md` — safe-area note
- `docs/mobile-ui-audit.md` — this report

## 4. Mobile improvements applied

- Safe areas for header, bottom nav, onboarding, landing, SA login/app
- Super Admin off-canvas drawer below `lg`; desktop sidebar behavior kept
- Invoices: card UI under `sm`, table from `sm` up
- Global modal fit (`max-height` + scroll) for `max-w-sm`…`max-w-4xl`
- Overlay form grids stack to one column under `lg`
- Bare card tables get horizontal scroll under `lg`
- 44px min hit area for dense icon buttons on phones
- Hover-only row actions visible on phones

## 5. Before vs after

| Before | After |
|--------|--------|
| Header under status bar | `.app-header-safe` clears notch |
| SA panel unusable on phone | Full-width content + drawer menu |
| Invoice table clipped | Cards on phone; scrollable table on tablet+ |
| Tall modals clipped | Scrollable within ~90dvh |
| Sales actions invisible on touch | Visible below `sm` |
| Landing under notch | Safe-area padding on nav + hero |

## 6. Remaining mobile issues

- Distribution / Purchases / Quotations / Warranty: dense line-item tables still use horizontal scroll (not full card UIs)
- Accounts report tables beyond GSTR sections may still need card summaries
- Landscape tablets: mostly OK; not specially tuned
- Some `grid-cols-2` metric strips stay 2-col by design — rare non-metric 2-col forms in content may still feel tight
- Offline Mobile APK must be rebuilt to pick up client CSS/layout changes

## Rules honored

- Desktop visual design preserved (`lg:` / `sm:` gates)
- No API or business-logic changes
- No new design system / branding change
