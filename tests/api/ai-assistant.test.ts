/**
 * AI Assistant endpoint tests.
 *
 * Tests the POST /api/ai/assistant endpoint:
 * - Falls back to regex chatbot when no Gemini key
 * - Input validation (empty, too long)
 * - Vendor role blocked
 * - Returns { text } at minimum
 * - Tenant isolation
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-AI-ASST-001';
const U = 'U-AI-ADMIN-001';

const token = createTestToken({ userId: U, tenantId: T, email: 'ai@test.com', role: 'Admin', name: 'AI Admin' });
const hdrs = authHeaders(token, T);

const vendorToken = createTestToken({
  userId: 'U-AI-VND',
  tenantId: T,
  email: 'vnd@ai.test',
  role: 'Vendor',
  name: 'Vendor',
});
const vendorHdrs = authHeaders(vendorToken, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'AI Test Corp','ai-test-corp','ai@test.com','Admin','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'ai@test.com',$3,'AI Admin','Admin'),
            ('U-AI-VND',$2,'vnd@ai.test',$3,'Vendor','Vendor')
     ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(
    `INSERT INTO products (id, tenant_id, name, price, stock)
     VALUES ('PRD-AI-001',$1,'Test Widget',100,50)
     ON CONFLICT DO NOTHING`,
    [T],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

describe('POST /api/ai/assistant', () => {
  it('returns a text response for a greeting (fallback mode, no Gemini key)', async () => {
    const r = await api().post('/api/ai/assistant').set(hdrs).send({ message: 'hello' });
    expect(r.status).toBe(200);
    expect(typeof r.body.text).toBe('string');
    expect(r.body.text.length).toBeGreaterThan(0);
  });

  it('returns data for "low stock" query (fallback mode)', async () => {
    const r = await api().post('/api/ai/assistant').set(hdrs).send({ message: 'low stock' });
    expect(r.status).toBe(200);
    expect(typeof r.body.text).toBe('string');
  });

  it('accepts conversation history', async () => {
    const r = await api()
      .post('/api/ai/assistant')
      .set(hdrs)
      .send({
        message: 'what about inventory?',
        history: [
          { role: 'user', text: 'hello' },
          { role: 'assistant', text: 'Hi! How can I help?' },
        ],
      });
    expect(r.status).toBe(200);
    expect(typeof r.body.text).toBe('string');
  });

  it('rejects empty message', async () => {
    const r = await api().post('/api/ai/assistant').set(hdrs).send({ message: '' });
    expect(r.status).toBe(400);
  });

  it('rejects missing message', async () => {
    const r = await api().post('/api/ai/assistant').set(hdrs).send({});
    expect(r.status).toBe(400);
  });

  it('rejects message over 2000 chars', async () => {
    const r = await api()
      .post('/api/ai/assistant')
      .set(hdrs)
      .send({ message: 'a'.repeat(2001) });
    expect(r.status).toBe(400);
  });

  it('blocks vendor role', async () => {
    const r = await api().post('/api/ai/assistant').set(vendorHdrs).send({ message: 'hello' });
    expect(r.status).toBe(403);
  });

  it('requires authentication', async () => {
    const r = await api().post('/api/ai/assistant').send({ message: 'hello' });
    expect([401, 403]).toContain(r.status);
  });

  it('never returns action in fallback mode (regex chatbot)', async () => {
    const r = await api().post('/api/ai/assistant').set(hdrs).send({ message: 'sales today' });
    expect(r.status).toBe(200);
    // Regex fallback doesn't return actions
    expect(r.body.action).toBeUndefined();
  });
});
