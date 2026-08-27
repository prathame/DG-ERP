/**
 * Qty+UOM stock: bags/kg/packets keep a count, no barcodes.
 * Piece/Box with a prefix still mint barcodes.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';

const TENANT = 'T-TEST-HTTP-QTY';
const USER = 'U-HTTP-QTY';
let token = '';
let vendorId = '';
let supplierId = '';
let ureaId = '';
let pumpId = '';
let batchId = '';

describe('HTTP: qty + UOM stock (no barcodes)', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'HTTP Qty Co', 'http-qty-co', 'http-qty@test.com', 'Admin', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT],
    );
    const hash = bcrypt.hashSync('password123', 12);
    await pool.query(
      `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
       VALUES ($1, $2, 'http-qty@test.com', $3, 'Admin', 'Admin')
       ON CONFLICT DO NOTHING`,
      [USER, TENANT, hash],
    );
    token = createTestToken({
      userId: USER,
      tenantId: TENANT,
      email: 'http-qty@test.com',
      role: 'Admin',
      name: 'Admin',
    });
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('POST Bag with qty sets stock and does not mint barcodes', async () => {
    const res = await api().post('/api/products').set(authHeaders(token, TENANT)).send({
      name: 'Urea 45kg',
      barcodeMode: 'prefix',
      barcodePrefix: 'ZUA',
      quantity: 100,
      price: 267,
      packName: 'Bag',
      gstRate: 5,
    });
    expect(res.status).toBe(201);
    ureaId = res.body.id;
    expect(Number(res.body.stock)).toBe(100);
    const inv = await pool.query(
      'SELECT COUNT(*)::int AS c FROM product_inventory WHERE product_id = $1 AND tenant_id = $2',
      [ureaId, TENANT],
    );
    expect(inv.rows[0].c).toBe(0);
  });

  it('POST Piece with prefix still mints barcodes', async () => {
    const res = await api().post('/api/products').set(authHeaders(token, TENANT)).send({
      name: 'Knapsack Sprayer',
      barcodeMode: 'prefix',
      barcodePrefix: 'ZSP',
      quantity: 2,
      price: 1850,
      packName: 'Piece',
    });
    expect(res.status).toBe(201);
    pumpId = res.body.id;
    expect(Number(res.body.stock)).toBe(2);
    const inv = await pool.query(
      'SELECT COUNT(*)::int AS c FROM product_inventory WHERE product_id = $1 AND tenant_id = $2',
      [pumpId, TENANT],
    );
    expect(inv.rows[0].c).toBe(2);
  });

  it('CSV import skips barcodes for Packet, mints them for Piece', async () => {
    const res = await api()
      .post('/api/products/batch')
      .set(authHeaders(token, TENANT))
      .send({
        items: [
          {
            name: 'Tomato Seeds 10g',
            price: 45,
            quantity: 50,
            barcodePrefix: 'ZTS',
            packName: 'Packet',
          },
          {
            name: 'Battery Sprayer',
            price: 3200,
            quantity: 3,
            barcodePrefix: 'ZBS',
            packName: 'Piece',
          },
        ],
      });
    expect(res.status).toBe(201);
    const seeds = await pool.query('SELECT id, stock FROM products WHERE tenant_id = $1 AND name = $2', [
      TENANT,
      'Tomato Seeds 10g',
    ]);
    expect(Number(seeds.rows[0].stock)).toBe(50);
    const seedInv = await pool.query(
      'SELECT COUNT(*)::int AS c FROM product_inventory WHERE product_id = $1 AND tenant_id = $2',
      [seeds.rows[0].id, TENANT],
    );
    expect(seedInv.rows[0].c).toBe(0);
    const sprayer = await pool.query('SELECT id FROM products WHERE tenant_id = $1 AND name = $2', [
      TENANT,
      'Battery Sprayer',
    ]);
    const sprayerInv = await pool.query(
      'SELECT COUNT(*)::int AS c FROM product_inventory WHERE product_id = $1 AND tenant_id = $2',
      [sprayer.rows[0].id, TENANT],
    );
    expect(sprayerInv.rows[0].c).toBe(3);
  });

  it('sells bags from products.stock and rejects oversell', async () => {
    const vendor = await api().post('/api/vendors').set(authHeaders(token, TENANT)).send({ name: 'Anand Agri' });
    expect(vendor.status).toBe(201);
    vendorId = vendor.body.id;

    const sale = await api()
      .post('/api/distribution/batch')
      .set(authHeaders(token, TENANT))
      .send({
        vendorId,
        distributionDate: '2026-08-27',
        items: [{ productId: ureaId, quantity: 40, withGst: true }],
      });
    expect(sale.status).toBe(201);
    batchId = sale.body.batchId;
    expect(sale.body.total).toBe(40);

    const stock = await pool.query('SELECT stock FROM products WHERE id = $1 AND tenant_id = $2', [ureaId, TENANT]);
    expect(Number(stock.rows[0].stock)).toBe(60);
    const inv = await pool.query(
      'SELECT COUNT(*)::int AS c FROM product_inventory WHERE product_id = $1 AND tenant_id = $2',
      [ureaId, TENANT],
    );
    expect(inv.rows[0].c).toBe(0);

    const oversell = await api()
      .post('/api/distribution/batch')
      .set(authHeaders(token, TENANT))
      .send({
        vendorId,
        items: [{ productId: ureaId, quantity: 61, withGst: true }],
      });
    expect(oversell.status).toBe(400);
    expect(String(oversell.body.error)).toMatch(/Insufficient stock/i);
  });

  it('deleting the sale returns bags to stock', async () => {
    const del = await api().delete(`/api/distribution/batch/${batchId}`).set(authHeaders(token, TENANT));
    expect(del.status).toBe(200);
    const stock = await pool.query('SELECT stock FROM products WHERE id = $1 AND tenant_id = $2', [ureaId, TENANT]);
    expect(Number(stock.rows[0].stock)).toBe(100);
  });

  it('add-stock on a bag product increments qty with no barcodes', async () => {
    const res = await api()
      .post(`/api/products/${ureaId}/add-stock`)
      .set(authHeaders(token, TENANT))
      .send({ quantity: 10, barcodeMode: 'none' });
    expect(res.status).toBe(201);
    expect(Number(res.body.stock)).toBe(110);
    const inv = await pool.query(
      'SELECT COUNT(*)::int AS c FROM product_inventory WHERE product_id = $1 AND tenant_id = $2',
      [ureaId, TENANT],
    );
    expect(inv.rows[0].c).toBe(0);
  });

  it('purchase of bags increases stock without minting barcodes', async () => {
    const sup = await api().post('/api/suppliers').set(authHeaders(token, TENANT)).send({ name: 'GSFC' });
    expect(sup.status).toBe(201);
    supplierId = sup.body.id;
    const res = await api()
      .post('/api/purchases/batch')
      .set(authHeaders(token, TENANT))
      .send({
        supplierId,
        purchaseDate: '2026-08-20',
        items: [{ productId: ureaId, quantity: 5, costPrice: 240, withGst: true }],
      });
    expect(res.status).toBe(201);
    const stock = await pool.query('SELECT stock FROM products WHERE id = $1 AND tenant_id = $2', [ureaId, TENANT]);
    expect(Number(stock.rows[0].stock)).toBe(115);
    const inv = await pool.query(
      'SELECT COUNT(*)::int AS c FROM product_inventory WHERE product_id = $1 AND tenant_id = $2',
      [ureaId, TENANT],
    );
    expect(inv.rows[0].c).toBe(0);
  });
});
