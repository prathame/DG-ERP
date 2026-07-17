---
sidebar_label: Middleware Stack
title: The Middleware Stack in server/app.ts
description: Every middleware createApp() installs, in exact order, with the reasoning behind each position — helmet, CORS, rate limits, auth, permissions, and the error handler.
---

# The Middleware Stack in `server/app.ts`

:::tip This is the "spine" of the backend
If [Request Lifecycle](/architecture/request-lifecycle) is the story of one request, this page is the reference manual for the pipeline that story walks through. Bookmark both.
:::

## 1. Full pipeline, visually

```mermaid
flowchart TB
  A[trust proxy — prod only] --> B[Correlation ID + safe res.json override]
  B --> C[compression]
  C --> D[helmet — CSP/HSTS/frameguard/noSniff]
  D --> E[CORS allow-list + Electron origins]
  E --> F[Dev-only request logger]
  F --> G["express.json (2mb; 50mb on /backup/restore)"]
  G --> H[Global rate limit 300/min]
  H --> I[QUERY method shim]
  I --> J[Global JWT auth]
  J --> K[enforceModulePermissions]
  K --> L[Route-specific rate limiters]
  L --> M[manifest.json handler]
  M --> N[Static dist/ files]
  N --> O[REQUIRE_ELECTRON download-gate — optional]
  O --> P[/api/health]
  P --> Q[34 routers]
  Q --> R[Global error handler]
  R --> S[SPA fallback — app.get('*')]
```

## 2. Correlation ID — the thread that ties logs to responses

```ts
app.use((req, res, next) => {
  const incoming = req.headers['x-correlation-id'];
  const correlationId = (typeof incoming === 'string' && incoming.trim())
    ? incoming.trim().slice(0, 64)
    : crypto.randomUUID();
  res.setHeader('X-Correlation-ID', correlationId);
  const origJson = res.json.bind(res);
  res.json = ((body) => {
    if (res.statusCode >= 500) {
      logger.error('API 500 response', { correlationId, method: req.method, path: req.path });
      return origJson({ error: 'Internal server error', correlationId });
    }
    return origJson(body);
  });
  next();
});
```

Two clever things happen here: (1) it **accepts** an incoming `X-Correlation-ID` (so a mobile client or an upstream proxy can propagate its own trace ID), capped at 64 chars to avoid header abuse; and (2) it **monkey-patches `res.json`** so that *any* handler anywhere in the app that responds with a 5xx status automatically gets its body replaced with a redacted, correlation-tagged error — even if that handler forgot to redact it itself. This is a safety net layered on top of each route's own `try/catch`.

## 3. Helmet — security headers, explicitly configured (not defaults)

| Header/option | Value | Why |
|---|---|---|
| `contentSecurityPolicy.scriptSrc` | `'self'` in prod, `+'unsafe-inline'` in dev | Production builds load no inline scripts; dev needs Vite's HMR inline scripts |
| `contentSecurityPolicy.connectSrc` | `'self'`, `https://wa.me`, `https://mail.google.com` | Allows outbound fetches only to self + explicitly needed third parties (WhatsApp share links, Gmail compose) |
| `crossOriginEmbedderPolicy` | `false` | Disabled because it would break some embedded content the app legitimately uses |
| `frameguard` | `{ action: 'deny' }` | No one may iframe Dhandho — defends against clickjacking |
| `hsts` | `maxAge: 1 year, includeSubDomains, preload` | Forces HTTPS for a full year once a browser has seen it once |
| `noSniff` | `true` | Prevents MIME-type sniffing attacks |
| `referrerPolicy` | `strict-origin-when-cross-origin` | Limits referrer leakage to third-party sites |

See [Threat Model](/security/threat-model) for how this maps to OWASP categories.

## 4. CORS — allow-list, never a wildcard

```ts
const allowedOrigins = (process.env.ALLOWED_ORIGINS?.split(',') || (isProduction ? [] : [...localhost defaults]))
const capacitorOrigins = new Set(['Electron custom origins', 'ionic://localhost', 'http://localhost', 'https://localhost']);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || capacitorOrigins.has(origin))) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  // never reflect '*'
  ...
});
```

Production **must** set `ALLOWED_ORIGINS` explicitly (empty array otherwise — everything gets rejected, a deliberate fail-closed default). The Electron scheme origins (`Electron custom origins`, `ionic://localhost`) are hardcoded because the mobile WebView's origin is fixed and unrelated to `ALLOWED_ORIGINS`, which is meant for browser-facing domains.

## 5. Rate limiting — tiered, not one-size-fits-all

| Limiter | Scope | Limit | Why this specific number |
|---|---|---|---|
| Global | `/api/*` (skip `/health`) | 300 req/min per IP | Generous enough for a busy dashboard polling several endpoints, tight enough to blunt scraping/abuse |
| Login | `/api/auth/login`, `/api/super-admin/login` | 5/min per IP | Classic brute-force throttle; `isTest` raises this to 1000 so integration tests aren't flaky |
| Password change | `/api/settings/change-password` | 20/15min | Loose — legitimate users retyping a mistyped current password shouldn't get locked out |
| Forgot-password request | `/api/auth/forgot-password` | 3/hour per IP | Prevents email-enumeration hammering |
| Reset-password | `/api/auth/reset-password` | 5/hour per IP | Token-guessing throttle |
| Signup | `/api/auth/signup` | 3/hour per IP | Moot in practice — signup is `410 Gone` (disabled), but the limiter stays as defense if it's ever re-enabled |
| Chatbot | `/api/chatbot` | 30/min per IP | Cost control — each chatbot call likely proxies to a paid LLM API |

