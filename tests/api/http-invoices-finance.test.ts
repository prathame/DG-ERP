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

  it('invoice-finance breakdown separates party sales from cash income', async () => {
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total, grand_total, status, invoice_date, invoice_kind, notes)
       VALUES ('INV-CASH-1', $1, 'CASH-test1', 'Rent Income', '[]', 500, 0, 500, 'paid', CURRENT_DATE, 'cash_income', 'Cash income: rent')
       ON CONFLICT DO NOTHING`,
      [TENANT],
    );
    const res = await api().get('/api/invoice-finance/breakdown').set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    expect(Number(res.body.cashIncome)).toBeGreaterThanOrEqual(500);
    expect(Number(res.body.cashIncomeCount)).toBeGreaterThanOrEqual(1);
    expect(Number(res.body.partyInvoiced)).toBeGreaterThan(0);

    const cash = await api().get('/api/invoice-finance/cash-income').set(authHeaders(token, TENANT));
    expect(cash.status).toBe(200);
    expect((cash.body as { invoiceNumber: string }[]).some(r => r.invoiceNumber === 'CASH-test1')).toBe(true);

    const summary = await api().get('/api/invoice-finance/summary').set(authHeaders(token, TENANT));
    expect(summary.status).toBe(200);
    expect(
      (summary.body as { clientName: string }[]).some(r => (r.clientName || '').toLowerCase() === 'rent income'),
    ).toBe(false);
  });

  it('POST /api/invoice-finance/cash-income records paid cash income (not party outstanding)', async () => {
    const res = await api().post('/api/invoice-finance/cash-income').set(authHeaders(token, TENANT)).send({
      incomeHead: 'Scrap Sale',
      amount: 250.5,
      incomeDate: '2026-08-10',
      paymentMethod: 'Cash',
      notes: 'Yard scrap',
    });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('paid');
    expect(res.body.incomeHead).toBe('Scrap Sale');
    expect(Number(res.body.grandTotal)).toBeCloseTo(250.5, 2);
    expect(Number(res.body.paid)).toBeCloseTo(250.5, 2);
    expect(String(res.body.invoiceNumber)).toMatch(/^CASH\//);

    const cash = await api().get('/api/invoice-finance/cash-income').set(authHeaders(token, TENANT));
    expect(cash.status).toBe(200);
    expect(
      (cash.body as { invoiceNumber: string; incomeHead: string }[]).some(
        r => r.invoiceNumber === res.body.invoiceNumber && r.incomeHead === 'Scrap Sale',
      ),
    ).toBe(true);

    const open = await api().get('/api/invoice-finance/open-bills').set(authHeaders(token, TENANT));
    expect(open.status).toBe(200);
    expect((open.body as { invoiceId: string }[]).some(r => r.invoiceId === res.body.id)).toBe(false);

    const summary = await api().get('/api/invoice-finance/summary').set(authHeaders(token, TENANT));
    expect(summary.status).toBe(200);
    expect(
      (summary.body as { clientName: string }[]).some(r => (r.clientName || '').toLowerCase() === 'scrap sale'),
    ).toBe(false);

    const bad = await api()
      .post('/api/invoice-finance/cash-income')
      .set(authHeaders(token, TENANT))
      .send({ incomeHead: '', amount: 10 });
    expect(bad.status).toBe(400);
  });

  it('Accounts Ledger cash book does not double-count invoice + payment', async () => {
    const cash = await api().post('/api/invoice-finance/cash-income').set(authHeaders(token, TENANT)).send({
      incomeHead: 'Ledger Dup Check',
      amount: 125,
      incomeDate: '2026-08-09',
      paymentMethod: 'Cash',
    });
    expect(cash.status).toBe(201);

    const partyInv = await api()
      .post('/api/invoices')
      .set(authHeaders(token, TENANT))
      .send({
        customerName: 'Ledger Party',
        invoiceDate: '2026-08-09',
        items: [{ description: 'Job', qty: 1, rate: 200, gstPercent: 0 }],
        status: 'sent',
        partyType: 'vendor',
        partyId: VENDOR,
      });
    expect(partyInv.status).toBe(201);
    await api()
      .post('/api/invoice-finance/payments')
      .set(authHeaders(token, TENANT))
      .set('Idempotency-Key', `ledger-dup-${Date.now()}`)
      .send({
        invoiceId: partyInv.body.id,
        amount: 200,
        paymentDate: '2026-08-09',
        paymentMethod: 'Cash',
      });

    const ledger = await api()
      .get('/api/accounts/ledger?from=2020-01-01&to=2099-12-31&type=all')
      .set(authHeaders(token, TENANT));
    expect(ledger.status).toBe(200);
    const entries = ledger.body.entries as {
      type: string;
      particulars: string;
      debit: number;
      credit: number;
      balance: number;
    }[];
    expect(Array.isArray(entries)).toBe(true);
    // Cash book only — no billed sales rows mixed into the running balance
    expect(entries.some(e => e.type === 'Invoice')).toBe(false);
    // Cash income once; its auto payment must not appear again
    expect(entries.filter(e => e.type === 'Cash Income' && /ledger dup check/i.test(e.particulars))).toHaveLength(1);
    expect(entries.some(e => e.type === 'Invoice Payment' && /ledger dup check/i.test(e.particulars))).toBe(false);
    // Party invoice payment still shows as money in
    expect(entries.some(e => e.type === 'Invoice Payment' && /ledger party/i.test(e.particulars))).toBe(true);
  });

  it('Accounts P&L + Outstanding use party invoices for service (not cash income / distribution)', async () => {
    await pool.query(`UPDATE tenants SET business_type = 'service' WHERE id = $1`, [TENANT]);
    try {
      const pnl = await api()
        .get('/api/accounts/profit-loss?from=2020-01-01&to=2099-12-31')
        .set(authHeaders(token, TENANT));
      expect(pnl.status).toBe(200);
      expect(Number(pnl.body.revenue?.cashIncomeRevenue || 0)).toBeGreaterThanOrEqual(500);
      expect(Number(pnl.body.revenue?.partyInvoiceRevenue || 0)).toBeGreaterThan(0);

      const due = await api().get('/api/reports/outstanding').set(authHeaders(token, TENANT));
      expect(due.status).toBe(200);
      expect(due.body.source).toBe('invoice_finance');
      expect(Array.isArray(due.body.rows)).toBe(true);
      expect(Array.isArray(due.body.bills)).toBe(true);
      expect(due.body.bills.length).toBeGreaterThanOrEqual(1);
      expect(due.body.bills[0]).toMatchObject({
        billId: expect.any(String),
        billNumber: expect.any(String),
        balance: expect.any(Number),
        days: expect.any(Number),
        ageBucket: expect.stringMatching(/^(0-30|31-60|61-90|90\+)$/),
      });
      // Cash-income heads must not appear as outstanding parties
      expect(
        (due.body.rows as { vendorName: string }[]).some(r => (r.vendorName || '').toLowerCase() === 'rent income'),
      ).toBe(false);
    } finally {
      await pool.query(`UPDATE tenants SET business_type = 'manufacturer' WHERE id = $1`, [TENANT]);
    }
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

  it('invoice-finance summary separates bill due from net when vendor has unallocated advance', async () => {
    const advVendor = 'V-HTTP-INV-ADV';
    await pool.query(`UPDATE tenants SET business_type = 'service' WHERE id = $1`, [TENANT]);
    try {
      await pool.query(
        `INSERT INTO vendors (id, tenant_id, name, phone, address)
         VALUES ($1, $2, 'Advance Client', '9000000001', 'Pune')
         ON CONFLICT DO NOTHING`,
        [advVendor, TENANT],
      );
      await pool.query(
        `INSERT INTO standalone_invoices
           (id, tenant_id, invoice_number, customer_name, party_type, party_id, items, subtotal, tax_total, grand_total, status, invoice_date, invoice_kind)
         VALUES ('INV-ADV-1', $1, 'INV/ADV/1', 'Advance Client', 'vendor', $2, '[]', 1000, 0, 1000, 'sent', CURRENT_DATE, 'sale')
         ON CONFLICT DO NOTHING`,
        [TENANT, advVendor],
      );
      await pool.query(
        `INSERT INTO vendor_payments (id, tenant_id, vendor_id, amount, payment_date, payment_method, notes)
         VALUES ('VP-ADV-1', $1, $2, 100, CURRENT_DATE, 'Cash', 'Unallocated advance')
         ON CONFLICT DO NOTHING`,
        [TENANT, advVendor],
      );

      const summary = await api().get('/api/invoice-finance/summary').set(authHeaders(token, TENANT));
      expect(summary.status).toBe(200);
      const row = (
        summary.body as { partyKey: string; billDue: number; advanceBalance: number; balance: number }[]
      ).find(r => r.partyKey === `vendor:${advVendor}`);
      expect(row).toBeTruthy();
      expect(row!.billDue).toBeCloseTo(1000, 2);
      expect(row!.advanceBalance).toBeCloseTo(100, 2);
      expect(row!.balance).toBeCloseTo(900, 2);

      const open = await api().get('/api/invoice-finance/open-bills').set(authHeaders(token, TENANT));
      const openDue = (open.body as { partyKey: string; balance: number }[])
        .filter(r => r.partyKey === `vendor:${advVendor}`)
        .reduce((s, r) => s + r.balance, 0);
      expect(openDue).toBeCloseTo(1000, 2);

      const breakdown = await api().get('/api/invoice-finance/breakdown').set(authHeaders(token, TENANT));
      expect(breakdown.status).toBe(200);
      expect(Number(breakdown.body.partyBillDue)).toBeGreaterThanOrEqual(1000);
      expect(Number(breakdown.body.partyOutstanding)).toBeCloseTo(
        Number(breakdown.body.partyBillDue) - Number(breakdown.body.partyAdvances),
        1,
      );

      const report = await api().get('/api/reports/outstanding').set(authHeaders(token, TENANT));
      expect(report.status).toBe(200);
      const reportRow = (
        report.body.rows as { vendorId: string; billDue: number; advanceBalance: number; balance: number }[]
      ).find(r => r.vendorId === `vendor:${advVendor}`);
      expect(reportRow).toBeTruthy();
      expect(reportRow!.billDue).toBeCloseTo(1000, 2);
      expect(reportRow!.advanceBalance).toBeCloseTo(100, 2);
      expect(reportRow!.balance).toBeCloseTo(900, 2);
    } finally {
      await pool.query(`DELETE FROM vendor_payments WHERE id = 'VP-ADV-1' AND tenant_id = $1`, [TENANT]);
      await pool.query(`DELETE FROM standalone_invoices WHERE id = 'INV-ADV-1' AND tenant_id = $1`, [TENANT]);
      await pool.query(`DELETE FROM vendors WHERE id = $1 AND tenant_id = $2`, [advVendor, TENANT]);
      await pool.query(`UPDATE tenants SET business_type = 'manufacturer' WHERE id = $1`, [TENANT]);
    }
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
