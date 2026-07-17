---
sidebar_label: API Client
title: src/api.ts — fetchApi(), the One Door to the Backend
description: Caching, retries, offline queueing, and 401/403 handling — how every frontend feature talks to the Express API through a single function.
---

# `src/api.ts` — `fetchApi()`, the One Door to the Backend

:::tip The rule every feature follows
No component ever calls `fetch()` directly. Every network call — across all 19 feature modules — goes through `fetchApi<T>(path, options)`. This is what makes offline support, caching, and auth headers *consistent* instead of reimplemented 19 times.
:::

## 1. The full decision tree

```mermaid
flowchart TD
  Start[fetchApi(path, options)] --> Method{method}
  Method -->|GET| CacheCheck{In-memory cache hit within 3s?}
  CacheCheck -->|yes| ReturnCached[Return cached data — no network call]
  CacheCheck -->|no| Continue1[Continue]
  Method -->|mutation| Invalidate[Invalidate in-memory + offline cache for this path segment]
  Invalidate --> Continue1
  Continue1 --> Headers[Attach Authorization + X-Tenant-ID from session]
  Headers --> Resolve[resolveApiUrl - same-origin or absolute cloud URL]
  Resolve --> OfflineCheck{Mobile client AND offline?}
  OfflineCheck -->|yes, GET + cacheable path| OfflineCacheHit[Return durable offline cache]
  OfflineCheck -->|yes, mutation| Queue[enqueueOfflineMutation + throw 'queued' error]
  OfflineCheck -->|no| Fetch[fetch with retries]
  Fetch --> Handle[handleResponse]
  Handle --> Status401{401?}
  Status401 -->|yes, not an auth endpoint| ClearRedirect[Clear session, redirect to /slug]
  Status401 -->|no| Status403{403 with 'suspended'/'deleted'?}
  Status403 -->|yes| AlertRedirect[alert + clear session + redirect]
  Status403 -->|no| OkCheck{res.ok?}
  OkCheck -->|no| ThrowErr[throw Error with server's error message]
  OkCheck -->|yes| CacheAndReturn[Cache GET result, return data]
```

## 2. GET caching — two layers, two lifetimes

| Cache | Lifetime | Storage | Purpose |
|---|---|---|---|
| In-memory `getCache` Map | **3 seconds** | JS heap (`getCache.set(...)`) | Prevents duplicate fetches when a user rapidly switches tabs back and forth — not a "real" cache, just debouncing |
| Durable offline cache (`cacheGet`/`cacheSet`) | Until explicitly invalidated | `src/lib/offline/cache.ts` (persisted) | Lets specific whitelisted GETs (`CACHEABLE_GET` regex list: `/products`, `/vendors`, `/tenant/...`) serve stale-but-useful data when the mobile app is genuinely offline |

Both caches are keyed by `${tenantId}:${path}` — this matters because switching tenants (e.g. Super Admin impersonating a different tenant) must never serve one tenant's cached data under another tenant's session.

## 3. Cache invalidation on mutation

```ts
if (method !== 'GET') {
  const segment = path.split('/')[1] || '';
  invalidateCache(segment);          // in-memory
  cacheInvalidateForApiPath(path);   // durable offline cache
}
```

Invalidation is **coarse** — it clears by the first path segment (`/products/123` invalidates everything cached under `products`), not by exact path. This is a deliberate simplicity trade-off: correctness (never serve stale data after a write) over precision (only invalidate exactly what changed). Given the 3-second in-memory TTL is already short, over-invalidating costs at most a few redundant re-fetches.

## 4. Retry policy — safe methods get more chances

```ts
const isSafeRetry = method === 'GET' || method === 'HEAD';
const MAX_RETRIES = isSafeRetry ? 3 : 2;              // mutations: initial + 1 retry only
const RETRY_DELAY_MS = isSafeRetry ? [800, 1600, 3000] : [800];
```

Retries **only** trigger on `TypeError` (a genuine network failure — DNS, connection refused, offline) — never on 4xx/5xx HTTP responses, which are treated as the server having successfully answered (even if the answer is "no"). Mutations get **one** retry, not three, specifically to reduce the risk of double-submitting a create/update if the first attempt actually succeeded server-side but the response never made it back to the client (a classic "did my request actually go through" problem inherent to at-most-once vs. at-least-once delivery trade-offs — Dhandho picks a middle ground rather than full idempotency keys).

## 5. Offline queueing — mobile-only, and why

```ts
// Offline queue/cache is mobile-only (Capacitor / VITE_MOBILE) — not desktop Electron/web
if (isMobileClient() && !getConnectionState().connected) { ... }
```

