import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { api, authHeaders } from '../http';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { computeFineWeight, computeMakingAmount, computeMetalSalePrice } from '../../shared/metal';

const SC_TENANT = 'T-TEST-METAL-SC';
const MFG_TENANT = 'T-TEST-METAL-MFG';
const OTHER_TENANT = 'T-TEST-METAL-OTHER';

function token(tenantId: string, userId: string, role = 'Admin') {
  return createTestToken({
    userId,
    tenantId,
    email: `${userId}@test.com`,
    role,
    name: 'Metal Tester',
  });
}

async function seedTenant(id: string, businessType: string, productId: string, userId: string) {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1, $2, $3, $4, 'Admin', 'active', $5)
     ON CONFLICT (id) DO UPDATE SET business_type = EXCLUDED.business_type`,
    [id, `${id} Co`, id.toLowerCase(), `${id}@test.com`, businessType],
  );
  const hash = await bcrypt.hash('password123', 12);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1, $2, $3, $4, 'Metal Tester', 'Admin')
     ON CONFLICT DO NOTHING`,
    [userId, id, `${userId}@test.com`, hash],
  );
  await pool.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ('OWNER', $1, 'Owner') ON CONFLICT DO NOTHING`, [
    id,
  ]);
  await pool.query(
    `INSERT INTO products (id, tenant_id, name, price, stock)
     VALUES ($1, $2, 'Silver Ring', 80, 0)
     ON CONFLICT DO NOTHING`,
    [productId, id],
  );
}

describe('HTTP Metal / Silver Casting', () => {
  beforeAll(async () => {
    await cleanupTestData(SC_TENANT);
    await cleanupTestData(MFG_TENANT);
    await cleanupTestData(OTHER_TENANT);
    await seedTenant(SC_TENANT, 'silver_casting', 'P-METAL-1', 'U-METAL-SC');
    await seedTenant(MFG_TENANT, 'manufacturer', 'P-METAL-MFG', 'U-METAL-MFG');
    await seedTenant(OTHER_TENANT, 'silver_casting', 'P-METAL-OTHER', 'U-METAL-OTHER');
    // Warehouse user on silver casting tenant (inventory view-only → POST denied)
    const whHash = await bcrypt.hash('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ('U-METAL-WH', $1, 'wh@test.com', $2, 'Warehouse', 'Warehouse')
       ON CONFLICT DO NOTHING`,
      [SC_TENANT, whHash],
    );
  });

  afterAll(async () => {
    await cleanupTestData(SC_TENANT);
    await cleanupTestData(MFG_TENANT);
    await cleanupTestData(OTHER_TENANT);
  });

  it('rejects metal intake without auth', async () => {
    const res = await api().post('/api/metal/intake').send({ productId: 'P-METAL-1', netWeight: 10, purity: 925 });
    expect(res.status).toBe(401);
  });

  it('rejects metal intake for non-silver_casting tenants', async () => {
    const res = await api()
      .post('/api/metal/intake')
      .set(authHeaders(token(MFG_TENANT, 'U-METAL-MFG'), MFG_TENANT))
      .send({ productId: 'P-METAL-MFG', netWeight: 10, purity: 925 });
    expect(res.status).toBe(403);
    expect(String(res.body.error || '')).toMatch(/Silver Casting/i);
  });

  it('creates metal intake piece with fine weight and suggested price', async () => {
    const net = 12.4;
    const purity = 925;
    const metalRate = 80;
    const makingRate = 40;
    const res = await api()
      .post('/api/metal/intake')
      .set(authHeaders(token(SC_TENANT, 'U-METAL-SC'), SC_TENANT))
      .send({
        productId: 'P-METAL-1',
        grossWeight: 12.5,
        netWeight: net,
        purity,
        metalRate,
        makingRate,
        barcodePrefix: 'AG',
        huid: 'HUIDTEST1',
      });
    expect(res.status).toBe(201);
    expect(res.body.barcode).toMatch(/^AG/);
    expect(res.body.fineWeight).toBe(computeFineWeight(net, purity));
    expect(res.body.suggestedPrice).toBe(computeMetalSalePrice(net, metalRate, computeMakingAmount(net, makingRate)));
    expect(res.body.huid).toBe('HUIDTEST1');
    expect(res.body.netWeight).toBe(net);

    const { rows } = await pool.query(
      'SELECT status, net_weight, purity, fine_weight, huid FROM product_inventory WHERE barcode = $1 AND tenant_id = $2',
      [res.body.barcode, SC_TENANT],
    );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe('InStock');
    expect(Number(rows[0].fine_weight)).toBe(computeFineWeight(net, purity));
  });

  it('rejects invalid weight and purity', async () => {
    const headers = authHeaders(token(SC_TENANT, 'U-METAL-SC'), SC_TENANT);
    const badWeight = await api()
      .post('/api/metal/intake')
      .set(headers)
      .send({ productId: 'P-METAL-1', netWeight: 0, purity: 925 });
    expect(badWeight.status).toBe(400);

    const badPurity = await api()
      .post('/api/metal/intake')
      .set(headers)
      .send({ productId: 'P-METAL-1', netWeight: 5, purity: 1500 });
    expect(badPurity.status).toBe(400);
  });

  it('rejects cross-tenant product id', async () => {
    const res = await api()
      .post('/api/metal/intake')
      .set(authHeaders(token(SC_TENANT, 'U-METAL-SC'), SC_TENANT))
      .send({ productId: 'P-METAL-OTHER', netWeight: 5, purity: 925 });
    expect(res.status).toBe(404);
  });

  it('validates and sells metal piece with weight-based price (no warranty)', async () => {
    const headers = authHeaders(token(SC_TENANT, 'U-METAL-SC'), SC_TENANT);
    const intake = await api().post('/api/metal/intake').set(headers).send({
      productId: 'P-METAL-1',
      netWeight: 10,
      purity: 999,
      metalRate: 100,
      makingRate: 20,
      barcode: 'AG-SALE-UNIQUE-1',
    });
    expect(intake.status).toBe(201);
    const barcode = intake.body.barcode as string;

    const validate = await api()
      .get(`/api/sales/validate/${encodeURIComponent(barcode)}`)
      .set(headers);
    expect(validate.status).toBe(200);
    expect(validate.body.valid).toBe(true);
    expect(validate.body.metalPricing).toBe(true);
    expect(Number(validate.body.price)).toBe(computeMetalSalePrice(10, 100, 200));

    const sale = await api().post('/api/sales').set(headers).send({
      barcode,
      customerName: 'Metal Buyer',
      customerPhone: '9111111111',
      purchaseDate: '2026-07-15',
    });
    expect(sale.status).toBe(201);
    expect(Number(sale.body.salePrice)).toBe(computeMetalSalePrice(10, 100, 200));

    const wars = await pool.query('SELECT id FROM warranties WHERE barcode = $1 AND tenant_id = $2', [
      barcode,
      SC_TENANT,
    ]);
    expect(wars.rows.length).toBe(0);

    const rewards = await pool.query('SELECT id FROM rewards WHERE sale_id = $1 AND tenant_id = $2', [
      sale.body.id,
      SC_TENANT,
    ]);
    expect(rewards.rows.length).toBe(0);

    const inv = await pool.query('SELECT status FROM product_inventory WHERE barcode = $1 AND tenant_id = $2', [
      barcode,
      SC_TENANT,
    ]);
    expect(inv.rows[0].status).toBe('Sold');
  });

  it('returns fine ledger totals for silver_casting', async () => {
    const headers = authHeaders(token(SC_TENANT, 'U-METAL-SC'), SC_TENANT);
    const res = await api().get('/api/metal/fine-ledger').set(headers);
    expect(res.status).toBe(200);
    expect(res.body.totals).toBeTruthy();
    expect(typeof res.body.totals.fineIn).toBe('number');
    expect(typeof res.body.totals.fineOut).toBe('number');
    expect(typeof res.body.totals.fineOnHand).toBe('number');
    expect(res.body.totals.fineIn).toBeGreaterThan(0);
    expect(res.body.totals.fineOut).toBeGreaterThan(0);
  });

  it('rejects fine ledger for manufacturer tenants', async () => {
    const res = await api()
      .get('/api/metal/fine-ledger')
      .set(authHeaders(token(MFG_TENANT, 'U-METAL-MFG'), MFG_TENANT));
    expect(res.status).toBe(403);
  });

  it('denies metal intake when inventory module is hidden', async () => {
    // Staff with inventory hidden via custom permissions on token — createTestToken only has role.
    // Use Warehouse role: inventory view allows GET, but POST needs full.
    const warehouseTok = createTestToken({
      userId: 'U-METAL-WH',
      tenantId: SC_TENANT,
      email: 'wh@test.com',
      role: 'Warehouse',
      name: 'Warehouse',
    });
    const res = await api()
      .post('/api/metal/intake')
      .set(authHeaders(warehouseTok, SC_TENANT))
      .send({ productId: 'P-METAL-1', netWeight: 3, purity: 925 });
    expect(res.status).toBe(403);
  });
});
