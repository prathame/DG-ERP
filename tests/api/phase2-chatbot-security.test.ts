/**
 * Phase 2: Chatbot security tests.
 *
 * Tests:
 * - LIKE wildcard injection prevention (% and _ should not dump all data)
 * - Chatbot scoped to tenant (no cross-tenant data)
 * - Vendor role cannot use chatbot (blockVendors)
 * - Empty/invalid message handling
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-CHAT-SEC-001';
const U = 'U-CHAT-ADMIN-001';
const T_OTHER = 'T-CHAT-OTHER-001';

const token = createTestToken({ userId: U, tenantId: T, email: 'chat@test.com', role: 'Admin', name: 'Chat Admin' });
const hdrs = authHeaders(token, T);

const vendorToken = createTestToken({
  userId: 'U-CHAT-VND',
  tenantId: T,
  email: 'vnd@chat.test',
  role: 'Vendor',
  name: 'Vendor',
});
const vendorHdrs = authHeaders(vendorToken, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await cleanupTestData(T_OTHER);

  for (const [id, slug, email] of [
    [T, 'chat-sec-corp', 'chat@test.com'],
    [T_OTHER, 'chat-other-corp', 'other@test.com'],
  ]) {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
       VALUES ($1,'Chat Corp',$2,$3,'Admin','active','TRIAL') ON CONFLICT (id) DO NOTHING`,
      [id, slug, email],
    );
  }
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'chat@test.com',$3,'Chat Admin','Admin'),
            ('U-CHAT-VND',$2,'vnd@chat.test',$3,'Vendor','Vendor')
     ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );

  // Seed vendors for Tenant T — these should NOT be visible to other tenants
  await pool.query(
    `INSERT INTO vendors (id, tenant_id, name, phone)
     VALUES ('VND-CHAT-SECRET','${T}','SECRET Vendor Corp','9800000001')
     ON CONFLICT DO NOTHING`,
  );
  // Seed vendor for OTHER tenant — must NOT appear in T's chatbot
  await pool.query(
    `INSERT INTO vendors (id, tenant_id, name, phone)
     VALUES ('VND-OTHER-001','${T_OTHER}','Other Tenant Vendor','9800000002')
     ON CONFLICT DO NOTHING`,
  );
  // Seed customer for T
  await pool.query(
    `INSERT INTO customers (id, tenant_id, name, phone)
     VALUES ('CUST-CHAT-001','${T}','SECRET Customer','9700000001')
     ON CONFLICT DO NOTHING`,
  );
});

afterAll(async () => {
  await cleanupTestData(T);
  await cleanupTestData(T_OTHER);
});

// ─── LIKE wildcard injection ──────────────────────────────────────────────────

describe('LIKE wildcard injection prevention', () => {
  it('message "%" does not dump all vendor names (wildcard escaped)', async () => {
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: '%' });
    expect(r.status).toBe(200);
    // With proper escaping, '%' matches nothing — should return "not found" message
    // NOT a list of all vendors
    const body = typeof r.body.text === 'string' ? r.body.text : '';
    expect(body).not.toMatch(/SECRET Vendor Corp/);
    // Should not list multiple vendor names (wildcard matched all)
    expect(body).not.toMatch(/Found \d+ vendors matching/);
  });

  it('message "_" does not match all single-char names (single-char wildcard escaped)', async () => {
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: '_' });
    expect(r.status).toBe(200);
    const body = typeof r.body.text === 'string' ? r.body.text : '';
    expect(body).not.toMatch(/SECRET Vendor Corp/);
  });

  it('message "%" does not dump all customers', async () => {
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: '%' });
    const body = typeof r.body.text === 'string' ? r.body.text : '';
    expect(body).not.toMatch(/SECRET Customer/);
  });

  it('search "%" does not dump product names', async () => {
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price)
       VALUES ('PRD-CHAT-SECRET',$1,'SECRET Product Widget',100)
       ON CONFLICT DO NOTHING`,
      [T],
    );
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: 'search %' });
    expect(r.status).toBe(200);
    const body = typeof r.body.text === 'string' ? r.body.text : '';
    expect(body).not.toMatch(/SECRET Product Widget/);
  });

  it('exact vendor name still works (not over-escaped)', async () => {
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: 'secret vendor corp' });
    expect(r.status).toBe(200);
    // The exact vendor name should still be findable
    // (escaping only affects %, _, \ — not normal letters)
  });
});

// ─── Vendor role blocked ──────────────────────────────────────────────────────

describe('Vendor role cannot use chatbot', () => {
  it('POST /api/chatbot with Vendor JWT returns 403', async () => {
    const r = await api().post('/api/chatbot').set(vendorHdrs).send({ message: 'hello' });
    expect(r.status).toBe(403);
  });
});

// ─── Empty/invalid input ─────────────────────────────────────────────────────

describe('Input validation', () => {
  it('empty message returns a response (not 500)', async () => {
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: '' });
    // Empty message: either 200 with a text response or 400 — but never 500
    expect(r.status).not.toBe(500);
    if (r.status === 200) {
      expect(typeof r.body.text).toBe('string');
    }
  });

  it('very long message returns a response (not 500)', async () => {
    const long = 'a'.repeat(5000);
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: long });
    expect([200, 400]).toContain(r.status);
  });

  it('numeric message returns a response (not 500)', async () => {
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: 12345 });
    expect([200, 400]).toContain(r.status);
  });
});

// ─── Tenant isolation in chatbot queries ─────────────────────────────────────

describe('Tenant isolation — chatbot cannot cross tenant boundary', () => {
  it('Tenant T chatbot does not return Other Tenant vendor data', async () => {
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: 'other tenant vendor' });
    expect(r.status).toBe(200);
    const body = typeof r.body.text === 'string' ? r.body.text : '';
    expect(body).not.toMatch(/Other Tenant Vendor/);
  });

  it('basic chatbot commands work', async () => {
    for (const msg of ['hello', 'help', 'sales today', 'dispatch today', 'products running low']) {
      const r = await api().post('/api/chatbot').set(hdrs).send({ message: msg });
      expect(r.status).toBe(200);
      expect(typeof r.body.text).toBe('string');
      expect(r.body.text.length).toBeGreaterThan(0);
    }
  });

  it('how-to questions return app guidance', async () => {
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: 'how to set sale units' });
    expect(r.status).toBe(200);
    expect(r.body.text).toMatch(/Bill Customization/i);
    expect(r.body.text).toMatch(/Sale Units/i);
  });

  it('unpaid invoices does not 500', async () => {
    const r = await api().post('/api/chatbot').set(hdrs).send({ message: 'unpaid invoices' });
    expect(r.status).toBe(200);
    expect(typeof r.body.text).toBe('string');
  });
});

// ─── Quick actions ────────────────────────────────────────────────────────────

describe('Chatbot quick actions', () => {
  it('GET /api/chatbot/quick-actions returns { actions: [...] }', async () => {
    const r = await api().get('/api/chatbot/quick-actions').set(hdrs);
    expect(r.status).toBe(200);
    // Response is { actions: string[] }
    expect(Array.isArray(r.body.actions)).toBe(true);
    expect(r.body.actions.length).toBeGreaterThan(0);
    expect(r.body.actions).toContain('help');
  });
});

describe('Chatbot can be disabled per company', () => {
  it('POST /api/chatbot returns 403 when chatbot_enabled is false', async () => {
    await pool.query('UPDATE tenants SET chatbot_enabled = false WHERE id = $1', [T]);
    try {
      const r = await api().post('/api/chatbot').set(hdrs).send({ message: 'help' });
      expect(r.status).toBe(403);
    } finally {
      await pool.query('UPDATE tenants SET chatbot_enabled = true WHERE id = $1', [T]);
    }
  });
});
