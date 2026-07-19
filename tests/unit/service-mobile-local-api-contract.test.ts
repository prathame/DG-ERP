/**
 * Local API contract for Offline Mobile Masters screens.
 * Treats `handleLocalApiRequest` as the real API — catches 404 / wrong shape regressions.
 *
 * Masters tab → endpoints (keep in sync with UI):
 * - Clients  → GET/POST /vendors, POST /vendors/bulk, PUT/DELETE /vendors/:id
 * - Prices   → GET/POST /price-lists, POST /price-lists/bulk, DELETE /price-lists/:id, GET /price-lists/resolve
 * - Banks    → GET/POST /banks, POST /banks/batch, PUT/DELETE /banks/:id
 * - Staff    → GET/POST /staff, POST /staff/batch, PUT/DELETE /staff/:id
 * - Search   → GET /search?q= (header ⌘K global search; same shape as cloud)
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

describe('service-mobile local API — Mark Paid + Client payment does not double-count', () => {
  beforeEach(async () => {
    await setupDb();
  });

  afterEach(async () => {
    await db?.close();
  });

  it('invoice Mark Paid then Client Record Payment same amount → analytics collections once', async () => {
    const client = await api('POST', '/vendors', { name: 'Cash Client', phone: '9000000023' });
    expect(client.status).toBe(201);
    const vendorId = (client.json as { id: string }).id;

    const inv = await api('POST', '/invoices', {
      customerName: 'Cash Client',
      partyType: 'vendor',
      partyId: vendorId,
      status: 'sent',
      invoiceDate: '2026-07-19',
      items: [{ description: 'Service', qty: 1, rate: 23, gstPercent: 0 }],
    });
    expect(inv.status).toBe(201);
    const invoice = inv.json as { id: string; grandTotal: number };
    expect(invoice.grandTotal).toBe(23);

    const marked = await api('PUT', `/invoices/${invoice.id}/status`, { status: 'paid' });
    expect(marked.status).toBe(200);

    // Client hub "Record Payment" after Mark Paid used to insert Extra Pay → double collections
    const duplicate = await api('POST', '/invoice-finance/payments', {
      invoiceId: invoice.id,
      amount: 23,
      paymentDate: '2026-07-19',
      paymentMethod: 'Cash',
    });
    expect(duplicate.status).toBe(400);

    const overview = await api('GET', '/analytics/overview?from=2026-07-01&to=2026-07-31');
    expect(overview.status).toBe(200);
    const money = (overview.json as { money: { collections: number; invoiceOutstanding: number } }).money;
    expect(money.collections).toBe(23);
    expect(money.invoiceOutstanding).toBe(0);

    const hub = await api('GET', `/invoice-finance/client/${encodeURIComponent(`vendor:${vendorId}`)}`);
    expect(hub.status).toBe(200);
    const detail = hub.json as { totalPaid: number; balance: number; payments: unknown[] };
    expect(detail.totalPaid).toBe(23);
    expect(detail.balance).toBe(0);
    expect(detail.payments).toHaveLength(1);
  });

  it('advance with no invoice → create invoice → outstanding reduced / advance shown', async () => {
    const client = await api('POST', '/vendors', { name: 'Advance Client', phone: '9000000099' });
    expect(client.status).toBe(201);
    const vendorId = (client.json as { id: string }).id;
    const partyKey = `vendor:${vendorId}`;

    const advance = await api('POST', '/invoice-finance/payments', {
      partyKey,
      amount: 500,
      paymentDate: '2026-07-19',
      paymentMethod: 'UPI',
      notes: 'Advance payment',
    });
    expect(advance.status).toBe(201);
    expect((advance.json as { isAdvance?: boolean }).isAdvance).toBe(true);

    const hubBefore = await api('GET', `/invoice-finance/client/${encodeURIComponent(partyKey)}`);
    expect(hubBefore.status).toBe(200);
    const before = hubBefore.json as {
      totalInvoiced: number;
      totalPaid: number;
      advanceBalance: number;
      balance: number;
      invoices: unknown[];
    };
    expect(before.invoices).toHaveLength(0);
    expect(before.totalPaid).toBe(500);
    expect(before.advanceBalance).toBe(500);
    expect(before.balance).toBe(-500);

    const overviewAdv = await api('GET', '/analytics/overview?from=2026-07-01&to=2026-07-31');
    expect(overviewAdv.status).toBe(200);
    expect((overviewAdv.json as { money: { collections: number } }).money.collections).toBe(500);

    const inv = await api('POST', '/invoices', {
      customerName: 'Advance Client',
      partyType: 'vendor',
      partyId: vendorId,
      status: 'sent',
      invoiceDate: '2026-07-19',
      items: [{ description: 'Service', qty: 1, rate: 800, gstPercent: 0 }],
    });
    expect(inv.status).toBe(201);
    const created = inv.json as {
      id: string;
      grandTotal: number;
      paidAmount?: number;
      advanceApplied?: number;
      outstanding?: number;
      status: string;
    };
    expect(created.grandTotal).toBe(800);
    expect(created.advanceApplied).toBe(500);
    expect(created.paidAmount).toBe(500);
    expect(created.outstanding).toBe(300);

    const hubAfter = await api('GET', `/invoice-finance/client/${encodeURIComponent(partyKey)}`);
    expect(hubAfter.status).toBe(200);
    const after = hubAfter.json as {
      totalPaid: number;
      advanceBalance: number;
      balance: number;
      invoices: { paid: number; advanceApplied: number; balance: number }[];
      payments: { isAdvance?: boolean; invoiceId: string | null; amount: number }[];
    };
    expect(after.advanceBalance).toBe(0);
    expect(after.balance).toBe(300);
    expect(after.invoices[0]!.advanceApplied).toBe(500);
    expect(after.invoices[0]!.balance).toBe(300);
    expect(after.payments.some(p => p.isAdvance && p.invoiceId && p.amount === 500)).toBe(true);

    // Collections still counted once (cash received), not again when applied
    const overviewAfter = await api('GET', '/analytics/overview?from=2026-07-01&to=2026-07-31');
    expect(
      (overviewAfter.json as { money: { collections: number; invoiceOutstanding: number } }).money.collections,
    ).toBe(500);
    expect((overviewAfter.json as { money: { invoiceOutstanding: number } }).money.invoiceOutstanding).toBe(300);
  });

  it('partial Client payment then Mark Paid records only the remaining once', async () => {
    const client = await api('POST', '/vendors', { name: 'Partial Client' });
    expect(client.status).toBe(201);
    const vendorId = (client.json as { id: string }).id;

    const inv = await api('POST', '/invoices', {
      customerName: 'Partial Client',
      partyType: 'vendor',
      partyId: vendorId,
      status: 'sent',
      invoiceDate: '2026-07-19',
      items: [{ description: 'Job', qty: 1, rate: 100, gstPercent: 0 }],
    });
    expect(inv.status).toBe(201);
    const invoiceId = (inv.json as { id: string }).id;

    const partial = await api('POST', '/invoice-finance/payments', {
      invoiceId,
      amount: 40,
      paymentDate: '2026-07-19',
      paymentMethod: 'UPI',
    });
    expect(partial.status).toBe(201);

    const marked = await api('PUT', `/invoices/${invoiceId}/status`, { status: 'paid' });
    expect(marked.status).toBe(200);

    const overview = await api('GET', '/analytics/overview');
    expect(overview.status).toBe(200);
    expect((overview.json as { money: { collections: number } }).money.collections).toBe(100);

    const pays = await api('GET', '/invoice-finance/payments');
    expect(pays.status).toBe(200);
    const rows = pays.json as { amount: number }[];
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(100);
  });
});

describe('service-mobile local API contract — Global search', () => {
  beforeEach(async () => {
    await setupDb();
  });

  afterEach(async () => {
    await db?.close();
  });

  it('GET /search returns cloud-shaped buckets; empty q → empty arrays', async () => {
    const empty = await api('GET', '/search?q=');
    expect(empty.status).toBe(200);
    const e = empty.json as Record<string, unknown[]>;
    expect(e.products).toEqual([]);
    expect(e.customers).toEqual([]);
    expect(e.vendors).toEqual([]);
    expect(e.barcodes).toEqual([]);
    expect(e.challans).toEqual([]);
    expect(e.staff).toEqual([]);

    await api('POST', '/vendors', { name: 'Acme Clients', phone: '9991112222' });
    await api('POST', '/products', { name: 'Service Kit A', price: 500, stock: 3, barcode: 'SM-BC-99' });
    await api('POST', '/staff', { name: 'Ravi Kumar', phone: '888' });

    const hit = await api('GET', '/search?q=acme');
    expect(hit.status).toBe(200);
    const body = hit.json as {
      vendors: { name: string; type: string }[];
      products: { name: string }[];
      barcodes: { barcode: string }[];
      staff: { name: string }[];
      challans: unknown[];
    };
    expect(body.vendors.some(v => v.name === 'Acme Clients')).toBe(true);
    expect(body.vendors[0]!.type).toBe('vendor');

    const prod = await api('GET', '/search?q=Service%20Kit');
    const pb = prod.json as { products: { name: string; stock: number }[] };
    expect(pb.products.some(p => p.name === 'Service Kit A')).toBe(true);

    const bc = await api('GET', '/search?q=SM-BC');
    const bb = bc.json as { barcodes: { barcode: string; productName: string }[] };
    expect(bb.barcodes.some(b => b.barcode === 'SM-BC-99')).toBe(true);

    const st = await api('GET', '/search?q=Ravi');
    const sb = st.json as { staff: { name: string }[]; challans: unknown[] };
    expect(sb.staff.some(s => s.name === 'Ravi Kumar')).toBe(true);
    expect(sb.challans).toEqual([]);
  });
});
