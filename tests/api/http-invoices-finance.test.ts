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

  it('invoice-finance client detail loads legacy name: keys', async () => {
    const res = await api()
      .get(`/api/invoice-finance/client/${encodeURIComponent('name:Walk-in')}`)
      .set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    expect(res.body.clientName).toBe('Walk-in');
    expect(res.body.invoices.length).toBe(1);
    expect(res.body.partyType).toBeNull();
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
});
