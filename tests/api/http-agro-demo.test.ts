import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { api } from '../http';
import { cleanupTestData, createSuperAdminToken, pool } from '../helpers';

const SA = () => ({ Authorization: `Bearer ${createSuperAdminToken()}` });

async function cleanupDemo() {
  const tenant = (await pool.query('SELECT id FROM tenants WHERE slug = $1', ['agro-wholesale-demo'])).rows[0] as
    { id: string } | undefined;
  if (tenant) await cleanupTestData(tenant.id);
}

describe('Agro wholesale demo tenant', () => {
  beforeAll(cleanupDemo);
  afterAll(cleanupDemo);

  it('creates a clickable demo with operations and Books data', async () => {
    const response = await api().post('/api/super-admin/tenants/demo/agro-wholesale').set(SA());
    expect(response.status).toBe(201);
    expect(response.body.slug).toBe('agro-wholesale-demo');
    expect(response.body.businessType).toBe('dealer');
    expect(response.body.invoiceNumber).toBe('INV-DEMO-001');

    const tenantId = response.body.tenantId as string;
    const tenant = (await pool.query('SELECT business_type, gst_number FROM tenants WHERE id = $1', [tenantId]))
      .rows[0];
    expect(tenant.business_type).toBe('dealer');
    expect(tenant.gst_number).toBe('24AABCD1234E1Z5');

    const counts = await pool.query(
      `SELECT
         (SELECT COUNT(*) FROM products WHERE tenant_id = $1) AS products,
         (SELECT COUNT(*) FROM product_purchases WHERE tenant_id = $1) AS purchases,
         (SELECT COUNT(*) FROM product_sales WHERE tenant_id = $1) AS sales,
         (SELECT COUNT(*) FROM standalone_invoices WHERE tenant_id = $1) AS invoices,
         (SELECT COUNT(*) FROM book_vouchers WHERE tenant_id = $1) AS vouchers`,
      [tenantId],
    );
    expect(counts.rows[0]).toMatchObject({ products: '1', purchases: '5', sales: '1', invoices: '1' });
    expect(Number(counts.rows[0].vouchers)).toBeGreaterThanOrEqual(3);
  });

  it('is repeat-safe instead of creating a second demo tenant', async () => {
    const response = await api().post('/api/super-admin/tenants/demo/agro-wholesale').set(SA());
    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/already exists/i);
  });
});
