# Logging & Observability

Production-grade logging strategy for DG-ERP (server + SPA).

## 1. Logging Architecture

```
┌─────────────┐     X-Correlation-ID      ┌──────────────────┐
│  SPA / App  │ ─────────────────────────►│  Express API     │
│ clientLogger│◄──── X-Correlation-ID ────│  AsyncLocalStorage│
└─────────────┘                           │  handleApiError   │
                                          └────────┬─────────┘
                                                   │ JSON lines
                                                   ▼
                                          ┌──────────────────┐
                                          │ stdout / stderr  │──► ELK / Loki / CloudWatch
                                          │ + Logtail (opt)  │──► Better Stack
                                          └──────────────────┘
```

| Layer | Module | Role |
|-------|--------|------|
| Server logger | `server/utils/logger.ts` | Structured JSON, levels, ALS context, Logtail |
| HTTP errors | `server/utils/http-error.ts` | `handleApiError`, auth events, slow ops |
| PII redaction | `server/utils/pii.ts` | Emails, phones, tokens, secrets, cards |
| Request middleware | `server/app.ts` | Correlation ID, access logs, auth failures |
| DB | `server/pg-db.ts` | Pool fatals, rollbacks, `loggedQuery()` |
| External APIs | `server/services/nic-api.ts` | Outbound duration/status (no bodies/creds) |
| Frontend | `src/lib/logger.ts` | Global handlers, ErrorBoundary, API client |

### Correlation

- Client generates `dg_correlation_id` in `sessionStorage` and sends `X-Correlation-ID`.
- Server accepts or generates UUID; echoes on every response.
- Request context (userId, tenantId, method, path, IP) is stored in `AsyncLocalStorage` for the request lifetime.

### Example ERROR log

```json
{
  "ts": "2026-07-17T07:00:00.000Z",
  "level": "error",
  "msg": "Failed to create invoice",
  "service": "dg-erp-api",
  "environment": "production",
  "correlationId": "a1b2c3d4-...",
  "requestId": "a1b2c3d4-...",
  "userId": "U123",
  "tenantId": "T456",
  "method": "POST",
  "url": "/api/invoices",
  "statusCode": 500,
  "file": "/app/server/routes/invoices.ts",
  "line": 120,
  "error": { "name": "Error", "message": "...", "stack": "..." }
}
```

## 2. Logging Best Practices

1. **Structured fields** — `logger.info('Customer created', { customerId, userId })`, never string concat.
2. **Always log the original exception** — use `handleApiError` or `logger.exception`.
3. **Never swallow** — empty `catch {}` is forbidden for unexpected failures; at minimum `logger.warn`.
4. **No secrets** — passwords, OTP, JWT, cookies, card data, API secrets are redacted.
5. **Avoid duplicates** — one ERROR per failure (handler logs; HTTP access log is separate INFO/WARN).
6. **Keep INFO concise** — use DEBUG/TRACE for payloads, SQL text, cache hits.
7. **Correlation first** — always include `correlationId` when debugging across SPA ↔ API.

## 3. Log Level Guidelines

| Level | When |
|-------|------|
| TRACE | Very detailed execution (dev only; `LOG_LEVEL=trace`) |
| DEBUG | Variable values, safe payloads, cache hits (`LOG_LEVEL=debug` default in non-prod) |
| INFO | Startup, login success, HTTP 2xx, CRUD success, external API OK |
| WARN | Retries, slow API/DB/external, auth failures, recoverable surprises |
| ERROR | Request failures, query failures, external API errors |
| FATAL | Startup failure, DB pool crash, health check DB down, uncaught exception |

### Thresholds (env-configurable)

| Env var | Default | Meaning |
|---------|---------|---------|
| `LOG_LEVEL` | prod=`info`, dev=`debug` | Minimum level |
| `SLOW_API_MS` | `500` | Warn on slow HTTP |
| `SLOW_QUERY_MS` | `200` | Warn via `loggedQuery()` |
| `SLOW_EXTERNAL_MS` | `3000` | Warn on slow NIC/GST calls |
| `LOGTAIL_TOKEN` | unset | Enable Better Stack Logtail (source token) |
| `LOGTAIL_ENDPOINT` | default Better Stack ingest | Required for most new sources — copy **Ingesting host** from the source page |
| `SERVICE_NAME` | `dg-erp-api` | Service field in logs |

## 4. Observability Improvements Delivered

- Unified structured JSON logging (ELK/Loki/CloudWatch compatible)
- Full exception context (message, stack, cause, file/line, user, tenant, request)
- Production HTTP access logs with duration, status, user/tenant, correlation ID
- Auth security events: login success/failure, expired/invalid JWT, permission denied
- Database pool FATAL, transaction rollback/deadlock logging
- NIC GST outbound request logging (URL, status, duration — never credentials)
- Frontend: global error + unhandledrejection handlers, ErrorBoundary ref IDs, API failure logs with correlation
- Logtail flush on SIGTERM/SIGINT for clean Render deploys

## 5. Remaining Recommendations

1. **OpenTelemetry / APM** — add traces for multi-service latency (optional `@opentelemetry/sdk-node`).
2. **Sentry (or Logtail browser SDK)** — ship SPA errors to a hosted aggregator with release/source maps.
3. **Migrate silent `.catch(() => {})` in SPA features** — replace with `clientLogger.warn` + toast where UX-critical.
4. **Super-admin raw `fetch`** — route through `fetchApi` for consistent correlation + retry.
5. **Metrics** — Prometheus/StatsD counters for `login_failed`, `http_5xx`, `slow_query` (logs alone are not enough for SLOs).
6. **Adopt `loggedQuery()`** on hottest SQL paths for systematic slow-query visibility.
7. **Alerting** — page on FATAL / health `db=down` / spike in `Login failed` per IP.

## Developer quick reference

```ts
// Route handler
} catch (err) {
  return handleApiError(req, res, err, 'Failed to create invoice', {
    context: { invoiceId, customerId },
  });
}

// Auth / security (no password/email)
logAuthEvent('Login failed', req, { reason: 'bad_password', userId }, 'warn');

// Explicit exception
logger.exception('Something broke', err, { resourceId });
```
