---
title: Authentication
description: Login, bcrypt password hashing, JWT (HS256, 24h), single-device sessions, forgot/reset password, and 15-minute super-admin impersonation.
---

# Authentication

## Login — `POST /api/auth/login`

```server/routes/auth.ts, lines 15-152 (abridged)
const row = await pool.query(`
  SELECT u.id, ..., u.password_hash, u.tenant_id, t.slug as tenant_slug, t.status as tenant_status, ...
  FROM users u JOIN tenants t ON u.tenant_id = t.id
  WHERE LOWER(u.email) = LOWER($1) ${slugClause} LIMIT 1
`, loginParams);

if (!bcrypt.compareSync(password, row.password_hash)) {
  return res.status(401).json({ error: 'Invalid email or password' });
}
// tenant status / trial / subscription expiry checks...
// vendor_portal_enabled gate for Vendor role...
const token = generateToken({ userId, email, role, name, tenantId, vendorId });
```

Four checks happen, in order, before a token is ever issued: (1) does this email/slug combination resolve to exactly one user, (2) does the password match its bcrypt hash, (3) is the tenant active (not suspended, not past trial/subscription expiry), (4) if the user is a `Vendor` role, is the vendor portal even enabled for this tenant. Any failure returns a generic `401`/`403` — **the same "Invalid email or password" message for a wrong email and a wrong password**, a deliberate anti-enumeration choice (see [owasp.md](./owasp.md) A07).

> [!NOTE]
> **Why does login search across all tenants by email, with an optional `slug` to disambiguate?** Multiple independent tenants could plausibly register the same admin email address in a multi-tenant SaaS (a consultant managing several client companies, say). The code explicitly handles this: if no `slug` is provided and more than one tenant has a user with that email, login is refused with a message asking the user to use their company's specific login link. This is the `M2` fix referenced in the code — a real bug (silently logging into the "wrong" tenant on email collision) that was found and closed.

### Password hashing — bcrypt, cost factor 12

Every place a password is hashed in this codebase uses the same cost factor:

```226:227:server/routes/auth.ts
const newHash = bcrypt.hashSync(newPassword, 12);
```

Cost factor `12` means \(2^{12} = 4096\) hashing rounds — bcrypt's adaptive design means this number can be raised in the future as hardware gets faster, without changing the algorithm. `12` is a widely-recommended default (OWASP's current guidance sits in the 10-12 range for bcrypt) that balances brute-force resistance against login-request latency; a much higher cost factor would materially slow down every single login, at scale, for marginal additional resistance against an attacker who would need the hash to leak in the first place.

## JWTs — HS256, 24-hour expiry

```29:31:server/middleware/auth.ts
export function generateToken(payload: object, expiresIn: string | number = '24h'): string {
  return jwt.sign(payload, JWT_SECRET!, { expiresIn, algorithm: 'HS256' } as jwt.SignOptions);
}
```

| Property | Value |
|---|---|
| Algorithm | HS256 (HMAC-SHA256, symmetric) |
| Secret | `JWT_SECRET` env var — required at boot, process exits if missing (`server/middleware/auth.ts` lines 5-9) |
| Default expiry | `24h` |
| Payload | `userId`, `email`, `role`, `name`, `tenantId`, `vendorId` (nullable), `sessionId` (single-device session) |

## Single-device sessions (one user → one machine)

Desktop and mobile cloud apps enforce **one active login per user**. A new login replaces the previous session immediately.

| Piece | Behavior |
|---|---|
| Table | `user_sessions` (tenant users) / `super_admin_sessions` (platform admins) — one row per user |
| Login | `POST /api/auth/login` creates a new `sessionId`, upserts the row, embeds `sessionId` in the JWT |
| API gate | Global auth in `server/app.ts` rejects tokens whose `sessionId` ≠ current row (`401` + `code: SESSION_REPLACED`) |
| Heartbeat | Client calls `POST /api/auth/session/heartbeat` every ~45s (and on focus) so idle devices notice the kick |
| Logout | `POST /api/auth/logout` deletes the matching session row |
| Impersonation | Super-admin impersonation JWTs (`impersonatedBy`) skip the session check and do not kick the real user |
| Offline Mobile | Local PGlite auth is unchanged — cloud single-device applies when using online/cloud login |

Old device UX: alert **“Your account was signed in on another device”** and return to login.

> [!WARNING]
> **A live footgun worth knowing about:** `.env.example` documents `# JWT_EXPIRES_IN=7d` as an optional override — but **no code in this repository actually reads `process.env.JWT_EXPIRES_IN`**. `generateToken`'s default parameter is a hardcoded `'24h'`, and no call site passes a different value for regular logins. Setting `JWT_EXPIRES_IN=7d` in a deployed `.env` file would have **zero effect** — tokens would still expire after 24 hours. This is a documentation/implementation drift, not a security bug (the actual behavior is the safer, shorter one), but it's exactly the kind of thing that wastes an afternoon of an engineer's time debugging "why didn't my env var take effect."

### Verification happens twice, in two different places

