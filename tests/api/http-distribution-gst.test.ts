/**
 * Distribution GST dual-doc foundation (non-service / goods).
 * Covers apply-billing ↔ getBill order, per-line gstApplied, IRN guard, report exclusion.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT = 'T-TEST-HTTP-DIST-GST';
const USER = 'U-HTTP-DIST-GST';
const VENDOR = 'V-HTTP-DIST-GST';
const PRODUCT = 'P-HTTP-DIST-GST';
const BATCH = 'D-HTTP-DIST-GST';

let token = '';

describe('HTTP: distribution GST dual-doc foundation', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'Dist GST Co', 'test-http-dist-gst', 'dist-gst@test.com', 'Admin', 'active', 'manufacturer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, default_gst_rate)
       VALUES ($1, $2, 'dist-gst@test.com', $3, 'Admin', 'Admin', 18)
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash],
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name, gst_number)
       VALUES ($1, $2, 'GST Vendor', '24AAAAA0000A1Z5') ON CONFLICT DO NOTHING`,
      [VENDOR, TENANT],
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, gst_rate, price_includes_gst, hsn_code)
       VALUES ($1, $2, 'GST Widget', 1000, 12, false, '8517') ON CONFLICT DO NOTHING`,
      [PRODUCT, TENANT],
    );
    for (let i = 1; i <= 4; i++) {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ($1, $2, $3, $4, 'Distributed') ON CONFLICT DO NOTHING`,
        [`I-DIST-GST-${i}`, TENANT, PRODUCT, `DISTGST000${i}`],
      );
      await pool.query(
        `INSERT INTO product_distribution
           (id, batch_id, tenant_id, product_id, barcode, vendor_id, distribution_date, status,
            discount_percent, net_price, gst_applied, billed_price)
         VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE, 'Distributed', 0, 1000, false, 1000)
         ON CONFLICT DO NOTHING`,
        [`${BATCH}-${i}`, BATCH, TENANT, PRODUCT, `DISTGST000${i}`, VENDOR],
      );
    }
    token = createTestToken({
      userId: USER,
      tenantId: TENANT,
      email: 'dist-gst@test.com',
      role: 'Admin',
      name: 'Admin',
    });
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('getBill returns per-line gstApplied and stable ORDER BY id', async () => {
    const res = await api()
      .get(`/api/distribution/bill?batchId=${BATCH}&vendorId=${VENDOR}`)
      .set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(4);
    expect(res.body.items.every((i: { gstApplied?: boolean }) => typeof i.gstApplied === 'boolean')).toBe(true);
    const ids = (
      await pool.query('SELECT id FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2 ORDER BY id', [
        BATCH,
        TENANT,
      ])
    ).rows.map((r: { id: string }) => r.id);
    // Bill items follow same order as apply-billing (pd.id ASC)
    expect(res.body.items.map((i: { barcode: string }) => i.barcode)).toEqual(
      (
        await pool.query(
          'SELECT barcode FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2 ORDER BY id',
          [BATCH, TENANT],
        )
      ).rows.map((r: { barcode: string }) => r.barcode),
    );
    expect(ids[0]).toBeTruthy();
    expect(res.body.deliverySet).toBeTruthy();
    expect(res.body.deliverySet.outstandingScope).toBe('batch');
  });

  it('apply-billing sets first N units GST using product rate + exclusive markup', async () => {
    const res = await api()
      .put('/api/distribution/apply-billing')
      .set(authHeaders(token, TENANT))
      .send({ batchId: BATCH, gstUnits: 2, nonGstUnits: 2, gstRate: 18 });
    expect(res.status).toBe(200);
    expect(res.body.gstUnits).toBe(2);
    expect(res.body.nonGstUnits).toBe(2);

    const { rows } = await pool.query(
      `SELECT id, gst_applied, net_price, billed_price FROM product_distribution
       WHERE batch_id = $1 AND tenant_id = $2 ORDER BY id`,
      [BATCH, TENANT],
    );
    expect(rows[0].gst_applied).toBe(true);
    expect(rows[1].gst_applied).toBe(true);
    expect(rows[2].gst_applied).toBe(false);
    expect(rows[3].gst_applied).toBe(false);
    // Product gst_rate 12 overrides company/request fallback for markup
    expect(Number(rows[0].billed_price)).toBe(1120);
    expect(Number(rows[2].billed_price)).toBe(1000);

    const bill = await api()
      .get(`/api/distribution/bill?batchId=${BATCH}&vendorId=${VENDOR}`)
      .set(authHeaders(token, TENANT));
    expect(bill.body.savedGstUnits).toBe(2);
    expect(bill.body.deliverySet.isDualDocs).toBe(true);
    expect(bill.body.items.filter((i: { gstApplied: boolean }) => i.gstApplied)).toHaveLength(2);
  });

  it('apply-billing blocked when IRN exists on batch', async () => {
    await pool.query(
      `UPDATE product_distribution SET irn = 'TEST-IRN-1' WHERE batch_id = $1 AND tenant_id = $2 AND gst_applied = true`,
      [BATCH, TENANT],
    );
    const res = await api()
      .put('/api/distribution/apply-billing')
      .set(authHeaders(token, TENANT))
      .send({ batchId: BATCH, gstUnits: 1, nonGstUnits: 3 });
    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/IRN/i);
    await pool.query(`UPDATE product_distribution SET irn = NULL WHERE batch_id = $1 AND tenant_id = $2`, [
      BATCH,
      TENANT,
    ]);
  });

  it('gst-summary excludes non-gst_applied distribution from taxable outward', async () => {
    const now = new Date();
    const res = await api()
      .get(`/api/reports/gst-summary?month=${now.getMonth() + 1}&year=${now.getFullYear()}`)
      .set(authHeaders(token, TENANT));
    expect(res.status).toBe(200);
    // 2 GST units @ net 1000 each
    expect(Number(res.body.totalTaxable)).toBe(2000);
    // tax at 12%: 240 total
    expect(Number(res.body.totalTax)).toBe(240);
  });
});

describe('HTTP: createBatch mixed withGst → dual docs', () => {
  const TENANT2 = 'T-TEST-HTTP-DIST-CREATE';
  const USER2 = 'U-HTTP-DIST-CREATE';
  const VENDOR2 = 'V-HTTP-DIST-CREATE';
  const PRODUCT_EX = 'P-HTTP-DIST-EX';
  const PRODUCT_IN = 'P-HTTP-DIST-IN';
  let token2 = '';

  beforeAll(async () => {
    await cleanupTestData(TENANT2);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1, 'Dist Create Co', 'test-http-dist-create', 'dist-create@test.com', 'Admin', 'active', 'manufacturer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT2],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role, default_gst_rate)
       VALUES ($1, $2, 'dist-create@test.com', $3, 'Admin', 'Admin', 18)
       ON CONFLICT DO NOTHING`,
      [USER2, TENANT2, hash],
    );
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name, gst_number)
       VALUES ($1, $2, 'Create Vendor', '24BBBBB0000B1Z5') ON CONFLICT DO NOTHING`,
      [VENDOR2, TENANT2],
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, gst_rate, price_includes_gst, hsn_code)
       VALUES ($1, $2, 'Exclusive Widget', 1000, 18, false, '8517') ON CONFLICT DO NOTHING`,
      [PRODUCT_EX, TENANT2],
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, gst_rate, price_includes_gst, hsn_code)
       VALUES ($1, $2, 'Inclusive Widget', 1180, 18, true, '8517') ON CONFLICT DO NOTHING`,
      [PRODUCT_IN, TENANT2],
    );
    for (let i = 1; i <= 2; i++) {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ($1, $2, $3, $4, 'InStock') ON CONFLICT DO NOTHING`,
        [`I-CREATE-EX-${i}`, TENANT2, PRODUCT_EX, `CREATEEX000${i}`],
      );
    }
    for (let i = 1; i <= 2; i++) {
      await pool.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
         VALUES ($1, $2, $3, $4, 'InStock') ON CONFLICT DO NOTHING`,
        [`I-CREATE-IN-${i}`, TENANT2, PRODUCT_IN, `CREATEIN000${i}`],
      );
    }
    token2 = createTestToken({
      userId: USER2,
      tenantId: TENANT2,
      email: 'dist-create@test.com',
      role: 'Admin',
      name: 'Admin',
    });
  });

  afterAll(async () => {
    await cleanupTestData(TENANT2);
  });

  it('mixed withGst lines create dual-doc deliverySet without apply-billing', async () => {
    const res = await api()
      .post('/api/distribution/batch')
      .set(authHeaders(token2, TENANT2))
      .send({
        vendorId: VENDOR2,
        gstRate: 18,
        items: [
          { productId: PRODUCT_EX, quantity: 1, withGst: true, customPrice: 1000 },
          { productId: PRODUCT_EX, quantity: 1, withGst: false, customPrice: 1000 },
        ],
      });
    expect(res.status).toBe(201);
    const batchId = res.body.batchId as string;
    expect(batchId).toBeTruthy();

    const bill = await api()
      .get(`/api/distribution/bill?batchId=${batchId}&vendorId=${VENDOR2}`)
      .set(authHeaders(token2, TENANT2));
    expect(bill.status).toBe(200);
    expect(bill.body.deliverySet.isDualDocs).toBe(true);
    expect(bill.body.savedGstUnits).toBe(1);
    expect(bill.body.items.filter((i: { gstApplied: boolean }) => i.gstApplied)).toHaveLength(1);
    expect(bill.body.items.filter((i: { gstApplied: boolean }) => !i.gstApplied)).toHaveLength(1);
  });

  it('inclusive MRP + withGst false strips to exclusive billed', async () => {
    const res = await api()
      .post('/api/distribution/batch')
      .set(authHeaders(token2, TENANT2))
      .send({
        vendorId: VENDOR2,
        gstRate: 18,
        items: [{ productId: PRODUCT_IN, quantity: 1, withGst: false, customPrice: 1180 }],
      });
    expect(res.status).toBe(201);
    const { rows } = await pool.query(
      `SELECT net_price, billed_price, gst_applied FROM product_distribution
       WHERE batch_id = $1 AND tenant_id = $2`,
      [res.body.batchId, TENANT2],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].gst_applied).toBe(false);
    expect(Number(rows[0].net_price)).toBe(1000);
    expect(Number(rows[0].billed_price)).toBe(1000);
  });
});
