/**
 * HTTP coverage for party-linked standalone invoices, invoice-finance grouping,
 * and price-list bulk import.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT = 'T-TEST-HTTP-INV';
const USER = 'U-HTTP-INV';
const VENDOR = 'V-HTTP-INV-1';
const CUSTOMER = 'C-HTTP-INV-1';
const PRODUCT = 'P-HTTP-INV-1';
let token = '';

describe('HTTP: invoices party link + invoice-finance + price-list bulk', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'HTTP Inv Co', 'http-inv-co', 'http-inv@test.com', 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-inv@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash],
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name, phone, address, gst_number)
       VALUES ($1, $2, 'Acme Vendor', '9999999999', 'Pune', '27AAAAA0000A1Z5')
       ON CONFLICT DO NOTHING`,
      [VENDOR, TENANT],
    );
    await pool.query(
      `INSERT INTO customers (id, tenant_id, name, phone, address)
       VALUES ($1, $2, 'Beta Client', '8888888888', 'Mumbai')
       ON CONFLICT DO NOTHING`,
      [CUSTOMER, TENANT],
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, warranty_months, stock)
       VALUES ($1, $2, 'Consulting Hour', 1000, 0, 0)
       ON CONFLICT DO NOTHING`,
      [PRODUCT, TENANT],
    );
    token = createTestToken({
      userId: USER,
      tenantId: TENANT,
      email: 'http-inv@test.com',
      role: 'Admin',
      name: 'Admin',
    });
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('POST /api/invoices stores party_type and party_id', async () => {
    const res = await api()
      .post('/api/invoices')
      .set(authHeaders(token, TENANT))
      .send({
        invoiceNumber: 'INV/TEST/0001',
        customerName: 'Acme Vendor',
        customerPhone: '9999999999',
        partyType: 'vendor',
        partyId: VENDOR,
        status: 'sent',
        items: [{ description: 'Setup', qty: 1, rate: 5000, gstPercent: 18 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeTruthy();

    const { rows } = await pool.query(
      'SELECT party_type, party_id, customer_name FROM standalone_invoices WHERE id = $1 AND tenant_id = $2',
      [res.body.id, TENANT],
    );
    expect(rows[0].party_type).toBe('vendor');
    expect(rows[0].party_id).toBe(VENDOR);
    expect(rows[0].customer_name).toBe('Acme Vendor');
  });

  it('POST /api/invoices rejects unknown party', async () => {
    const res = await api()
      .post('/api/invoices')
      .set(authHeaders(token, TENANT))
      .send({
        customerName: 'Ghost',
        partyType: 'vendor',
        partyId: 'V-DOES-NOT-EXIST',
        items: [{ description: 'X', qty: 1, rate: 100, gstPercent: 18 }],
      });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/Vendor not found/i);
  });

  it('invoice-finance summary groups by party key and keeps renamed display name together', async () => {
    // Second invoice same vendor, different display name — must still group
    await api()
      .post('/api/invoices')
      .set(authHeaders(token, TENANT))
      .send({
        invoiceNumber: 'INV/TEST/0002',
        customerName: 'Acme Vendor Renamed',
        partyType: 'vendor',
        partyId: VENDOR,
        status: 'sent',
        items: [{ description: 'Retainer', qty: 1, rate: 2000, gstPercent: 18 }],
      });

    // Legacy name-only invoice (no party)
    await pool.query(
      `INSERT INTO standalone_invoices
        (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total, grand_total, status, invoice_date)
       VALUES ('INV-LEGACY-1', $1, 'INV/TEST/LEGACY', 'Walk-in', '[]', 100, 18, 118, 'sent', CURRENT_DATE)`,
      [TENANT],
    );

    const res = await api().get('/api/invoice-finance/summary').set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    const rows = res.body as {
      partyKey: string;
      invoiceCount: number;
      totalInvoiced: number;
      clientName: string;
    }[];
    const vendorGroup = rows.find(r => r.partyKey === `vendor:${VENDOR}`);
    expect(vendorGroup).toBeTruthy();
    expect(vendorGroup!.invoiceCount).toBe(2);
    // 5000*1.18 + 2000*1.18
    expect(vendorGroup!.totalInvoiced).toBeCloseTo(5000 * 1.18 + 2000 * 1.18, 1);

    const legacy = rows.find(r => r.partyKey === 'name:Walk-in');
    expect(legacy).toBeTruthy();
    expect(legacy!.invoiceCount).toBe(1);
  });

  it('invoice-finance client detail loads by vendor:ID party key', async () => {
    const res = await api()
      .get(`/api/invoice-finance/client/${encodeURIComponent(`vendor:${VENDOR}`)}`)
      .set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    expect(res.body.partyKey).toBe(`vendor:${VENDOR}`);
    expect(res.body.partyType).toBe('vendor');
    expect(res.body.partyId).toBe(VENDOR);
    expect(res.body.invoices.length).toBe(2);
    expect(res.body.totalInvoiced).toBeGreaterThan(0);
  });

  it('invoice-finance client detail returns Masters name when vendor has no invoices', async () => {
    const emptyVendor = 'V-HTTP-INV-EMPTY';
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name, phone, address, gst_number)
       VALUES ($1, $2, 'Neha Kapoor Client', '9988776655', 'Pune', null)
       ON CONFLICT DO NOTHING`,
      [emptyVendor, TENANT],
    );
    const res = await api()
      .get(`/api/invoice-finance/client/${encodeURIComponent(`vendor:${emptyVendor}`)}`)
      .set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    expect(res.body.invoices).toEqual([]);
    expect(res.body.clientName).toBe('Neha Kapoor Client');
    expect(res.body.clientName).not.toBe(emptyVendor);
    expect(res.body.clientPhone).toBe('9988776655');
  });

  it('invoice-finance client detail loads legacy name: keys', async () => {
    const res = await api()
      .get(`/api/invoice-finance/client/${encodeURIComponent('name:Walk-in')}`)
      .set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    expect(res.body.clientName).toBe('Walk-in');
    expect(res.body.invoices.length).toBe(1);
    expect(res.body.partyType).toBeNull();
  });

  it('invoice-finance open-bills lists unpaid invoices flat', async () => {
    const res = await api().get('/api/invoice-finance/open-bills').set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    const rows = res.body as {
      partyKey: string;
      invoiceId: string;
      invoiceNumber: string;
      balance: number;
    }[];
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(rows.every(r => r.balance > 0)).toBe(true);
    expect(rows.some(r => r.partyKey === `vendor:${VENDOR}`)).toBe(true);
    expect(rows.some(r => r.partyKey === 'name:Walk-in')).toBe(true);
  });

  it('invoice-finance payments accept bill-wise allocations', async () => {
    const open = await api().get('/api/invoice-finance/open-bills').set(authHeaders(token, TENANT));
    const vendorBills = (open.body as { partyKey: string; invoiceId: string; balance: number }[]).filter(
      r => r.partyKey === `vendor:${VENDOR}`,
    );
    expect(vendorBills.length).toBeGreaterThanOrEqual(2);
    const a = vendorBills[0]!;
    const b = vendorBills[1]!;
    const payA = Math.min(100, a.balance);
    const payB = Math.min(50, b.balance);

    const res = await api()
      .post('/api/invoice-finance/payments')
      .set(authHeaders(token, TENANT))
      .set('Idempotency-Key', `billwise-${Date.now()}`)
      .send({
        allocations: [
          { invoiceId: a.invoiceId, amount: payA },
          { invoiceId: b.invoiceId, amount: payB },
        ],
        paymentDate: '2026-08-01',
        paymentMethod: 'UPI',
        notes: 'Bill-wise test',
      });
    expect(res.status).toBe(201);
    expect(res.body.billWise).toBe(true);
    expect(res.body.appliedInvoices).toBe(2);
    expect(Number(res.body.amount)).toBeCloseTo(payA + payB, 2);
  });

  it('POST /api/price-lists/bulk imports by product/vendor name', async () => {
    const res = await api()
      .post('/api/price-lists/bulk')
      .set(authHeaders(token, TENANT))
      .send({
        rules: [
          {
            productName: 'Consulting Hour',
            vendorName: 'Acme Vendor',
            minQty: 1,
            maxQty: 10,
            price: 900,
            name: 'Dealer rate',
          },
          {
            productName: 'Consulting Hour',
            minQty: 11,
            price: 800,
            name: 'Bulk',
          },
          {
            productName: 'Missing Product',
            price: 50,
          },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(2);
    expect(res.body.errors.length).toBe(1);
    expect(String(res.body.errors[0])).toMatch(/Missing Product/);

    const { rows } = await pool.query(
      'SELECT price, vendor_id, min_qty FROM price_lists WHERE tenant_id = $1 ORDER BY min_qty',
      [TENANT],
    );
    expect(rows.length).toBe(2);
    expect(Number(rows[0].price)).toBe(900);
    expect(rows[0].vendor_id).toBe(VENDOR);
    expect(Number(rows[1].price)).toBe(800);
    expect(rows[1].vendor_id).toBeNull();
  });

  it('POST /api/price-lists/bulk validates empty payload', async () => {
    const res = await api().post('/api/price-lists/bulk').set(authHeaders(token, TENANT)).send({ rules: [] });
    expect(res.status).toBe(400);
  });

  it('POST /api/price-lists/bulk auto-creates fee items for service tenants', async () => {
    const serviceTenant = 'T-TEST-HTTP-PL-SVC';
    const serviceUser = 'U-HTTP-PL-SVC';
    await cleanupTestData(serviceTenant);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'HTTP Price Service', 'http-pl-svc', 'http-pl-svc@test.com', 'Admin', 'active', 'service')
       ON CONFLICT (id) DO UPDATE SET business_type = 'service'`,
      [serviceTenant],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-pl-svc@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [serviceUser, serviceTenant, hash],
    );
    const svcToken = createTestToken({
      userId: serviceUser,
      tenantId: serviceTenant,
      email: 'http-pl-svc@test.com',
      role: 'Admin',
      name: 'Admin',
    });

    try {
      const res = await api()
        .post('/api/price-lists/bulk')
        .set(authHeaders(svcToken, serviceTenant))
        .send({
          rules: [
            {
              productName: 'Legal consultation (per hour)',
              minQty: 1,
              price: 2500,
              name: 'Catalog rate',
            },
          ],
        });
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(1);
      expect(res.body.errors).toEqual([]);

      const products = await pool.query(
        `SELECT id, name, price FROM products WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)`,
        [serviceTenant, 'Legal consultation (per hour)'],
      );
      expect(products.rows.length).toBe(1);
      expect(Number(products.rows[0].price)).toBe(2500);

      const rules = await pool.query(
        `SELECT price, product_id FROM price_lists WHERE tenant_id = $1 AND product_id = $2`,
        [serviceTenant, products.rows[0].id],
      );
      expect(rules.rows.length).toBe(1);
      expect(Number(rules.rows[0].price)).toBe(2500);
    } finally {
      await cleanupTestData(serviceTenant);
    }
  });
});
