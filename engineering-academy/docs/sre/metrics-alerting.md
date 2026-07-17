---
sidebar_label: Metrics & Alerting
title: Metrics & Alerting — Prometheus/Grafana Aspirational, and What Exists Today
description: A concrete, unglamorous plan for what to put in Prometheus/Grafana for DG-ERP, contrasted with what monitoring actually exists right now.
---

# Metrics & Alerting

This page has two halves on purpose: **what exists today** (small, honest, mostly logs) and **what a Prometheus/Grafana setup should look like** if/when this gets built. Don't let the aspirational half make you think the current half is inadequate for its scale — it's proportionate. But know exactly where the ceiling is.

## Part 1 — What exists today

| Signal | Mechanism | Where |
|---|---|---|
| Liveness + DB connectivity | `GET /api/health` → `SELECT 1` | `server/app.ts` |
| Container-level health | Docker `HEALTHCHECK` every 30s | `Dockerfile` |
| Platform-level uptime | Render's own dashboard/health check | `render.yaml` `healthCheckPath: /api/health` |
| Error visibility | `logger.error(...)` + Logtail (if `LOGTAIL_TOKEN` set) | `server/utils/logger.ts` |
| Per-tenant audit trail | `audit_log` table | `server/routes/audit.ts`, `server/utils/helpers.ts` (`logAudit`) |
| On-prem fleet health | Heartbeat → `onprem_licenses.last_seen`, `active_users`, `disk_mb` | `server/routes/onprem.ts` |
| Mobile fleet health | Heartbeat → `mobile_devices.last_seen`, `app_version` | `server/routes/mobile.ts` |
| npm dependency vulnerabilities | `npm audit` in CI | `.github/workflows/security.yml`, `release.yml` |
| Bundle size regression | gzip size check on the main JS chunk | `.github/workflows/build.yml`, `release.yml` (`< 262144` bytes gzip) |

**No metrics time-series, no dashboards, no paging exist today.** "Alerting" today means: a human notices the app is slow/down, or a customer reports it, or CI fails on a PR. That's the honest baseline this section is trying to improve on.

## Part 2 — What to put in Prometheus, if you add it

### Adding the exporter

The lightest-weight path: `prom-client` in the Express app, exposing `GET /metrics` (protected — don't put this in `PUBLIC_PATHS`, but also don't put it behind tenant JWT auth; use a separate internal-only bearer token or IP allowlist).

```ts
// sketch — not yet in the codebase
import client from 'prom-client';
const httpDuration = new client.Histogram({
  name: 'dg_http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
});
```

Instrument it in the same place the dev-only request logger already lives in `server/app.ts` — that middleware already computes `Date.now() - start` and knows the status code; it just currently only `console.log`s it in non-production. The metrics version would run unconditionally (including in production) and record into the histogram instead of (or in addition to) printing.

### Proposed metrics catalog

