---
title: Frontend Performance
description: React rendering discipline, selective Motion usage, and lazy-loaded feature tabs.
---

# Frontend Performance

The frontend's performance story is dominated by one structural decision — **lazy loading every feature tab** — plus a handful of smaller, deliberate choices about when to reach for animation and when not to.

## Lazy tabs — the single biggest win

```43:94:src/App.tsx (abridged — actual file)
const DashboardView = lazy(() => import('./features/dashboard/DashboardView').then(m => ({ default: m.DashboardView })));
const SalesEntryView = lazy(() => import('./features/sales/SalesEntryView').then(m => ({ default: m.SalesEntryView })));
const InventoryView = lazy(() => import('./features/inventory/InventoryView').then(m => ({ default: m.InventoryView })));
// ... every one of the ~18 feature views follows this pattern
```

Every business module — Sales, Inventory, Distribution, Accounts, Payroll, and so on — is its own `React.lazy()`-wrapped import. This means a user who logs in and only ever touches the Dashboard and Sales tabs **never downloads the JavaScript for Payroll, GSTR reconciliation, or the Super Admin views at all**. Combined with Vite's automatic code-splitting (each `import()` call becomes its own chunk), the *initial* JS payload is limited to the app shell (`App.tsx`, routing, session, i18n bootstrap) plus whichever tab loads first — not all eighteen feature modules concatenated together.

> [!NOTE]
> **Why this matters more here than in a typical SaaS dashboard:** most Dhandho tenants are small businesses that use maybe 4-6 of the 13 available modules regularly (a pure retailer never touches Distribution's vendor-batch tracking; a pure distributor never touches Sales Entry's barcode scanning flow). Lazy-loading means each tenant effectively only pays the download cost for the modules *they* use, even though the codebase ships all of them.

Each lazy view is wrapped in `<Suspense fallback={<LoadingSpinner />}>` and an `<ErrorBoundary key={tabKey}>` — covered in depth in [../frontend/app-shell.md](../frontend/app-shell.md) — so a slow chunk download shows a spinner rather than a blank screen, and the `key={tabKey}` forces a full remount (and therefore a fresh `Suspense` boundary) every time the active tab changes, rather than the same component instance being reused across unrelated tabs.

## Selective `motion` usage — animate meaning, not everything

The `motion` library (Framer Motion's successor) is used for things like Toast enter/exit transitions and dropdown/modal open animations — moments where an animation communicates a state change (something appeared, something is being dismissed) — but is deliberately **not** wrapped around every hover effect or list item, which are instead handled with plain Tailwind CSS transition utilities (`transition-colors`, `hover:bg-...`).

> [!IMPORTANT]
> **Why this split, specifically?** `motion` itself is a meaningfully large dependency (isolated into its own `vendor-motion` chunk — see [Bundle](./bundle.md) — specifically *because* of its size). Using it for every micro-interaction would mean (a) more JS execution on every hover/interaction, which matters on lower-end devices, and (b) it's simply unnecessary — a CSS `transition` property is handled by the browser's compositor, essentially free, for simple property animations like color or opacity. `motion` earns its cost specifically for animations that need orchestration (staggered children, exit animations before unmount, gesture-driven interactions) that CSS alone can't express cleanly.

## Rendering discipline

A few patterns recur across `features/*` views that keep re-renders in check without reaching for heavier tools:

- **Explicit prop-threading over Context for permissions** (`InventoryView({ accessLevel })` rather than a `usePermissions()` context hook) — documented in depth in [../frontend/patterns.md](../frontend/patterns.md). A side effect of this choice is that a permission change doesn't trigger a Context re-render cascade across every consumer; only the components that were actually passed the changed prop re-render.
- **`React.memo` and `useMemo`/`useCallback` used pragmatically, not reflexively** — applied where a component genuinely re-renders often with unchanged props (large lists, table rows rendered per-SKU in Inventory), not as a blanket default across every component, which would add memoization overhead without a corresponding benefit for components that render rarely.
- **Debounced search inputs** (`useDebounce`, [../frontend/patterns.md](../frontend/patterns.md)) — `SearchSelect` and list-filtering inputs debounce keystrokes before triggering an API call or client-side filter pass, preventing a re-render (and, for server-backed search, a network request) on every single keystroke.

## Perceived performance over raw speed

- **`LoadingSpinner`/`Skeleton` components** — used deliberately even for requests that usually resolve quickly, because an instantly-replaced blank flash is often perceived as *more* jarring than a brief, intentional loading state. This is a UX call as much as a performance one: consistent loading affordances build user trust that the app is "doing something," not frozen.
- **Optimistic UI is intentionally rare** — most mutations wait for the server response before updating the UI (rather than assuming success and rolling back on failure), a conservative trade-off appropriate for financial/inventory data where showing an optimistic state that later needs to be *reversed* (a sale that failed due to a stock conflict) is worse for user trust than a slightly-delayed but always-correct UI.

## Quiz

1. Why does lazy-loading every feature view matter more for Dhandho's specific user base than it might for a typical enterprise SaaS dashboard?
2. Why is `motion` used for a Toast's enter/exit animation but not for a button's hover-color change?
3. What's the trade-off being made by generally avoiding optimistic UI updates in this codebase?

<details>
<summary>Answers</summary>

1. Because most individual tenants only regularly use a subset of the 13+ available business modules — lazy loading means each tenant's initial download cost scales with the modules *they* actually use, not the full breadth of functionality the codebase supports across all possible business types. This matters especially given the target users' often-constrained devices and mobile connectivity.
2. A Toast's enter/exit is a state transition that benefits from `motion`'s ability to orchestrate an exit animation *before* the component unmounts (plain CSS can't easily animate something that's about to be removed from the DOM). A hover color change is a simple property transition the browser's compositor already handles efficiently via CSS — reaching for `motion`'s JS-driven animation engine there would add unnecessary execution cost for no visible benefit.
3. The trade-off is showing users a small, deliberate delay (waiting for server confirmation) in exchange for never having to show a "never mind, that actually failed" reversal — which is especially important for financial/inventory actions like sales or stock adjustments where a false-positive success state could lead to confusion about whether a transaction actually went through.

</details>

## Related reading

- [Bundle](./bundle.md) — how lazy chunks are structured and gated by CI.
- [../frontend/app-shell.md](../frontend/app-shell.md) — `Suspense`/`ErrorBoundary` mechanics around lazy tabs.
- [../frontend/patterns.md](../frontend/patterns.md) — prop-threading and custom hooks referenced above.
- [Bottlenecks](./bottlenecks.md) — known frontend slow paths.