```188:236:server/app.ts
app.use('/api/', async (req, res, next) => {
  if (isPublicApiPath(req.path)) return next();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] });
  if (decoded.tenantId && decoded.userId) {
    req.headers['x-tenant-id'] = decoded.tenantId;
    let row = getCachedAuth(decoded.userId, decoded.tenantId, decoded.iat);
    if (!row) { /* fresh DB read: role, vendor_id, permissions, tenant status/expiry */ }
    // suspended tenant / expired subscription / password-changed-after-token-issued checks
  }
  ...
});
```

This **global** middleware in `server/app.ts` runs on every `/api/*` request before any specific route handler, and does more than just verify the signature — it re-fetches (or reads from the 30-second `authCache`, see [../performance/caching.md](../performance/caching.md)) the user's **current** `role`, `vendor_id`, and `permissions`, overwriting whatever the JWT claims say. This is the mechanism that makes an admin's mid-session demotion of a Staff user to a lower permission level take effect **within the cache window**, not just at the demoted user's next login.

`server/middleware/auth.ts`'s `authMiddleware`/`authMiddlewareStrict` are a **second, route-level** implementation of similar logic, used by routes that need it directly (rather than relying purely on the global gate) — `authMiddlewareStrict` specifically adds a synchronous check that a password change (`password_changed_at`) postdates the token's `iat`, immediately invalidating the token, which is the mechanism behind:

```227:229:server/routes/auth.ts
await pool.query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE ...', [...]);
await logAudit(pool, tenantId!, 'PASSWORD_CHANGE', ..., 'Password changed — all sessions invalidated', ...);
res.json({ ok: true, message: 'Password changed. Please log in again.' });
```

> [!IMPORTANT]
> **Changing your password logs out every device, everywhere, immediately (modulo the 30s cache) — not just the current session.** This is a deliberate design choice appropriate for an ERP handling financial data: if a password change is a reaction to a suspected compromise, the user needs every other active session (a shared warehouse tablet, a forgotten browser tab at a cyber café) killed at the same time, not left valid until its 24-hour expiry.

## Forgot / reset password — no email sending, admin-mediated retrieval

```236:271:server/routes/auth.ts
router.post('/api/auth/forgot-password', async (req, res) => {
  const user = /* lookup by email (+ optional slug) */;
  if (!user) return res.json({ ok: true, message: 'If this email exists, a reset link has been generated' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes
  await pool.query('INSERT INTO password_reset_tokens (...) VALUES (...)', [...]);
  await logAudit(pool, user.tenant_id, 'PASSWORD_RESET_REQUEST', ...);

  // Token stored — retrievable by authenticated admin via GET /api/admin/reset-tokens
  // or super-admin via GET /api/super-admin/reset-tokens. Never returned here.
  res.json({ ok: true, message: 'Reset token generated. Contact your admin or support to retrieve it.' });
});
```

Two things stand out here, both worth understanding as deliberate:

1. **The response is identical whether the email exists or not** — `{ ok: true, message: 'If this email exists...' }`. This is the standard anti-enumeration pattern: an attacker probing which emails are registered gets no signal either way.
2. **The token itself is never returned to the person who requested it.** It's inserted into `password_reset_tokens` and must be fetched by an **authenticated admin or super-admin** through a separate endpoint and manually relayed to the user (phone call, in-person, WhatsApp — whatever out-of-band channel the business uses). This is a small-business-appropriate substitute for transactional email infrastructure: Dhandho's target customers often don't have (or trust) a reliable email deliverability setup, so the "reset flow" leans on the fact that there's always a human admin who personally knows their handful of users.

> [!CAUTION]
> **5-minute token expiry is short — intentionally.** Because the token has to be manually relayed by a second human (the admin), rather than clicked directly from an email a user just received, there's an inherent extra delay in this flow already. A 5-minute window forces that relay to happen essentially immediately (the admin reads it off a `GET /api/admin/reset-tokens` screen and tells the user right away, live), which limits the exposure window if the token is ever intercepted or the admin's session is compromised.

**Super-admin generated reset** (`POST /api/super-admin/tenants/:id/reset-token`) uses the same 5-minute expiry but *does* return the token + a constructed reset link directly to the super-admin's response — appropriate because a super-admin support agent is already a trusted, authenticated actor generating this for a support ticket, not an anonymous requester. **Service Cloud seats** panel exposes this as **Share reset link** per seat user (online Cap / Electron login — one password covers that user’s mobile + laptop slots). Offline Mobile local admin password is a separate product path.

## Impersonation — 15-minute audited support tool

```614:660:server/routes/super-admin.ts
router.post('/api/super-admin/tenants/:id/impersonate', superAdminMiddleware, async (req, res) => {
  const tenant = await pool.query('SELECT id, company_name, slug FROM tenants WHERE id = $1', [id]);
  const admin = await pool.query(
    "SELECT id, email, name, role FROM users WHERE tenant_id = $1 AND role IN ('Super Admin', 'Admin') ORDER BY created_at LIMIT 1",
    [id],
  );
  const saId = (req as AuthRequest).user?.userId;
  const token = generateToken(
    { userId: admin.id, email: admin.email, name: admin.name, role: admin.role, tenantId: id, impersonatedBy: saId },
    '15m',
  );
  await logAudit(pool, id, 'IMPERSONATE', 'tenant', id, `Super admin ${saId} impersonated tenant admin ${admin.email}`, saId, 'Super Admin');
  res.setHeader('Cache-Control', 'no-store');
  res.json({ token, expiresIn: 900, tenantId: id, slug: tenant.slug, companyName: tenant.company_name });
});
```