All limiters are **disabled in tests** (`isTest` check) except login, which gets a very high ceiling instead of being fully disabled — this exercises the middleware's presence in integration tests without making them flaky.

## 6. The `QUERY` method shim

```ts
app.use((req, _res, next) => {
  if (req.method === 'QUERY') {
    if (req.body && typeof req.body === 'object') Object.assign(req.query, req.body);
    req.method = 'GET';
  }
  next();
});
```

The HTTP `QUERY` method is an experimental verb (bodies on "read" requests without the semantic baggage of `POST`). This shim lets any client that speaks `QUERY` send a body that gets merged into `req.query`, then treats the rest of the pipeline as a normal `GET`. It's a forward-compatibility shim more than an actively-used feature today.

## 7. Global JWT auth — the security-critical middleware

Covered in full depth in [Auth Middleware](/backend/auth-middleware). The one-paragraph summary: verify HS256 signature, branch on whether the payload has `userId`+`tenantId` (normal tenant user), just `tenantId` (platform-scoped token), or neither (super-admin/on-prem token — handled by route-specific middleware instead), hydrate live role/permissions (via `authCache` or a fresh JOIN), check tenant suspension/expiry, check `password_changed_at` against the token's `iat`.

## 8. `enforceModulePermissions` — RBAC after AuthN

Covered in full in [Permissions](/backend/permissions). One-paragraph summary: maps the request path to a business "module" (`inventory`, `finance`, `settings`, …) via a prefix table, computes the caller's access level for that module (`hidden`/`view`/`print`/`full`), and requires `full` for any non-GET method or `view` for GET/HEAD.

## 9. Static assets, the download gate, and the SPA fallback

- `express.static(distPath, { maxAge: '1y' in prod, immutable in prod })` — but `index.html`, `sw.js`, and `manifest.json` are explicitly forced to `no-cache` so deploys are picked up immediately even with aggressive asset caching.
- `REQUIRE_ELECTRON` env flag (optional): when set, any non-API/non-Electron/non-on-prem browser request gets served a **download page** instead of the app — a business decision to push desktop-only access for certain deployments rather than a security control.
- The final `app.get('*', ...)` serves `dist/index.html` for any GET that isn't `/api/*`, enabling client-side tab routing to work on refresh; if `dist/` doesn't exist (dev mode without a build), it returns a helpful 404 telling you to run `npm run dev` or `npm run build`.

## Hands-on exercise

1. Temporarily comment out the CORS middleware in a local clone and try to hit the API from a browser origin not in your `ALLOWED_ORIGINS`/localhost defaults. Observe the browser console error, then restore the middleware and confirm it goes away.
2. Send 6 rapid login requests to your local server within a minute. Confirm the 6th returns the rate-limit message. Which header does `express-rate-limit` set that tells you how many attempts remain?
3. Find the exact line in `app.ts` where `dist/index.html`, `sw.js`, and `manifest.json` get `no-cache` — why do *only* these three files need that treatment while everything else can be cached for a year?

## Debugging exercise

A mobile QA tester reports: "API calls from the Android app are being rejected with a CORS-like error, but the same build works fine on iOS." Given that Electron's WebView origin is fixed per platform (`Electron custom origins` on both, typically), is CORS really the most likely cause, or is this symptom more likely rooted somewhere else in the pipeline (hint: check `resolveApiUrl()` and whether the Android build is actually pointed at the right `VITE_API_ORIGIN`)?

## Optimization challenge

The global rate limiter, helmet, and CORS middleware all run on **every** request, including ones that will be immediately rejected by auth two steps later. Would moving the JWT auth check earlier in the pipeline (before helmet/CORS) improve anything meaningfully, or would it break something? Justify with at least one concrete scenario (hint: think about `OPTIONS` preflight requests and public health checks).

## Quiz

1. Why does the correlation-ID middleware monkey-patch `res.json` instead of relying solely on each route's own error handling?
2. What is the one deliberate exception to "CORS never reflects a wildcard origin," and why is it safe?
3. Why does the login rate limiter get a *raised* limit in tests instead of being disabled like the others?

<details>
<summary>Answers</summary>

1. It acts as a safety net — even a route handler that forgets to redact its error response, or a bug in a rarely-hit code path, still gets its 5xx body replaced with a generic, correlation-tagged message before it reaches the client.
2. There isn't one — the code explicitly comments "Never reflect * — unlisted origins get no Allow-Origin header"; even Electron origins are matched against an explicit allow-list (`capacitorOrigins`), not a wildcard.
3. To keep integration tests exercising the *real* rate-limiting middleware's code path (so a regression there would still be caught) without making test suites flaky due to hitting a tight 5/min ceiling across many test files running in parallel.

</details>

## Related pages

- [Request Lifecycle](/architecture/request-lifecycle)
- [Auth Middleware](/backend/auth-middleware)
- [Permissions](/backend/permissions)
- [Threat Model](/security/threat-model)
- [Headers & CSP](/security/headers-and-csp)
