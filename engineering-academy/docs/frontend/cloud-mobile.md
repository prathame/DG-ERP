---
sidebar_label: Cloud Mobile UX
title: Cloud Mobile UX (Responsive, Not Mobile-First)
description: How the cloud tenant app and Super Admin stay usable on phones (320–430px) without redesigning desktop.
---

# Cloud Mobile UX

:::note Scope
This is the **cloud** SPA / Electron Cloud / SA panel on a phone browser (or online Capacitor shell). It is **not** Offline Service Mobile (`DG-SM` / PGlite). Do not mix the two products.
:::

## Goals

| Do | Don't |
|----|--------|
| Fix overflow, safe areas, touch targets, modal fit | Redesign desktop layouts |
| Stack / wrap under `sm` / `md` / CSS media queries | Make the product mobile-first |
| Keep business logic and APIs unchanged | Invent a second design system |

Target phones: **320–430px**. Desktop (≥1024) should look as before.

## Where the rules live

| Layer | Location | What it does |
|-------|----------|--------------|
| Global CSS | `src/index.css` | `--safe-top` / `--safe-bottom`, `.app-header-safe`, modal max-width through `max-w-7xl` + `max-height`, overlay grids stack, table `:has()` scroll, 44px icon hits |
| Tenant shell | `src/App.tsx` | Drawer sidebar on small screens, bottom tab bar + `.safe-bottom`, `.app-mobile-content` padding |
| Super Admin | `src/features/super-admin/SuperAdminApp.tsx` | Off-canvas drawer below `lg`; desktop rail unchanged |
| Shared dialog | `src/components/ui/ConfirmDialog.tsx` | Bottom sheet on phones + Escape |
| Chat | `src/components/layout/ChatWidget.tsx` | Full-screen on phone; **close + Escape** required |
| Feature views | `src/features/**` | `sm:hidden` cards vs desktop tables; `overflow-x-auto` on line-item tables; `max-h-[90vh] overflow-y-auto` on tall modals |

Audit trail (PRs #76 / #77 / #78): repo-root `docs/mobile-ui-audit.md`.

## Patterns to copy

### Safe areas

```css
:root {
  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
.app-header-safe {
  padding-top: max(0.625rem, var(--safe-top));
}
```

`index.html` already sets `viewport-fit=cover`. Full-screen overlays (chat, drawers, sheets) must pad with `env(safe-area-inset-*)` themselves.

### Desktop table + phone cards

```tsx
{/* Phone */}
<div className="sm:hidden space-y-3">{/* cards */}</div>
{/* Desktop */}
<div className="hidden sm:block overflow-x-auto">
  <table className="w-full min-w-[640px]">…</table>
</div>
```

**A11y:** do not put `role="button"` on a card that also contains action `<button>`s. Make the summary a `<button type="button">` and keep actions as siblings (see Invoices).

### Modals

Prefer:

```tsx
className="… w-full max-w-3xl max-h-[90vh] overflow-y-auto"
```

Global CSS under `max-width: 1023px` also clamps `.fixed.inset-0 .max-w-*` (through `max-w-7xl`) to `calc(100vw - 1.5rem)` and a ~90dvh max height.

### Escape to close

Use `useEscapeKey(onClose, open)` from `src/lib/useEscapeKey.ts` for full-screen mobile panels (chat, large sheets). Unit contract: `tests/unit/useEscapeKey.test.ts`.

## Service phone UX (shared Emergent IA)

Online **Service Cloud Capacitor** with `businessType=service` shares the Emergent phone shell with Offline Mobile. Gate helper:

```ts
// src/platforms/service-cloud/mode.ts
isServicePhoneUx(businessType) // true for Offline Mobile OR (Capacitor cloud + businessType=service)
```

| Shared when `isServicePhoneUx` | Stays Offline-only (`isServiceMobileMode`) |
|--------------------------------|--------------------------------------------|
| Bottom nav: Analytics · Masters · Invoice · Quotes · More | Sync Now / hard sync / SA force-sync |
| Masters pills: Clients + Prices (no Products / Vendor-Customer Map) | Demo electrician seed, PGlite, local backup |
| Dense hubs, PDF download affordances, global search → Price List | Show Accounts toggle, client advances API |
| Invoice/Quote phone density; Analytics net-in + hide Master Summary | License activate / heartbeat |
| Bill settings: hide Challan / Barcode / Warranty; HSN opt-in | — |

**Online Cap only:** `ServiceCloudLiveBadge` (“Live · Online”) in the sidebar — **no Sync**. Cloud Electron desktop chrome is unchanged.

**`ServiceCloudGate`** wraps Cap Online + Cloud Electron for any cloud business type (browser skipped). Service tenants get company-wide session lock (“In use”); non-service get device claim only (multi-user). Phone IA does not relax seats. No internet → frozen (online-only). Non-service Cap Online nav is filtered by SA `mobile_features`.

Do **not** use `isServicePhoneUx` for PGlite, Sync, license, or demo seed — those stay Offline-only.

## Manual QA

`tests/cases/cloud-mobile.md` — notch, bottom nav, SA drawer, invoice cards, chat dismiss, confirm sheet, table overflow, touch targets, Service phone IA (#16–19).

## Coverage note

Vitest gates (`server/utils`, `server/services`) do **not** cover CSS/layout. Helper + nav: `tests/unit/service-phone-ux.test.ts`, `tests/unit/global-search-nav.test.ts`. Treat Knowledge Center cases as the release gate for phone regressions.

## Related

- [App Shell](/frontend/app-shell)
- [Platforms](/frontend/platforms)
- [Frontend Patterns](/frontend/patterns)
- [Service Cloud Seats](/deployment/service-cloud) (online product)
- [Service Mobile](/deployment/service-mobile) (offline product — separate)
- [E2E / manual cases](/testing/e2e)
