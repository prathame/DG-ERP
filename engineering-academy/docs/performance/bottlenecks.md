---
title: Known Bottlenecks
description: Honest inventory of where Dhandho's performance model shows real strain today, and why each hasn't (yet) been worth fixing.
---

# Known Bottlenecks

Every other document in this section describes a deliberate optimization. This one is the opposite: a catalog of places where performance is **known to be imperfect**, why the trade-off was accepted rather than fixed, and what would trigger revisiting each one. Documenting known limitations honestly is more useful to a future engineer than a docs set that only describes successes — it tells you where to look first when something feels slow, and which "fixes" have already been considered and consciously deferred.

## 1. `OFFSET`-based pagination doesn't scale to very large result sets

**The bottleneck:** As covered in [Database Performance](./database.md), `parsePagination`'s `OFFSET N LIMIT 500` approach requires Postgres to scan and discard `N` rows before returning a page — cost grows linearly with page depth.

**Why it hasn't been fixed:** Dhandho's target tenants are SME businesses; even a multi-year-old, actively-used tenant's sales history is unlikely to reach the row counts (hundreds of thousands to millions) where this becomes perceptible. A cursor-based rewrite is real engineering effort for a problem that isn't manifesting yet.

**What would trigger revisiting it:** A specific tenant's history table growing large enough that deep-page requests (e.g., "show me sales from 3 years ago, page 200") become noticeably slow in production monitoring or user reports.

## 2. The 30-second `authCache` means permission changes aren't instant

**The bottleneck:** Covered in depth in [Caching](./caching.md) — a role/permission change can take up to 30 seconds to apply to a user's in-flight session if their requests keep hitting a warm cache entry.

**Why it hasn't been fixed:** The alternative (no caching, or a much shorter TTL) means re-running a `users JOIN tenants` query on literally every authenticated request, for every user — a real, continuous database cost that this cache specifically exists to avoid. Thirty seconds was judged an acceptable trade for most permission-change scenarios (an admin adjusting a Staff member's access isn't usually a life-safety-critical instant operation).

**What would trigger revisiting it:** A specific incident requiring instantaneous access revocation (beyond password-change, which already bypasses this via a separate, immediate mechanism) — e.g., if "suspend this user right now, mid-session" became a supported, time-critical admin action, `invalidateAuthCache` would need to be called from that action's handler too, similar to how password changes already do.

## 3. A single Express process, no clustering

**The bottleneck:** The backend runs as one Node.js process per deployment. Node is single-threaded for JS execution — a CPU-bound operation (a large report computation, a bulk import processing thousands of rows synchronously) blocks the event loop for its duration, delaying *every other* concurrent request on that same process, not just the one that triggered it.

**Why it hasn't been fixed:** Most of Dhandho's per-request work is I/O-bound (waiting on database queries), which Node handles well without blocking. Genuinely CPU-heavy operations (bulk imports, large exports) are relatively rare, user-initiated actions rather than constant background load, and the target deployment scale (SME tenants, not high-traffic platforms) hasn't yet demonstrated a need for `cluster` module multi-process scaling or a separate worker-queue architecture for these operations.

**What would trigger revisiting it:** Bulk import/export operations growing common enough, or large enough (many-thousand-row imports becoming a frequent tenant action), that they visibly degrade responsiveness for *other* tenants' concurrent requests during that window — at which point moving heavy synchronous work to a background job queue (rather than processing it inline within a request handler) would be the natural next step.

## 4. No CDN or edge caching layer in front of the API

**The bottleneck:** Every API request — even ones serving largely static, rarely-changing data (a tenant's category list, business config) — round-trips to the origin Express server and (absent a cache hit) the database. There's no edge/CDN caching layer sitting in front of the API for cacheable GET responses.

**Why it hasn't been fixed:** The in-memory GET cache (3 seconds, see [Caching](./caching.md)) and authCache (30 seconds) already address the highest-frequency redundant-request patterns within a session. A full CDN/edge-caching layer would need careful per-tenant cache-key scoping (to avoid ever serving Tenant A's cached response to Tenant B) and cache-invalidation coordination across mutations — meaningful added infrastructure complexity for a benefit that hasn't yet been shown to matter at Dhandho's current traffic scale.

**What would trigger revisiting it:** A specific tenant or set of tenants generating high enough read traffic that origin server load (or database load, on cache misses) becomes a measurable, recurring cost — at which point a purpose-built caching layer (Redis, or an edge CDN with careful tenant-scoped cache keys) would be the natural evolution.

## 5. RLS is not forced on the pool owner (repeated here deliberately)

**The bottleneck:** This is a security-framed trade-off (see [../security/tenant-isolation.md](../security/tenant-isolation.md) and [../security/accepted-risks.md](../security/accepted-risks.md)) that also has a *performance* dimension worth naming here: safely enabling `FORCE RLS` would require wrapping every request in an explicit transaction with `setTenantContext` called at connection checkout — adding a `BEGIN`/`SET LOCAL`/(eventual `COMMIT`) round-trip to every single request that doesn't currently need one, a real (if likely small) latency cost across the board.

**Why it hasn't been fixed:** The security section explains the correctness risk (silent zero-row returns on unscoped connections); this document adds that the performance cost of the fix isn't free either — it's not purely a "flip a safer switch" decision on either axis.

**What would trigger revisiting it:** A broader architectural move toward always-transactional request handling for other reasons (e.g., needing multi-statement atomicity more broadly) would make the marginal cost of adding `FORCE RLS` alongside that change much smaller, since the transaction wrapper would already be paid for elsewhere.

## Quiz

1. Why is a CPU-bound bulk import a fundamentally different kind of performance risk than a typical I/O-bound API request, in a single-process Node backend?
2. What would need to be true about Dhandho's traffic before a CDN/edge-caching layer would likely become worth the added complexity?
3. Why does "fix the pagination scaling issue" and "fix the RLS-not-forced issue" both currently sit in the "known, deferred" category rather than "actively being worked on" — what's the common theme in the reasoning across this whole document?

<details>
<summary>Answers</summary>

1. Because Node's single JS thread means a CPU-bound task (synchronously processing a large computation) blocks the event loop entirely for its duration, delaying every other concurrent request on that process — whereas an I/O-bound request (waiting on a database query) yields the event loop while waiting, letting other requests be processed concurrently in the meantime. A slow I/O-bound request mostly only hurts itself (and consumes a pool connection); a slow CPU-bound task hurts everyone sharing that process.
2. A specific, demonstrated increase in read-heavy traffic (from one or more tenants) large enough that origin server or database load from repeated, largely-static GET requests becomes a measurable, recurring cost — at which point the added complexity of tenant-scoped cache keys and invalidation coordination would be justified by an actual, observed problem rather than a hypothetical one.
3. The common theme is that every one of these bottlenecks was evaluated against Dhandho's actual current scale and usage patterns (SME tenants, not high-traffic enterprise platforms) and judged to be an acceptable trade-off given the added complexity or cost the "fix" would introduce — each has a specific, named trigger condition that would justify revisiting it, rather than being deferred out of neglect.

</details>

## Related reading

- [Performance Overview](./overview.md), [Caching](./caching.md), [Database Performance](./database.md), [Backend Performance](./backend.md)
- [../security/tenant-isolation.md](../security/tenant-isolation.md) and [../security/accepted-risks.md](../security/accepted-risks.md) — the security-framed side of bottleneck #5.
