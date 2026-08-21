/**
 * Extended Job Work tests — status workflow, validation, filtering, invoice GST.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-JW-EXT-001';
const U = 'U-JW-EXT-ADM';

const token = createTestToken({ userId: U, tenantId: T, email: 'admin@jw-ext.test', role: 'Admin', name: 'Admin' });
const hdrs = authHeaders(token, T);

async function createJob(overrides: Record<string, unknown> = {}) {
  const r = await api()
    .post('/api/job-work')
    .set(hdrs)
    .send({
      clientName: 'Test Client',
      clientPhone: '9876543210',
      description: 'VMC milling',
      material: 'EN8 steel',
      estimatedAmount: 3000,
      gstRate: 18,
      ...overrides,
    });
  expect(r.status).toBe(201);
  return r.body as { id: string; jobNumber: string; status: string };
}

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'JW Ext Corp','jw-ext-corp','admin@jw-ext.test','Admin','active','TRIAL') ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'admin@jw-ext.test',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

// ── Validation ────────────────────────────────────────────────────────────────
describe('POST /api/job-work — validation', () => {
  it('returns 400 when clientName missing', async () => {
    const r = await api().post('/api/job-work').set(hdrs).send({ description: 'Work' });
    expect(r.status).toBe(400);
  });

  it('returns 400 when description missing', async () => {
    const r = await api().post('/api/job-work').set(hdrs).send({ clientName: 'Client' });
    expect(r.status).toBe(400);
  });

  it('creates with minimum fields', async () => {
    const r = await api().post('/api/job-work').set(hdrs).send({ clientName: 'Minimal', description: 'Basic job' });
    expect(r.status).toBe(201);
    expect(r.body.status).toBe('received');
    expect(r.body.gstRate).toBe(18); // default
  });
});

// ── Job number format ─────────────────────────────────────────────────────────
describe('Job number generation', () => {
  it('generates sequential job numbers within same tenant', async () => {
    const j1 = await createJob();
    const j2 = await createJob();
    const n1 = parseInt(j1.jobNumber.split('-')[2]);
    const n2 = parseInt(j2.jobNumber.split('-')[2]);
    expect(n2).toBeGreaterThan(n1);
  });

  it('job_number includes current year', async () => {
    const j = await createJob();
    const year = new Date().getFullYear().toString();
    expect(j.jobNumber).toContain(year);
  });
});

// ── Full status workflow ──────────────────────────────────────────────────────
describe('Status workflow — full path', () => {
  it('received → in_process → completed → delivered → invoiced', async () => {
    const job = await createJob({ estimatedAmount: 10000, gstRate: 18 });
    const id = job.id;

    // received → in_process
    let r = await api().patch(`/api/job-work/${id}/status`).set(hdrs).send({ status: 'in_process' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('in_process');

    // in_process → completed
    r = await api().patch(`/api/job-work/${id}/status`).set(hdrs).send({ status: 'completed' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('completed');
    expect(r.body.completedDate).toBeTruthy(); // timestamp set

    // completed → delivered
    r = await api().patch(`/api/job-work/${id}/status`).set(hdrs).send({ status: 'delivered' });
    expect(r.status).toBe(200);
    expect(r.body.deliveredDate).toBeTruthy();

    // delivered → invoice
    r = await api().post(`/api/job-work/${id}/invoice`).set(hdrs).send({ finalAmount: 10000 });
    expect(r.status).toBe(201);
    expect(r.body.invoiceId).toBeTruthy();

    // GST check: 10000 + 18% = 11800
    expect(Number(r.body.grandTotal)).toBeCloseTo(11800, 0);

    // status should be invoiced now
    const get = await api().get(`/api/job-work/${id}`).set(hdrs);
    expect(get.body.status).toBe('invoiced');
    expect(get.body.invoiceId).toBeTruthy();
  });
});

// ── Filtering ─────────────────────────────────────────────────────────────────
describe('GET /api/job-work — filtering', () => {
  let pendingId: string;
  let doneId: string;

  beforeAll(async () => {
    const p = await createJob({ clientName: 'Filter Client A' });
    pendingId = p.id;

    const d = await createJob({ clientName: 'Filter Client B' });
    doneId = d.id;
    await api().patch(`/api/job-work/${doneId}/status`).set(hdrs).send({ status: 'in_process' });
    await api().patch(`/api/job-work/${doneId}/status`).set(hdrs).send({ status: 'completed' });
  });

  it('filters by status=received', async () => {
    const r = await api().get('/api/job-work?status=received').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.every((j: { status: string }) => j.status === 'received')).toBe(true);
    expect(r.body.some((j: { id: string }) => j.id === pendingId)).toBe(true);
  });

  it('filters by status=completed excludes received', async () => {
    const r = await api().get('/api/job-work?status=completed').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.some((j: { id: string }) => j.id === pendingId)).toBe(false);
  });

  it('filters by clientName (partial match)', async () => {
    const r = await api().get('/api/job-work?clientName=Filter+Client+A').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.some((j: { id: string }) => j.id === pendingId)).toBe(true);
  });

  it('pagination works', async () => {
    const r = await api().get('/api/job-work?limit=2&page=1').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.length).toBeLessThanOrEqual(2);
  });
});

// ── Summary ───────────────────────────────────────────────────────────────────
describe('GET /api/job-work/summary', () => {
  it('returns all status counts and revenue', async () => {
    const r = await api().get('/api/job-work/summary').set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('received');
    expect(typeof r.body.received).toBe('number');
    expect(r.body).toHaveProperty('overdueCount');
    expect(r.body).toHaveProperty('totalRevenue');
    expect(typeof r.body.totalRevenue).toBe('number');
  });
});

// ── GET single ────────────────────────────────────────────────────────────────
describe('GET /api/job-work/:id', () => {
  it('returns job details', async () => {
    const job = await createJob({ clientName: 'Detail Client', notes: 'Special instructions' });
    const r = await api().get(`/api/job-work/${job.id}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.clientName).toBe('Detail Client');
    expect(r.body.notes).toBe('Special instructions');
  });

  it('returns 404 for unknown id', async () => {
    const r = await api().get('/api/job-work/nonexistent-xyz').set(hdrs);
    expect(r.status).toBe(404);
  });
});

// ── Auth ─────────────────────────────────────────────────────────────────────
describe('Auth checks', () => {
  it('401 on all endpoints without token', async () => {
    expect((await api().get('/api/job-work')).status).toBe(401);
    expect((await api().post('/api/job-work').send({})).status).toBe(401);
    expect((await api().get('/api/job-work/summary')).status).toBe(401);
  });
});
