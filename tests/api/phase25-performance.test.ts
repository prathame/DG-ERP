/**
 * Phase 2.5: FORCE RLS performance measurement.
 *
 * Measures actual latency overhead from the pool.query() FORCE RLS wrapper
 * (BEGIN + SET LOCAL app.tenant_id + query + COMMIT = 4 round-trips per pool.query call).
 *
 * Tests concurrent user simulation for high-frequency endpoints.
 *
 * Results are reported with p50/p95/p99 so we can determine:
 *   - Safe concurrency level
 *   - Which endpoints need withTenantClient() migration
 *   - Whether DATABASE_POOL_SIZE=20 is sufficient
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-PERF-001';
const U = 'U-PERF-ADMIN';

const token = createTestToken({ userId: U, tenantId: T, email: 'perf@test.com', role: 'Admin', name: 'Perf Admin' });
const hdrs = authHeaders(token, T);

function percentile(sorted: number[], p: number): number {
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function measureEndpoint(
  label: string,
  fn: () => Promise<{ status: number }>,
  n = 20,
): Promise<{ label: string; p50: number; p95: number; p99: number; max: number; errors: number }> {
  const times: number[] = [];
  let errors = 0;

  for (let i = 0; i < n; i++) {
    const start = Date.now();
    try {
      const r = await fn();
      if (r.status >= 500) errors++;
    } catch {
      errors++;
    }
    times.push(Date.now() - start);
  }

  times.sort((a, b) => a - b);
  return {
    label,
    p50: percentile(times, 50),
    p95: percentile(times, 95),
    p99: percentile(times, 99),
    max: times[times.length - 1],
    errors,
  };
}

async function concurrentRequests(
  n: number,
  fn: () => Promise<{ status: number }>,
): Promise<{ succeeded: number; errors: number; durationMs: number }> {
  const start = Date.now();
  const results = await Promise.allSettled(Array.from({ length: n }, fn));
  const durationMs = Date.now() - start;
  const succeeded = results.filter(
    r => r.status === 'fulfilled' && (r.value as { status: number }).status < 500,
  ).length;
  const errors = n - succeeded;
  return { succeeded, errors, durationMs };
}

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'Perf Corp','perf-corp','perf@test.com','Perf','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'perf@test.com',$3,'Perf','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(`INSERT INTO bill_settings (tenant_id) VALUES ($1) ON CONFLICT DO NOTHING`, [T]);
});

afterAll(async () => {
  await cleanupTestData(T);
});

// ─── Sequential baseline latency ─────────────────────────────────────────────

describe('FORCE RLS overhead — sequential latency (20 requests each)', () => {
  let results: ReturnType<typeof measureEndpoint> extends Promise<infer T> ? T : never;

  it('GET /api/settings/profile: p50 < 500ms, p99 < 1500ms', async () => {
    const r = await measureEndpoint('settings/profile', () => api().get('/api/settings/profile').set(hdrs));
    console.log(
      `\n[PERF] settings/profile: p50=${r.p50}ms p95=${r.p95}ms p99=${r.p99}ms max=${r.max}ms errors=${r.errors}`,
    );
    expect(r.errors).toBe(0);
    expect(r.p50).toBeLessThan(500);
    expect(r.p99).toBeLessThan(1500);
  }, 60000);

  it('GET /api/products (empty list): p50 < 500ms, p99 < 1500ms', async () => {
    const r = await measureEndpoint('products/list', () => api().get('/api/products').set(hdrs));
    console.log(`[PERF] products/list: p50=${r.p50}ms p95=${r.p95}ms p99=${r.p99}ms max=${r.max}ms errors=${r.errors}`);
    expect(r.errors).toBe(0);
    expect(r.p50).toBeLessThan(500);
    expect(r.p99).toBeLessThan(1500);
  }, 60000);

  it('GET /api/dashboard/stats: p50 < 1000ms, p99 < 3000ms', async () => {
    const r = await measureEndpoint('dashboard/stats', () => api().get('/api/dashboard/stats').set(hdrs));
    console.log(
      `[PERF] dashboard/stats: p50=${r.p50}ms p95=${r.p95}ms p99=${r.p99}ms max=${r.max}ms errors=${r.errors}`,
    );
    expect(r.errors).toBe(0);
    expect(r.p50).toBeLessThan(1000);
    expect(r.p99).toBeLessThan(3000);
  }, 60000);

  it('GET /api/notifications: p50 < 1500ms, p99 < 4000ms', async () => {
    // Notifications runs 8 sequential pool.query() calls = 32 round-trips
    const r = await measureEndpoint('notifications', () => api().get('/api/notifications').set(hdrs));
    console.log(`[PERF] notifications: p50=${r.p50}ms p95=${r.p95}ms p99=${r.p99}ms max=${r.max}ms errors=${r.errors}`);
    expect(r.errors).toBe(0);
    // Generous threshold — 8 sequential × 4 round-trips each
    expect(r.p50).toBeLessThan(1500);
    expect(r.p99).toBeLessThan(4000);
  }, 60000);

  it('GET /api/analytics/overview: p50 < 2000ms, p99 < 5000ms', async () => {
    // analytics/overview: 12 pool.query calls, 10 parallel = 10 simultaneous connections
    const r = await measureEndpoint('analytics/overview', () => api().get('/api/analytics/overview').set(hdrs));
    console.log(
      `[PERF] analytics/overview: p50=${r.p50}ms p95=${r.p95}ms p99=${r.p99}ms max=${r.max}ms errors=${r.errors}`,
    );
    expect(r.errors).toBe(0);
    // 10 parallel connections × 4 round-trips — latency bounded by max(individual query times)
    expect(r.p50).toBeLessThan(2000);
    expect(r.p99).toBeLessThan(5000);
  }, 60000);
});

// ─── Concurrent user simulation ───────────────────────────────────────────────

describe('Concurrent user simulation — pool exhaustion check', () => {
  it('5 concurrent dashboard/stats — no errors', async () => {
    const r = await concurrentRequests(5, () => api().get('/api/dashboard/stats').set(hdrs));
    console.log(
      `\n[PERF] 5 concurrent dashboard/stats: ${r.succeeded} ok, ${r.errors} errors, ${r.durationMs}ms total`,
    );
    expect(r.errors).toBe(0);
    expect(r.succeeded).toBe(5);
  }, 30000);

  it('10 concurrent profile requests — no errors (low pool pressure)', async () => {
    const r = await concurrentRequests(10, () => api().get('/api/settings/profile').set(hdrs));
    console.log(`[PERF] 10 concurrent profile: ${r.succeeded} ok, ${r.errors} errors, ${r.durationMs}ms total`);
    expect(r.errors).toBe(0);
    expect(r.succeeded).toBe(10);
  }, 30000);

  it('3 concurrent analytics/overview — should succeed without pool exhaustion', async () => {
    // Each analytics/overview request peaks at 10 simultaneous connections.
    // 3 concurrent × 10 = 30 connections — exceeds current pool of 20.
    // With pool=20, some requests WILL queue but should not error.
    const r = await concurrentRequests(3, () => api().get('/api/analytics/overview').set(hdrs));
    console.log(
      `[PERF] 3 concurrent analytics/overview: ${r.succeeded} ok, ${r.errors} errors, ${r.durationMs}ms total`,
    );
    // With DATABASE_POOL_SIZE=20, 3 concurrent analytics should queue but succeed
    // 5xx would indicate pool exhaustion → failure
    expect(r.errors).toBe(0);
  }, 60000);

  it('5 concurrent notifications — sequential queries but low pool impact', async () => {
    // Notifications uses 8 sequential pool.query() — each holds only 1 connection at a time.
    // 5 concurrent = max 5 simultaneous connections (well within pool=20).
    const r = await concurrentRequests(5, () => api().get('/api/notifications').set(hdrs));
    console.log(`[PERF] 5 concurrent notifications: ${r.succeeded} ok, ${r.errors} errors, ${r.durationMs}ms total`);
    expect(r.errors).toBe(0);
  }, 60000);

  it('20 concurrent simple GETs — no errors (pool size validation)', async () => {
    // 20 concurrent requests, each using 1 pool.query = 1 connection at a time.
    // With pool=20, exactly fills the pool momentarily.
    const r = await concurrentRequests(20, () => api().get('/api/products').set(hdrs));
    console.log(`[PERF] 20 concurrent products/list: ${r.succeeded} ok, ${r.errors} errors, ${r.durationMs}ms total`);
    expect(r.errors).toBe(0);
  }, 30000);
});

// ─── Invoice creation throughput ──────────────────────────────────────────────

describe('Invoice creation throughput', () => {
  it('10 sequential invoice creates — no errors, unique numbers', async () => {
    const invoiceNumbers: string[] = [];
    for (let i = 0; i < 10; i++) {
      const r = await api()
        .post('/api/invoices')
        .set(hdrs)
        .send({
          customerName: `Perf Customer ${i}`,
          items: [{ description: 'Item', quantity: 1, price: 100, taxable: 100, tax: 0, total: 100 }],
          subtotal: 100,
          taxTotal: 0,
          grandTotal: 100,
          gstEnabled: false,
        });
      expect(r.status).toBe(201);
      if (r.body.invoiceNumber) invoiceNumbers.push(r.body.invoiceNumber);
    }
    const unique = new Set(invoiceNumbers);
    expect(unique.size).toBe(invoiceNumbers.length);
    console.log(`\n[PERF] 10 sequential invoice creates: ${invoiceNumbers.length} unique numbers generated`);
  }, 60000);

  it('5 concurrent invoice creates — all get unique numbers (advisory lock test)', async () => {
    const results = await Promise.all(
      Array.from({ length: 5 }, (_, i) =>
        api()
          .post('/api/invoices')
          .set(hdrs)
          .send({
            customerName: `Concurrent Customer ${i}`,
            items: [{ description: 'Item', quantity: 1, price: 100, taxable: 100, tax: 0, total: 100 }],
            subtotal: 100,
            taxTotal: 0,
            grandTotal: 100,
            gstEnabled: false,
          }),
      ),
    );
    const succeeded = results.filter(r => r.status === 201);
    const invoiceNumbers = succeeded.map(r => r.body.invoiceNumber).filter(Boolean);
    const unique = new Set(invoiceNumbers);
    console.log(
      `[PERF] 5 concurrent invoice creates: ${succeeded.length} succeeded, ${invoiceNumbers.length} unique numbers`,
    );
    expect(unique.size).toBe(invoiceNumbers.length);
  }, 30000);
});