Desktop Electron and the web app are assumed to have a reasonably reliable connection (an office/shop with wifi/broadband) — only the **mobile** surface, used by field/dealer staff who might be in a warehouse basement or a delivery van, gets the full offline-first treatment: cacheable GETs served from durable storage, and mutations enqueued via `enqueueOfflineMutation()` (see `src/lib/offline/queue.ts`) to sync automatically once connectivity returns.

## 6. 401 handling — global, automatic session teardown

```ts
if (res.status === 401 && !isAuthEndpoint && session.getToken()) {
  const slug = session.getSlug() || pathSlugFromUrl;
  session.clearAll();
  window.location.href = redirectSlug ? `/${redirectSlug}` : '/';
  return new Promise(() => {}) as T;  // never resolves — the redirect is happening
}
```

Any 401 from any endpoint (except the login/signup/reset endpoints themselves, which legitimately return 401 for "wrong password" without meaning "your session expired") triggers an **immediate, global** logout — clear localStorage, hard-redirect to the tenant's slug login page. The `return new Promise(() => {})` is a deliberate never-resolving promise: since the page is about to navigate away entirely, there's no meaningful value to return to the caller, and this avoids a confusing "success" or "undefined" flowing into whatever `.then()` chain was waiting.

## 7. 403 handling — a special case for account-level lockouts

A 403 whose error message contains `"suspended"` or `"deleted"` gets the same clear-and-redirect treatment as a 401, **plus a blocking `alert()`** — because this specific 403 means "your entire account/tenant is gone," which deserves an explicit user-facing message, not a silent redirect that might look like a random glitch. Any *other* 403 (e.g. a permission-denied from `enforceModulePermissions`) is just thrown as a normal `Error` for the calling component to catch and display inline.

## 8. What every feature component actually writes

```ts
const products = await fetchApi<Product[]>('/products');
await fetchApi('/products', { method: 'POST', body: JSON.stringify(newProduct) });
```

Notice the path passed is `/products`, **not** `/api/products` — `fetchApi` itself prepends `/api` via `resolveApiUrl('/api' + path)`. This small convention means feature code never has to think about `/api` prefixing, same-origin vs. absolute URLs, or native-app origin quirks — all of that is `platforms/shared/apiBase.ts`'s job (see [App Shell](/frontend/app-shell) and [System Overview](/architecture/system-overview) for how that resolves per surface).

## Hands-on exercise

1. Open your browser DevTools Network tab, switch tabs twice rapidly in the app, and confirm the second identical GET within 3 seconds doesn't produce a second network request.
2. Force a network failure (DevTools → Network → Offline) on the web app (not mobile) and attempt a mutation. Confirm it fails immediately rather than queueing — then explain why that's correct given `isMobileClient()`'s gating.
3. Trigger a 401 manually (e.g. by tampering with the stored token in localStorage) and observe the exact redirect behavior. Which URL does it redirect to, and where does that value come from?

## Debugging exercise

A user reports "I clicked Save twice because it seemed to hang, and now I have two duplicate sales records." Given the retry policy (mutations get exactly one retry, only on network-level `TypeError`, never on HTTP error codes), is the retry logic itself the likely cause, or is this more likely a case of the user manually double-clicking a Save button that isn't disabled during the in-flight request? What frontend change would close this gap regardless of the root cause?

## Optimization challenge

The in-memory GET cache invalidates by coarse path segment on any mutation to that segment. Propose a scheme (still simple — no need for a full query-invalidation library) that would invalidate more precisely, e.g. only paths that share the same resource ID, while keeping the implementation understandable to someone new to the codebase.

## Quiz

1. Why do mutations get fewer retries than GET requests?
2. Why is the offline queue gated to mobile only, not desktop Electron?
3. What's the one HTTP status code range that never triggers a retry, even though it might represent a transient server issue?
4. Why does the 401 handler return a promise that never resolves?

<details>
<summary>Answers</summary>

1. To reduce the risk of double-submitting a create/update if the original request actually succeeded server-side but the response was lost in transit — retrying a GET is always safe, but retrying a mutation risks duplicate writes.
2. Because desktop (Electron) and web are assumed to have reasonably reliable office/shop connectivity, while mobile field/dealer staff are the realistic offline use case this feature was built for.
3. 4xx and 5xx HTTP responses — the retry logic only triggers on `TypeError` (network-level failures like DNS/connection errors), treating any actual HTTP response, even a 500, as the server having answered.
4. Because the page is about to hard-navigate away via `window.location.href`, so there's no meaningful value left to return to the original caller — a never-resolving promise avoids a misleading resolved/undefined value flowing through any pending `.then()` chains.

</details>

## Related pages

- [App Shell](/frontend/app-shell)
- [Frontend Overview](/frontend/overview)
- [Platforms](/frontend/platforms)
- [Request Lifecycle](/architecture/request-lifecycle)
- [Lab: Offline Queue](/labs/lab-offline-queue)