| Metric | Type | Labels | Why |
|---|---|---|---|
| `dg_http_request_duration_seconds` | Histogram | `method`, `route` (templated, e.g. `/api/products/:id`, not the raw path — cardinality!), `status_code` | Core latency signal for [SLIs & SLOs](./slis-slos) |
| `dg_http_requests_total` | Counter | `method`, `route`, `status_code` | Traffic + error rate, derivable via `rate()` in PromQL |
| `dg_db_pool_total_count` / `dg_db_pool_idle_count` / `dg_db_pool_waiting_count` | Gauge | — | `pg.Pool` exposes these as properties (`pool.totalCount`, `.idleCount`, `.waitingCount`) already — just needs a periodic scrape callback |
| `dg_login_attempts_total` | Counter | `outcome` (`success`/`bad_password`/`suspended`/`rate_limited`) | Direct signal for the login SLO and for brute-force detection |
| `dg_tenant_request_duration_seconds` | Histogram | `tenant_id` (careful — high cardinality; consider only for your largest N tenants or a sampled subset) | Catches noisy-neighbor tenants degrading shared pool performance |
| `dg_gst_api_call_duration_seconds` | Histogram | `operation` (`irn`/`ewb`), `mode` (`mock`/`sandbox`/`production`), `outcome` | GST NIC API is a third-party dependency with its own failure modes — see [GST API Failures Runbook](/runbooks/gst-api-failures) |
| `dg_onprem_heartbeat_age_seconds` | Gauge | `license_key` (hashed/truncated, not raw) | Directly measures fleet health for on-prem — "how stale is the last heartbeat per install" |
| `dg_mobile_device_count` | Gauge | `platform` (`android`/`ios`) | Adoption + fleet size tracking |
| `dg_backup_export_duration_seconds` / `dg_backup_records_total` | Histogram / Counter | — | `/api/backup` already computes `totalRecords`; exposing it as a metric turns anecdote into a trend line |
| `dg_process_uptime_seconds`, standard Node.js process metrics (`prom-client`'s default collectors) | Gauge | — | Memory (RSS, heap), event loop lag, GC pauses — cheap to add, catches memory leaks before OOM kills the dyno |

### Proposed Grafana dashboards

1. **Golden Signals overview** — request rate, error rate (%), p50/p95/p99 latency, pool saturation, one panel each, top of the default dashboard. Directly mirrors [Golden Signals](./golden-signals).
2. **Login & Auth** — login attempts by outcome, rate-limit trips, active session count (approx, via unique `userId` seen in a rolling window).
3. **GST / Distribution** — E-Invoice/E-Way Bill call volume, latency, and failure rate by mode (mock/sandbox/production) — this is the dashboard you'd actually open during a [GST API incident](/runbooks/gst-api-failures).
4. **Fleet health (On-Prem + Mobile)** — heartbeat staleness histogram, device/version distribution, disk usage distribution across on-prem installs.
5. **Database** — pool saturation, `SELECT 1` health-check latency as a proxy for DB responsiveness, and (if you enable `pg_stat_statements`) top N slowest queries by total time.

### Proposed alerting rules (PromQL sketches)

```yaml
# API error rate > 1% for 5 minutes
- alert: HighApiErrorRate
  expr: |
    sum(rate(dg_http_requests_total{status_code=~"5.."}[5m]))
    / sum(rate(dg_http_requests_total[5m])) > 0.01
  for: 5m
  labels: { severity: page }

# Health check itself failing
- alert: HealthCheckDown
  expr: up{job="dg-erp"} == 0
  for: 2m
  labels: { severity: page }

# DB pool near saturation
- alert: DbPoolSaturated
  expr: dg_db_pool_waiting_count > 0
  for: 3m
  labels: { severity: warn }

# Login p95 latency SLO breach
- alert: LoginLatencySLOBreach
  expr: histogram_quantile(0.95, rate(dg_http_request_duration_seconds_bucket{route="/api/auth/login"}[10m])) > 0.4
  for: 10m
  labels: { severity: warn }

# On-prem fleet going dark
- alert: OnpremHeartbeatsStale
  expr: max(dg_onprem_heartbeat_age_seconds) > 7200
  for: 15m
  labels: { severity: warn }
```

**Severity discipline matters more than the rule count.** With no dedicated on-call today, every `page`-severity alert should be something a human genuinely needs to act on *now*. Start with 3–4 `page` rules (health down, error rate, pool exhaustion) and everything else at `warn`, reviewed daily/weekly — resist the urge to page on everything just because you finally can.

## Bridging the gap incrementally

You don't need the whole Prometheus/Grafana stack in one PR. A sane order:

1. Add `prom-client`, expose `/metrics` behind an internal-only guard, wire the histogram into the existing request-timing middleware.
2. Add the four `page`-severity alerts above against whatever scrapes `/metrics` (self-hosted Prometheus, or a managed equivalent).
3. Add the DB pool gauges — cheapest win, directly informs your [SLOs](./slis-slos).
4. Add GST API and on-prem/mobile fleet metrics once the core dashboard is trusted.
5. Only then invest in per-tenant cardinality — it's the most operationally expensive addition (cardinality cost in most metrics backends) and the least urgent for a team without SRE headcount yet.

## Related pages

- [SLIs & SLOs](./slis-slos.md)
- [Golden Signals](./golden-signals.md)
- [Logging](./logging.md)
- [Failure Scenarios](./failure-scenarios.md)
- [Performance → Overview](/performance/overview)
