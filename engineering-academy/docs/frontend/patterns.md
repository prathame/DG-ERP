---
title: Frontend Patterns
description: The conventions — hooks, styling, error handling, TypeScript idioms, and code-review culture — that repeat across all 18 feature modules.
---

# Frontend Patterns

If you read five feature modules in `src/features/`, you'll notice the same handful of conventions again and again. This document names them explicitly so the sixth module you read (or write) is recognizable on sight.

## 1. `cn()` — the one styling primitive

```42:44:src/lib/utils.ts
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

Every conditional class list in the codebase — `className={cn('base-classes', active && 'text-brand', isSidebarOpen ? 'w-60' : 'w-16')}` — goes through this one function. `clsx` handles the conditional joining (falsy values drop out); `twMerge` then resolves Tailwind class **conflicts** (e.g., if both `'p-2'` and a later `'p-4'` end up in the list, `twMerge` keeps only the winning one instead of shipping both to the DOM, which is what plain string concatenation would do and which would produce inconsistent, order-dependent CSS results). There is no CSS-in-JS, no styled-components, no CSS modules — Tailwind utility classes plus `cn()` is the entire styling system.

## 2. Small, composable hooks instead of a hooks framework

`src/hooks/` has exactly two files, and `src/lib/useEscapeKey.ts` a third — all three are under 30 lines:

```7:15:src/hooks/useConfirm.tsx
export function useConfirm() {
  const [state, setState] = useState<ConfirmOpts | null>(null);
  const resolveRef = useRef<((v: boolean) => void) | null>(null);
  const confirm = useCallback((opts: ConfirmOpts | string): Promise<boolean> => {
    const o = typeof opts === 'string' ? { message: opts } : opts;
    setState(o);
    return new Promise(resolve => { resolveRef.current = resolve; });
  }, []);
  ...
  return { confirm, ConfirmRenderer };
}
```

`useConfirm` is worth studying closely: it turns an **imperative confirmation dialog** into something that reads like `await`-able code —

```tsx
const { confirm, ConfirmRenderer } = useConfirm();
async function handleDelete() {
  if (!(await confirm({ message: 'Delete this vendor?', variant: 'danger' }))) return;
  await api.vendors.delete(id);
}
// ...
return <>{/* ... */}<ConfirmRenderer /></>;
```

— by wrapping a `Promise`'s `resolve` function in a ref and calling it from the dialog's `onConfirm`/`onCancel` callbacks. This is the standard React trick for bridging "a UI event happens later" with "the calling code wants to `await` a boolean answer right where it asked the question," and it means a delete handler can read top-to-bottom as a single async function instead of being split across an `onClick` and a separate `onConfirmDialogAccept` callback.

`useDebounce` and `useEscapeKey` are equally minimal — one `useEffect`, one `setTimeout`/event-listener, one cleanup function. There is no dependency like `usehooks-ts` or `react-use` providing dozens of pre-built hooks; the project writes exactly the ones it needs, each small enough to read in ten seconds.

## 3. Defensive-by-default: `try/catch` around anything environment-dependent

This pattern appears dozens of times across the frontend, and it's worth naming because it's not accidental — it's a direct consequence of [overview.md](./overview.md)'s "one codebase, three platforms" reality:

```242:249:src/App.tsx
const [collapsedSections, setCollapsedSections] = useState<Set<string>>(() => {
  try {
    const s = localStorage.getItem('dg_nav_collapsed');
    return s ? new Set(JSON.parse(s)) : new Set();
  } catch {
    return new Set();
  }
});
```


> [!NOTE]
| **Why so much defensive `try/catch`?** `localStorage` can throw (Safari private mode, storage quota exceeded, a corrupted value that fails `JSON.parse`). `window.electronAPI` may not exist outside Electron. Rather than gate every such access behind an explicit platform check everywhere it's used, the convention is: **wrap the access, catch failure, fall back to a safe default, keep rendering.** A crashed `useState` initializer would break the entire component tree (see [app-shell.md](./app-shell.md)'s `ErrorBoundary` discussion — but that only catches *render* errors, not initializer-time throws before the first render even starts). This pattern is cheap insurance against the long tail of "this works on my machine/browser/platform but not that one."

## 4. Bug-fix comments are left in the code, not just in git history

Search the codebase for `// H1`, `// H3`, `// H10`, `// P0`, `// P1`, `// P2`, `// M2`, `// M6`, `// C9` — these are audit-tracking IDs, and the fix is annotated **inline**, permanently:

```429:436:src/App.tsx
    if (role === 'Vendor')
      return ['analytics', 'dashboard', 'distribution', 'finance'].includes(tabId) ? 'view' : 'hidden';
    // H10 fix: unknown role gets no access (was incorrectly returning 'full')
    return 'hidden';
```

```7:11:server/pg-db.ts
// Set tenant context on a connection for RLS (P2 fix)
// Use true = transaction-local (resets after COMMIT/ROLLBACK)
export async function setTenantContext(client: import('pg').PoolClient, tenantId: string) {
```

> [!IMPORTANT]
> **Why leave these comments in permanently instead of relying on `git log`/`git blame`?** A `git blame` requires someone to think to look. An inline comment is seen by every future reader of that exact line, at the exact moment they might be tempted to "simplify" or refactor it back to the vulnerable version. For a security-relevant fix specifically (H10 was a privilege-escalation bug — an unknown role defaulting to full access), this is a deliberate guardrail: the comment documents not just *what* the code does but *what it must never regress to*, right where a future edit is most likely to happen.

## 5. `// ponytail:` comments — a documented anti-over-engineering discipline

```39:39:src/features/masters/MastersView.tsx
useEffect(() => { refreshCounts(); }, []); // ponytail: fetch once on mount, not on every selectedMaster change
```

```1:1:src/lib/hsnRates.ts
// ponytail: curated ~100 HSN + ~30 SAC codes covering >95% of Indian SME invoicing
```

```303:303:src/components/layout/LandingPage.tsx
// Testimonial auto-advance — ponytail: 4000ms (spec says 1500 but too fast to read)
```

These comments are the visible trace of a **code-review process explicitly aimed at catching over-engineering** — unnecessary abstractions, premature generalization, dependency creep, effects that re-run more often than needed. Each `// ponytail:` comment documents a moment where the simpler option was deliberately chosen over a more "complete" one, and — like the H10 comment above — is left in place so a future contributor understands *why* the code looks under-engineered rather than assuming it's an oversight to "improve." The `hsnRates.ts` example is a good illustration of the philosophy: rather than trying to ship a complete, always-current database of every Indian HSN/SAC tax code (a real but low-value completeness goal for an SME tool), the file ships a curated ~130 codes covering the vast majority of real invoices, with the comment making the scope decision explicit.

## 6. Named exports + the `.then(m => ({ default: m.X }))` lazy-loading idiom

Every component in `features/` and most of `components/layout/` uses a **named export** (`export function SalesEntryView(...)`), never `export default`. Combined with `React.lazy`, which requires a default export, this produces the repeated idiom seen throughout `App.tsx` (see [app-shell.md](./app-shell.md)):

```tsx
const SalesEntryView = lazy(() => import('./features/sales/SalesEntryView').then(m => ({ default: m.SalesEntryView })));
```

Named exports are chosen over default exports for two practical reasons that show up constantly in a large codebase: they make **grep/"find references" tooling reliable** (a default export can be locally renamed to anything at the import site; a named export cannot), and they make it structurally impossible to accidentally import the wrong thing from a file with multiple exports.

## 7. Permission/role props threaded explicitly, not inferred from context

Notice how many feature views take an explicit `accessLevel` or `user` prop (`InventoryView({ accessLevel })`, `SalesEntryView({ user })`, `VendorFinanceView({ user, accessLevel })`) rather than reading a global "current user" Context inside the component. This is a direct consequence of there being **no global state store** (see [session-state.md](./session-state.md)) — `App.tsx` computes `getAccess(tabId)` once, in one place, and passes the *result* down as a prop, rather than every feature view independently re-deriving permission logic from a shared Context. The benefit: a feature component's permission behavior is visible in its own prop signature and testable by simply passing different prop values, without needing to mock a Context provider.

## 8. `Record<string, unknown>` casting at API boundaries

```349:352:src/App.tsx
const userConfig = user as Record<string, unknown>;
const tabConfig = (userConfig?.tabConfig ?? {}) as Record<string, { label?: string; visible?: boolean }>;
```

