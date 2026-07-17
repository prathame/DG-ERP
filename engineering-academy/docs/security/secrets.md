---
title: Secrets Management
description: Environment variables, AES-256-GCM encryption for GST credentials, and why VITE_* must never carry a secret.
---

# Secrets Management

## The one hard rule: `VITE_*` is public

Vite inlines every environment variable prefixed `VITE_` directly into the built JavaScript bundle at build time — anyone who opens dev tools and reads the shipped `.js` file can see it in plaintext. This is *by design* in Vite (it's how client code accesses build-time config at all), but it means:

> [!CAUTION]
> **`VITE_*` variables are not secrets. They ship to every browser, every Electron installer.** Only public-safe `VITE_*` values belong in client env files; a GST API secret leaking is a breach.

Every genuinely sensitive value in this codebase — `JWT_SECRET`, `DATABASE_URL`, GST NIC API credentials, `SUPER_ADMIN_PASSWORD` — is a **server-only** environment variable, read via `process.env.X` in Node code that never runs in the browser. There is no code path in `server/` that echoes these back to a client response, and CI includes a grep-based check (referenced in the security audit) that fails the build if a secret-looking key ever gets a `VITE_` prefix.

## Required vs. optional env vars

```1:41:.env.example
# Copy to .env and fill in real values. Never commit .env.

# ── Required (server) ──────────────────────────────────────────────────────────
DATABASE_URL=postgresql://USER:PASSWORD@localhost:5432/DATABASE_NAME
JWT_SECRET=replace-with-a-random-string-at-least-32-chars
SUPER_ADMIN_EMAIL=admin@yourdomain.com
SUPER_ADMIN_PASSWORD=replace-with-a-strong-password-min-12-chars

# ── Required in production ─────────────────────────────────────────────────────
# NODE_ENV=production
# ALLOWED_ORIGINS=https://dhandho.app,https://www.dhandho.app
# DATABASE_SSL=true

# ── Server (optional) ──────────────────────────────────────────────────────────
PORT=3001
NODE_ENV=development
# JWT_EXPIRES_IN=7d
# DATABASE_POOL_SIZE=10
...
# GST NIC API public keys (PEM). Server-side only — never VITE_ / client.
# GSTN_SANDBOX_PUBLIC_KEY=
# GSTN_PRODUCTION_PUBLIC_KEY=
# GSTN_PUBLIC_KEY=
```

The server refuses to boot without the four "Required (server)" values — `assertCriticalEnv` (invoked at startup) throws and exits the process rather than starting up in a half-configured, insecure state. This is a **fail-closed** posture: a missing `JWT_SECRET` doesn't mean "auth is disabled," it means "the server doesn't start."

> [!WARNING]
> **`JWT_EXPIRES_IN=7d` in the comments is dead configuration.** No code reads this variable — `generateToken`'s default is a hardcoded `'24h'` string. This is flagged in depth in [authentication.md](./authentication.md); it's mentioned again here because it's exactly the kind of drift between documented config surface and actual code behavior that a secrets/config audit needs to catch. If you're reviewing this `.env.example` for what's actually configurable, don't trust every commented line at face value — grep the codebase for `process.env.<NAME>` to confirm it's really read.

## Encrypting GST credentials at rest — `secret-crypto.ts`

Tenants who use the GST NIC e-Invoice/e-Way Bill integration store an API password and client secret issued by the government portal. These are stored in the tenant's own row in Postgres — but not in plaintext:

```1:38:server/utils/secret-crypto.ts
const PREFIX = 'enc:v1:';

function keyFromEnv(): Buffer {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET required for secret encryption');
  return crypto.createHash('sha256').update(`dhandho-secret-v1:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  if (!plain) return plain;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', keyFromEnv(), iv);
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${enc.toString('base64url')}`;
}

export function decryptSecret(stored: string): string {
  if (!stored) return stored;
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const body = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = body.split('.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', keyFromEnv(), Buffer.from(ivB64, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64url')), decipher.final()]).toString('utf8');
}
```

### Design decisions worth understanding

1. **AES-256-GCM, not AES-CBC.** GCM is an *authenticated* encryption mode — it produces both ciphertext and an authentication tag (`getAuthTag()`). Decryption verifies that tag (`setAuthTag()`) before returning plaintext, so a ciphertext that's been tampered with (bit-flipped, truncated, or swapped for a different tenant's blob) fails loudly with an error rather than silently decrypting to garbage. CBC mode alone gives you neither of these properties.
2. **A random 12-byte IV per encryption call.** Reusing an IV with the same key under GCM is a critical failure (it can leak the authentication key entirely) — generating a fresh `crypto.randomBytes(12)` on every `encryptSecret()` call is the correct, safe pattern, and it's why the IV has to travel alongside the ciphertext (`iv.base64url().tag.base64url().enc.base64url()`, dot-joined) rather than being fixed or derived.
3. **The key is derived from `JWT_SECRET`, not a separate `ENCRYPTION_KEY`.** This is a deliberate simplification: one fewer secret to provision, rotate, and keep in sync across environments. `crypto.createHash('sha256').update('dhandho-secret-v1:' + JWT_SECRET)` produces a fixed 32-byte AES-256 key, domain-separated from the raw `JWT_SECRET` by the `'dhandho-secret-v1:'` prefix so the *derived* key can never accidentally collide with the *raw* secret being used directly somewhere else. The trade-off: **a `JWT_SECRET` compromise now compromises both session forgery *and* every encrypted GST credential** — a single point of failure. Splitting these into two independently-rotatable secrets would reduce blast radius at the cost of one more value to manage; this codebase chose simplicity.
4. **`enc:v1:` prefix enables safe migration.** `decryptSecret` returns non-prefixed values unchanged ("legacy plaintext"), which means this encryption was almost certainly *added after launch* to already-populated tenant data, and the versioned prefix means a future `enc:v2:` scheme (e.g., a key-rotation event) could coexist with `v1` rows during a gradual re-encryption migration, rather than requiring flag-day cutover.

