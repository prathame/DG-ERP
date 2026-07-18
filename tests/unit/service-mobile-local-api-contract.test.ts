/**
 * Local API contract for Offline Mobile Masters screens.
 * Treats `handleLocalApiRequest` as the real API — catches 404 / wrong shape regressions.
 *
 * Masters tab → endpoints (keep in sync with UI):
 * - Clients  → GET/POST /vendors, POST /vendors/bulk, PUT/DELETE /vendors/:id
 * - Prices   → GET/POST /price-lists, POST /price-lists/bulk, DELETE /price-lists/:id, GET /price-lists/resolve
 * - Banks    → GET/POST /banks, POST /banks/batch, PUT/DELETE /banks/:id
 * - Staff    → GET/POST /staff, POST /staff/batch, PUT/DELETE /staff/:id
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

let db: PGlite;

vi.mock('../../src/platforms/service-mobile/local/db', () => ({
  localQuery: async (sql: string, params: unknown[] = []) => {
    const result = await db.query(sql, params);
    return { rows: result.rows ?? [], rowCount: result.affectedRows ?? result.rows?.length ?? 0 };
  },
  getLocalDb: async () => db,
  localExec: async (sql: string) => {
    await db.exec(sql);
  },
}));

vi.mock('../../src/platforms/service-mobile/local/auth', () => ({
  verifyLocalToken: async () => ({
    userId: 'u1',
    tenantId: 't1',
    email: 'admin@test.local',
    name: 'Admin',
    role: 'Admin',
    businessType: 'service',
  }),
  localLogin: async () => null,
}));

const { handleLocalApiRequest } = await import('../../src/platforms/service-mobile/local/router');

const AUTH = { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' };

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const res = await handleLocalApiRequest(
    method,
    `/api${path}`,
    AUTH,
    body === undefined ? null : JSON.stringify(body),
  );
  if (!res) return { status: 0, json: { error: 'null response (cloud path)' } };
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

async function setupDb() {
  const schemaPath = resolve(__dirname, '../../src/platforms/service-mobile/local/schema.ts');
  const schema = readFileSync(schemaPath, 'utf8');
  const m = schema.match(/export const SERVICE_MOBILE_SCHEMA_SQL = `([\s\S]*?)`;/);
  const mig = schema.match(/export const SERVICE_MOBILE_MIGRATIONS_SQL = `([\s\S]*?)`;/);
  if (!m) throw new Error('schema SQL missing');
  db = await PGlite.create();
  await db.exec(m[1]!);
  if (mig) {
    for (const s of mig[1]!
      .split(';')
      .map(x => x.trim())
      .filter(Boolean)) {
      try {
        await db.exec(`${s};`);
      } catch {
        /* ignore migration noise */
      }
    }
  }
  await db.query(
    `INSERT INTO tenants (id, company_name, slug, business_type) VALUES ('t1','Test Co','test','service')`,
  );
  await db.query(
    `INSERT INTO users (id, tenant_id, email, name, role, password_hash, is_active)
     VALUES ('u1','t1','admin@test.local','Admin','Admin','x',true)`,
  );
}