The `user` object's shape has grown organically over the product's life (see the two permission formats discussed in [app-shell.md](./app-shell.md)) — rather than maintaining one giant, precisely-typed `User` interface that every new optional field must be threaded through, the codebase frequently reaches for a targeted `as Record<string, unknown>` cast at the point where a loosely-typed field (like tenant-specific `tabConfig` JSON) needs to be read, then narrows it with an inline type assertion for just that access. This is a pragmatic trade-off, not a best practice to imitate uncritically: it sacrifices some compile-time safety for the flexibility of a data model that's genuinely semi-structured (tenant-configurable JSON columns from the database — see [../security/tenant-isolation.md](../security/tenant-isolation.md)).

## 9. `motion` used sparingly, for state transitions — not everywhere

`motion` (imported as `from 'motion/react'`) is reserved for feature views and a few heavy one-shots (`AppShutterIntro`, `ConfirmDialog`, `AppModal`) — places where enter/exit orchestration is hard to express in CSS. Shell chrome (Toast, account menu, command palette, sidebar drawer) uses CSS transitions/keyframes instead so Cap cold start does not download `vendor-motion` until a feature that needs it loads. Prefer CSS for opacity/transform fades; reach for `motion` only when you need staggered children, exit-before-unmount, or gesture-driven animation (see [../performance/bundle.md](../performance/bundle.md)).

## 10. Print/export as pure functions, not components

`src/lib/utils.ts` holds a cluster of functions — `formatSalesInvoiceText`, `formatDistributionChallanText`, `openPrintWindow`, `printBillInWindow`, `downloadHtmlAsPdf`, `saveBillAsPdf`, `exportToCsv` — that are plain functions taking data and returning strings or performing side effects (opening a window, triggering a download), not React components. Exporting a bill is fundamentally an **imperative, one-shot action** (build HTML, render PDF, download/share), and modeling it as functions rather than forcing it through component render cycles keeps that imperative code honest about what it is, while still being easily called from any feature view's button handler.

> [!TIP]
> Offline Mobile / Capacitor cannot use `window.open` or `window.print()`. Callers still open a sync prep overlay via `openPrintWindow()` before `await`, then `printBillInWindow` shows the bill HTML in that overlay — download/share runs only when the user taps **Download PDF** (`downloadHtmlAsPdf`). `saveBillAsPdf` still downloads immediately (intentional Save-as-PDF actions). Desktop browsers keep the classic print-window path.

## 8. Phone presentation vs Offline runtime

| Helper | Use for |
|--------|---------|
| `isServicePhoneUx(businessType)` | Shared Emergent phone IA: bottom nav, Masters pill set, dense hubs, PDF download affordances, global search → Price List |
| `isServiceMobileMode()` | Offline-only: PGlite, Sync Now, demo seed, Show Accounts, advances, license/heartbeat |

Online Service Cloud Capacitor (`businessType=service`) shares the first; it must **not** get the second. Seat lock stays on `ServiceCloudGate` either way. See [Cloud Mobile UX](./cloud-mobile.md).

## Quiz

1. Why does `useConfirm` return a `Promise<boolean>` from `confirm()` instead of accepting an `onConfirm`/`onCancel` callback pair directly?
2. What is the practical difference between fixing a bug silently and fixing it with an inline `// H10 fix:` comment, from the perspective of a future contributor reading that code six months later?
3. Give one reason `motion` is deliberately *not* used for every hover-state transition in the app.

<details>
<summary>Answers</summary>

1. So the calling code can `await` the user's decision and continue executing top-to-bottom (`if (!(await confirm(...))) return;`) instead of splitting delete-flow logic across two separate callback functions — it makes an inherently asynchronous UI interaction read like synchronous control flow.
2. Silently fixing it leaves no signal to a future contributor about why the code is written the "unobvious" way — they might refactor it back to the buggy version believing they're simplifying or improving it. The inline comment turns the fix into a permanent, self-documenting guardrail exactly where a regression is most likely to be introduced.
3. `motion` is one of the heavier dependencies in the bundle, isolated into its own vendor chunk specifically so it only loads when actually needed; using it for something as frequent and low-stakes as hover states would mean paying its runtime/bundle cost for a UX benefit plain CSS `transition` classes already deliver for free.

</details>

## Related reading

- [App Shell](./app-shell.md) and [UI Kit](./ui-kit.md) — where several of these patterns are demonstrated at length.
- [Cloud Mobile UX](./cloud-mobile.md) — safe areas, modal clamp, phone cards vs desktop tables (responsive, not mobile-first).
- [Session & State](./session-state.md) — why permission props are threaded explicitly instead of read from a global store.
- [../performance/bundle.md](../performance/bundle.md) — the chunking consequences of the `motion`/dynamic-import patterns described here.