> [!NOTE]
> **Why encrypt at all, if an attacker with database access could presumably also read `JWT_SECRET` from the same server's environment?** Because "database access" and "application server access" are not always the same compromise. A leaked database backup, an overly-broad read replica grant, or a misconfigured analytics tool with `SELECT`-only access to the `tenants` table are all realistic scenarios where an attacker gets rows but not environment variables. Encryption at rest defends specifically against *that* class of exposure — it is not a substitute for protecting `JWT_SECRET` itself, and the code acknowledges the shared-key trade-off rather than pretending encryption alone makes credential storage bulletproof.

## Rotating `JWT_SECRET` — the practical cost

Because `JWT_SECRET` derives both the JWT-signing key *and* the GST-secret-encryption key, rotating it has two simultaneous effects: every currently-issued JWT becomes invalid (all users are logged out — an acceptable, even desirable, side effect of a genuine rotation event), and every currently-encrypted GST secret needs re-encryption under the new derived key (a data migration, not a config change). There's no built-in tooling in this repo for that second step today — it would need to be written as an explicit one-off migration script (decrypt with old key, re-encrypt with new key, for every tenant) if a rotation were ever required.

## Quiz

1. Why must `VITE_ANDROID_STORE_URL` never be treated the same way as `JWT_SECRET`, even though both are "environment variables"?
2. What does AES-256-**GCM** give you that AES-256-**CBC** does not, and why does that matter for a stored, potentially-tampered-with ciphertext?
3. What are the two consequences of rotating `JWT_SECRET` in this codebase, and why are they coupled?

<details>
<summary>Answers</summary>

1. Any `VITE_`-prefixed variable is inlined into the client-side JavaScript bundle at build time by Vite and ships to every browser/app that loads the code — it is effectively public, readable by anyone who inspects the bundle. `JWT_SECRET` is read only server-side via `process.env` in Node code that never executes in a browser, so it never leaves the server.
2. GCM is authenticated encryption — it produces an authentication tag that decryption verifies before returning plaintext, so tampering (bit-flips, truncation, ciphertext substitution) is detected and rejected. CBC alone provides confidentiality but no built-in integrity check, so a corrupted or maliciously modified ciphertext could decrypt "successfully" into garbage (or worse) without any error.
3. (1) Every existing JWT becomes invalid, logging out all active sessions, because the signing key changed. (2) Every previously-encrypted GST credential becomes undecryptable under the new key and needs a re-encryption migration. They're coupled because both the JWT signing key and the secret-encryption key are derived from the *same* `JWT_SECRET` environment variable via `keyFromEnv()`.

</details>

## Related reading

- [Authentication](./authentication.md) — how `JWT_SECRET` is used for signing.
- [Accepted Risks](./accepted-risks.md) — the shared-secret trade-off, formally acknowledged.
- [Threat Model](./threat-model.md) — Information Disclosure scenarios around credential storage.