This is Dhandho's answer to "a customer calls support with a bug we can't reproduce without seeing their exact account." Rather than asking a customer for their password (never do this) or requiring a platform engineer to have standing database access to every tenant, a Super Admin generates a **scoped, time-boxed, audited token**:

- **Scoped** — the token carries the target tenant's first Admin/Super-Admin user's identity, not some special "support" role with broader reach than that admin already has.
- **Time-boxed** — `expiresIn: '15m'` / `expiresIn: 900` (seconds). Fifteen minutes is enough for a support agent to reproduce a reported bug in one sitting, short enough that a leaked impersonation link (pasted into the wrong Slack channel, say) has a small blast-radius window.
- **Audited** — `logAudit(..., 'IMPERSONATE', ...)` records *who* impersonated *which* tenant and *when*, permanently, in that tenant's own audit log (visible to the tenant's admins, not hidden from them).
- **`Cache-Control: no-store`** on the response — this token must never be cached by an intermediate proxy or browser cache.

The frontend's handling of this token is covered in [../frontend/app-shell.md](../frontend/app-shell.md)'s `consumeImpersonationToken()`: the token arrives as a URL query parameter (`?impersonate_token=...`), is immediately decoded and stored via `session.setToken`, and — critically — is **stripped from the URL** via `history.replaceState` before the first paint, so it never lingers in browser history or gets accidentally shared via a copied URL.

> [!CAUTION]
> **A known, accepted gap:** actions taken *during* an impersonated session are audit-logged under the impersonated admin's identity (since the JWT's `role`/`userId` are the target admin's), not separately tagged per-action with `impersonatedBy`. The grant of impersonation is clearly audited; the individual actions taken while impersonating are not distinguishable after the fact from the real admin's own actions, beyond correlating timestamps against the `IMPERSONATE` audit entry. See [threat-model.md](./threat-model.md)'s Repudiation section.

## Super-admin login — a fully separate system

`POST /api/super-admin/login` checks credentials against the `super_admins` table (not `users`), and issues a token with `role: 'super_admin'` and **no `tenantId` claim at all**. `superAdminMiddleware` accepts `super_admin`, `owner`, or `support` roles. This is intentionally **not** a role within the tenant RBAC system described in [authorization.md](./authorization.md) — see [threat-model.md](./threat-model.md) for why that separation matters.

## Signup is disabled

```13:13:server/routes/auth.ts
router.post('/api/auth/signup', (_req, res) => res.status(410).json({ error: 'Signup disabled. Contact your admin.' }));
```

A `410 Gone` — not a `404`, and not simply removed from the router — deliberately signals "this used to exist and is permanently retired," as opposed to "this endpoint was never here." All tenant creation now flows through `provisionTenant` (`server/utils/tenant.ts`), invoked only by Super Admin tooling. This closes off a historically common attack surface (self-service signup abused for spam tenants, resource exhaustion, or trial abuse) at the cost of every new customer needing a human (sales/support) in the loop to provision their account — an acceptable trade for a B2B SME product where every customer relationship already involves a human sales conversation.

## Quiz

1. Setting `JWT_EXPIRES_IN=7d` in your `.env` file does nothing. Why, and what should an engineer actually change if they wanted 7-day tokens?
2. Why does changing your password invalidate sessions on *all* devices rather than just the device where the change was made?
3. What three properties (each one word) make the impersonation feature safe enough to exist, and which line of code implements each?

<details>
<summary>Answers</summary>

1. No code reads `process.env.JWT_EXPIRES_IN` — `generateToken`'s `expiresIn` parameter defaults to the hardcoded string `'24h'`, and the regular login call site doesn't pass an override. To actually change it, an engineer would need to modify the `generateToken` call in `auth.ts`'s login handler (or the function's default parameter) directly in code.
2. Because `password_changed_at` is compared against every token's `iat` (issued-at) claim on every request — any token issued *before* the password change instantly fails that comparison, regardless of which device holds it. This is a deliberate security response: a password change is often triggered by a suspected compromise, and the threat could be active on a *different* device than the one making the change.
3. **Scoped** (`server/routes/super-admin.ts` line ~636 — token carries only the target tenant admin's identity), **time-boxed** (`'15m'` / `expiresIn: 900`), **audited** (`logAudit(pool, id, 'IMPERSONATE', ...)`).

</details>

## Related reading

- [Authorization](./authorization.md) — what happens after a token is verified.
- [Secrets](./secrets.md) — how `JWT_SECRET` itself is protected and validated at boot.
- [Accepted Risks](./accepted-risks.md) — storing the JWT in `localStorage`.
- [../frontend/session-state.md](../frontend/session-state.md) — client-side token storage.
- [../performance/caching.md](../performance/caching.md) — the 30-second `authCache` this flow depends on.
