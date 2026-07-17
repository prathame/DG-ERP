---
sidebar_label: "Animation: Auth Flow"
title: "Animation: Login → Token → Every Request"
description: A frame-by-frame walkthrough of the full authentication lifecycle, from a user typing a password to the 30-second authCache expiring on a later request.
---

# Animation: Login → Token → Every Request

This walks the same authentication lifecycle described in [Auth API](/api/auth) and [Authorization](/security/authorization), but frame by frame, to make the *timing* of each step explicit.

## Frame 1 — Login submission

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant S as Server
    U->>F: Types email + password, submits
    F->>S: POST /api/auth/login
```

Nothing tenant-specific has happened yet — the server doesn't know who this is until it looks up the email.

## Frame 2 — Credential verification

```mermaid
sequenceDiagram
    participant S as Server
    participant DB as Postgres
    S->>DB: SELECT * FROM users WHERE email = $1
    DB-->>S: user row (or none)
    S->>S: bcrypt.compare(password, user.password_hash)
```

If no user row is found, the server still runs a dummy bcrypt comparison against a fixed hash before responding — this constant-time-ish behavior avoids leaking "email doesn't exist" via response timing. See [Auth API](/api/auth).

## Frame 3 — Token issuance

```mermaid
sequenceDiagram
    participant S as Server
    participant F as Frontend
    S->>S: sign JWT { userId, tenantId, role, iat }
    S-->>F: 200 { token, user }
    F->>F: localStorage.setItem('token', ...)
```

The `iat` (issued-at) claim matters later — it's what gets compared against `password_changed_at` on every future request.

## Frame 4 — Every subsequent request

```mermaid
sequenceDiagram
    participant F as Frontend
    participant MW as Auth Middleware
    participant Cache as authCache (30s)
    participant DB as Postgres
    F->>MW: Any /api/* request\n+ Authorization: Bearer <token>
    MW->>MW: jwt.verify(token, JWT_SECRET)
    MW->>Cache: lookup userId
    alt cache hit (< 30s old)
        Cache-->>MW: cached user row
    else cache miss
        MW->>DB: SELECT * FROM users WHERE id = $1
        DB-->>MW: user row
        MW->>Cache: store for 30s
    end
    MW->>MW: compare token.iat vs user.password_changed_at
    MW->>MW: attach req.tenantId, req.userId, req.role
```

This is the frame worth studying closest: the JWT signature check is cheap and stateless, but the middleware *still* hits the database (or the 30-second cache) on every request, specifically so a role change, suspension, or password change takes effect almost immediately rather than waiting for token expiry. See [Caching](/performance/caching) for why 30 seconds specifically.

## Frame 5 — Permission check, then the route

```mermaid
sequenceDiagram
    participant MW as Permission Middleware
    participant R as Route Handler
    MW->>MW: moduleForPath(req.path) via PATH_MODULE
    alt module registered
        MW->>MW: getAccessLevel(user, module)
        alt sufficient access
            MW->>R: next()
        else insufficient
            MW-->>R: 403
        end
    else module not registered
        MW->>R: next() — fail-open, see Permissions
    end
```

## Frame 6 — A request 25 hours later (token expired)

```mermaid
sequenceDiagram
    participant F as Frontend
    participant MW as Auth Middleware
    F->>MW: Request + expired token
    MW->>MW: jwt.verify throws TokenExpiredError
    MW-->>F: 401
    F->>F: api.ts sees 401, clears session,\nredirects to login
```

## Self-check

1. At which exact frame does the server first learn which tenant a request belongs to?
2. Why does frame 4 still hit the database (or cache) even though the JWT signature already proves the token wasn't tampered with?
3. What would change in frame 6 if the frontend didn't centralize 401 handling in `api.ts`?

<details>
<summary>Answers</summary>

1. Frame 4 — from the verified JWT's `tenantId` claim, on every single request; frame 1-3 (login) don't establish a "current tenant" for anything beyond issuing the token itself.
2. Because a valid signature only proves the token *was* legitimately issued at some point in the past — it says nothing about whether the user's role, permissions, subscription status, or password have changed *since* then. The DB/cache lookup is what makes those changes take effect without waiting for token expiry.
3. Every feature that calls `api.ts` would need its own duplicate 401-handling logic, and any feature that forgot to add it would silently fail (or show a confusing error) instead of correctly redirecting to login.

</details>

## Related

- [API → Auth](/api/auth)
- [Security → Authorization](/security/authorization)
- [Architecture → Error Flow](/architecture/error-flow)
- [Runbooks → Auth Failures](/runbooks/auth-failures)
