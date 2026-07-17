---
sidebar_label: src/lib/*
title: File Walkthrough — src/lib/
App.ts, useEscapeKey.ts.
---

# File Walkthrough — `src/lib/`

## Purpose & business value

`src/lib/` holds cross-cutting frontend utilities that don't belong to any one feature and aren't platform-abstraction code (that's `platforms/`). Business value varies per file, but the common thread: each one centralizes a piece of logic that would otherwise be duplicated (and drift) across multiple feature folders.

## File-by-file

### `session.ts` — auth session storage

Owns where the JWT and current tenant context live client-side (typically `localStorage`/`sessionStorage`, wrapped behind functions rather than direct storage calls scattered around). This is the file `api.ts` calls into to get auth headers for every request, and the file `App.tsx` checks to decide whether to show the login screen. **This is the client-side half of the auth story** — the server-side half is [`middleware/auth.ts`](/files/server/middleware-auth). If a user reports being unexpectedly logged out, and the server-side reasons (JWT expiry, password change, tenant suspension — see [Runbook: Auth Failures](/runbooks/auth-failures)) don't explain it, check whether something is clearing `session.ts`'s storage unexpectedly (e.g. a browser privacy setting clearing `localStorage`, or a bug in a "clear cache" feature).

### `businessTypeConfig.ts` — the feature-flag-via-config pattern

Maps a tenant's business type (set at signup/provisioning) to a config object controlling labels, visible tabs, and default behavior — see [Mental Models → business type as a feature flag](/tutorials/mental-models) for the full reasoning. This file is the client-side half of that pattern (the server-side half is the default `tab_config` set in `provisionTenant` — see [`tenant.ts`](/files/server/utils)).

### `billTemplates.ts` — invoice/bill rendering templates

Template logic for generating the actual bill/invoice HTML or PDF layout shown to customers — kept separate from the feature views that trigger bill generation (sales, distribution, invoices) so the same template logic is reused consistently rather than each feature rolling its own bill layout.

### `hsnRates.ts` — GST HSN code / tax rate reference data

Reference data mapping HSN (Harmonized System of Nomenclature) codes to applicable GST rates — used wherever the frontend needs to suggest or validate a tax rate for a product, complementing the backend's GST logic ([`nic-api.ts`](/files/server/services)) with client-side convenience lookups (not a source of truth for actual tax calculation, which happens server-side).

### `utils.ts` — the `cn()` helper and small pure functions

Most notably exports `cn()` (className merging, the standard Tailwind/clsx pattern) used throughout `components/ui` and every feature view for conditional styling.

 lifecycle glue

 app-shell behavior, not the DG-ERP-specific onboarding/sync/offline logic that lives in `platforms/`.

### `useEscapeKey.ts` — a small reusable hook

A `useEffect`-based hook for closing modals/dialogs on Escape key press — small enough to be a one-file utility rather than living in `components/ui`, but genuinely shared across many modal components.

### `offline/` — cache, queue, network (mobile)

Note: there is a `src/lib/offline/` directory in addition to `src/
## Common mistakes

1. Reaching directly into `localStorage`/`sessionStorage` from a feature component instead of going through `session.ts` — breaks the single point of control for session lifecycle (logout, token refresh, tenant switching).
2. Duplicating `businessTypeConfig.ts` logic inline in a feature view instead of importing the shared config — leads to a specific business type's labels/behavior drifting inconsistently across features.
3. Hardcoding a GST rate in a feature component instead of referencing `hsnRates.ts` — creates a second source of truth that can silently go stale relative to actual tax law changes.

## Related pages

- [`src/api.ts`](/files/frontend/api)
- [Runbook: Auth Failures](/runbooks/auth-failures)
- [Mental Models: business type as feature flag](/tutorials/mental-models)
- [Glossary: India GST Terms](/glossary/india-gst-terms)