describe('service-mobile local API contract — Masters', () => {
  beforeEach(async () => {
    await setupDb();
  });

  afterEach(async () => {
    await db?.close();
  });

  describe('Banks', () => {
    it('GET returns array; POST/PUT/DELETE/batch use camelCase ifscCode', async () => {
      const empty = await api('GET', '/banks');
      expect(empty.status).toBe(200);
      expect(Array.isArray(empty.json)).toBe(true);
      expect(empty.json).toEqual([]);

      const created = await api('POST', '/banks', {
        name: 'Main A/C',
        accountNumber: '111',
        bankName: 'HDFC',
        branch: 'SG',
        ifscCode: 'HDFC0001111',
      });
      expect(created.status).toBe(201);
      const bank = created.json as Record<string, unknown>;
      expect(bank.id).toBeTruthy();
      expect(bank.name).toBe('Main A/C');
      expect(bank.accountNumber).toBe('111');
      expect(bank.bankName).toBe('HDFC');
      expect(bank.ifscCode).toBe('HDFC0001111');

      const listed = await api('GET', '/banks');
      expect(listed.status).toBe(200);
      const list = listed.json as Record<string, unknown>[];
      expect(list).toHaveLength(1);
      expect(list[0]!.ifscCode).toBe('HDFC0001111');

      const updated = await api('PUT', `/banks/${bank.id}`, {
        name: 'Main A/C',
        accountNumber: '111',
        bankName: 'HDFC',
        branch: 'SG Hwy',
        ifscCode: 'HDFC0002222',
      });
      expect(updated.status).toBe(200);
      expect((updated.json as Record<string, unknown>).ifscCode).toBe('HDFC0002222');
      expect((updated.json as Record<string, unknown>).branch).toBe('SG Hwy');

      const batch = await api('POST', '/banks/batch', {
        items: [{ name: 'Payroll', accountNumber: '222', bankName: 'SBI', ifscCode: 'SBIN0001' }],
      });
      expect(batch.status).toBe(201);
      expect((batch.json as { success: number }).success).toBe(1);

      const del = await api('DELETE', `/banks/${bank.id}`);
      expect(del.status).toBe(200);
      expect((await api('GET', '/banks')).json as unknown[]).toHaveLength(1);
    });

    it('POST without name is 400 (not silent Bank default)', async () => {
      const res = await api('POST', '/banks', { bankName: 'HDFC' });
      expect(res.status).toBe(400);
    });
  });

  describe('Staff', () => {
    it('GET returns array with payment aggregates; CRUD + batch work', async () => {
      const empty = await api('GET', '/staff');
      expect(empty.status).toBe(200);
      expect(Array.isArray(empty.json)).toBe(true);

      const created = await api('POST', '/staff', {
        name: 'Ram',
        phone: '9876543210',
        role: 'Tech',
        salary: 20000,
      });
      expect(created.status).toBe(201);
      const staff = created.json as Record<string, unknown>;
      expect(staff.id).toBeTruthy();
      expect(staff.name).toBe('Ram');
      expect(staff.totalPaid).toBe(0);
      expect(staff.advanceBalance).toBe(0);
      expect(staff.paymentCount).toBe(0);

      const listed = await api('GET', '/staff');
      expect((listed.json as unknown[]).length).toBe(1);
      expect((listed.json as Record<string, unknown>[])[0]!.salary).toBe(20000);

      const upd = await api('PUT', `/staff/${staff.id}`, {
        name: 'Ram Kumar',
        phone: '9876543210',
        role: 'Lead',
        salary: 25000,
      });
      expect(upd.status).toBe(200);
      expect((upd.json as { ok: boolean }).ok).toBe(true);

      const batch = await api('POST', '/staff/batch', {
        items: [{ name: 'Sita', role: 'Admin', salary: 15000 }],
      });
      expect(batch.status).toBe(201);
      expect((batch.json as { success: number }).success).toBe(1);

      const del = await api('DELETE', `/staff/${staff.id}`);
      expect(del.status).toBe(200);
      expect((await api('GET', '/staff')).json as unknown[]).toHaveLength(1);
    });

    it('GET/POST /payroll records payments for a staff member', async () => {
      const created = await api('POST', '/staff', {
        name: 'Payee',
        role: 'Helper',
        salary: 10000,
      });
      expect(created.status).toBe(201);

      const empty = await api('GET', '/payroll?staffName=Payee');
      expect(empty.status).toBe(200);
      expect(Array.isArray(empty.json)).toBe(true);
      expect((empty.json as unknown[]).length).toBe(0);

      const paid = await api('POST', '/payroll', {
        staffName: 'Payee',
        amount: 10000,
        paymentType: 'salary',
        paymentDate: '2026-07-01',
        paymentMethod: 'Cash',
      });
      expect(paid.status).toBe(201);
      const row = paid.json as Record<string, unknown>;
      expect(row.id).toBeTruthy();
      expect(row.staffName).toBe('Payee');
      expect(row.amount).toBe(10000);
      expect(row.paymentType).toBe('salary');

      const listed = await api('GET', '/payroll?staffName=Payee');
      expect(listed.status).toBe(200);
      expect((listed.json as unknown[]).length).toBe(1);
      expect((listed.json as Record<string, unknown>[])[0]!.paymentType).toBe('salary');

      const staffList = await api('GET', '/staff');
      const payee = (staffList.json as Record<string, unknown>[]).find(s => s.name === 'Payee');
      expect(payee).toBeTruthy();
      expect(payee!.totalPaid).toBe(10000);
      expect(payee!.paymentCount).toBe(1);
    });
  });

  describe('Clients (vendors)', () => {
    it('GET returns array; POST allows empty email', async () => {
      const empty = await api('GET', '/vendors');
      expect(empty.status).toBe(200);
      expect(Array.isArray(empty.json)).toBe(true);

      const created = await api('POST', '/vendors', { name: 'Acme Client', phone: '9999999999' });
      expect(created.status).toBe(201);
      const v = created.json as Record<string, unknown>;
      expect(v.id).toBeTruthy();
      expect(v.name).toBe('Acme Client');
      expect(v.email == null || v.email === '').toBe(true);

      const listed = await api('GET', '/vendors');
      expect((listed.json as unknown[]).length).toBe(1);
    });
  });

  describe('Price lists', () => {
    it('GET returns array; POST creates rule + silent product; resolve + bulk + delete', async () => {
      const empty = await api('GET', '/price-lists');
      expect(empty.status).toBe(200);
      expect(Array.isArray(empty.json)).toBe(true);

      // productName path (Catalog pill hidden Offline)
      const created = await api('POST', '/price-lists', {
        productName: 'Consulting Hour',
        name: 'Catalog rate',
        minQty: 1,
        price: 1500,
      });
      expect(created.status).toBe(201);
      const rule = created.json as Record<string, unknown>;
      expect(rule.id).toBeTruthy();
      expect(rule.productId).toBeTruthy();
      expect(rule.productName).toBe('Consulting Hour');
      expect(rule.price).toBe(1500);
      expect(rule.minQty).toBe(1);
      expect(rule.isActive).toBe(true);

      const products = await api('GET', '/products');
      expect(products.status).toBe(200);
      expect((products.json as unknown[]).length).toBeGreaterThanOrEqual(1);

      const resolved = await api(
        'GET',
        `/price-lists/resolve?productId=${encodeURIComponent(String(rule.productId))}&quantity=1`,
      );
      expect(resolved.status).toBe(200);
      expect(typeof (resolved.json as { price: number }).price).toBe('number');
      expect((resolved.json as { price: number }).price).toBe(1500);

      const bulk = await api('POST', '/price-lists/bulk', {
        rules: [{ productName: 'New Service From CSV', price: 900, minQty: 1, name: 'Imported' }],
      });
      expect(bulk.status).toBe(200);
      const bulkBody = bulk.json as { success: number; errors: string[] };
      expect(bulkBody.success).toBe(1);
      expect(bulkBody.errors).toEqual([]);

      const listed = await api('GET', '/price-lists');
      expect((listed.json as unknown[]).length).toBe(2);
      for (const r of listed.json as Record<string, unknown>[]) {
        expect(r.productId).toBeTruthy();
        expect(typeof r.productName).toBe('string');
        expect(typeof r.price).toBe('number');
      }

      const del = await api('DELETE', `/price-lists/${rule.id}`);
      expect(del.status).toBe(200);
      expect((await api('GET', '/price-lists')).json as unknown[]).toHaveLength(1);
    });

    it('POST with productId (UI Add Rule after products.create) works', async () => {
      const prod = await api('POST', '/products', { name: 'Widget', price: 100, gstRate: 18 });
      expect(prod.status).toBe(201);
      const productId = (prod.json as { id: string }).id;

      const rule = await api('POST', '/price-lists', {
        productId,
        name: 'Catalog rate',
        minQty: 1,
        price: 120,
      });
      expect(rule.status).toBe(201);
      expect((rule.json as Record<string, unknown>).productId).toBe(productId);
      expect((rule.json as Record<string, unknown>).productName).toBe('Widget');
    });
  });

  it('critical Masters GETs never 404 as not-implemented', async () => {
    for (const path of ['/banks', '/staff', '/vendors', '/price-lists', '/products']) {
      const res = await api('GET', path);
      expect(res.status, path).toBe(200);
      expect(Array.isArray(res.json), path).toBe(true);
      expect(JSON.stringify(res.json)).not.toMatch(/not implemented/i);
    }
  });
});
