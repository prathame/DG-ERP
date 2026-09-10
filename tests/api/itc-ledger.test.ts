/**
 * ITC Ledger — period-wise register, claim/reversal CRUD, and admin-only guard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-ITC-001';
const U_ADMIN = 'U-ITC-ADMIN';
const U_STAFF = 'U-ITC-STAFF';

const adminToken = createTestToken({
  userId: U_ADMIN,
  tenantId: T,
  email: 'itcadmin@test.com',
  role: 'Admin',
  name: 'ITC Admin',
});
const staffToken = createTestToken({
  userId: U_STAFF,
  tenantId: T,
  email: 'itcstaff@test.com',
  role: 'Staff',
  name: 'ITC Staff',
});
const adminHdrs = authHeaders(adminToken, T);
const staffHdrs = authHeaders(staffToken, T);

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1,'ITC Corp','itc-corp','itcadmin@test.com','ITC Admin','active','TRIAL')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'itcadmin@test.com',$3,'ITC Admin','Admin'),
            ($4,$2,'itcstaff@test.com',$3,'ITC Staff','Staff')
     ON CONFLICT DO NOTHING`,
    [U_ADMIN, T, hash, U_STAFF],
  );

  // Supplier
  await pool.query(
    `INSERT INTO suppliers (id, tenant_id, name, gst_number)
     VALUES ('SUP-ITC-1',$1,'Test Supplier','27AABCT1234F1ZN')
     ON CONFLICT DO NOTHING`,
    [T],
  );

  // Product
  await pool.query(
    `INSERT INTO products (id, tenant_id, name, price, gst_rate) VALUES ('P-ITC-1',$1,'Widget',1000,18) ON CONFLICT DO NOTHING`,
    [T],
  );

  // Purchase in June 2024 — gst_applied, cost_price=1000, billed_price=1180 → tax=180
  await pool.query(
    `INSERT INTO product_purchases (id, tenant_id, product_id, supplier_id, purchase_date, cost_price, billed_price, gst_applied, barcode, batch_id)
     VALUES ('PP-ITC-1',$1,'P-ITC-1','SUP-ITC-1','2024-06-15',1000,1180,true,'BC-ITC-1','B-ITC-1')
     ON CONFLICT DO NOTHING`,
    [T],
  );

  // RCM purchase in July 2024 — is_rcm=true, cost_price=500, billed_price=590 → tax=90
  await pool.query(
    `INSERT INTO product_purchases (id, tenant_id, product_id, supplier_id, purchase_date, cost_price, billed_price, gst_applied, is_rcm, barcode, batch_id)
     VALUES ('PP-ITC-2',$1,'P-ITC-1','SUP-ITC-1','2024-07-20',500,590,true,true,'BC-ITC-2','B-ITC-2')
     ON CONFLICT DO NOTHING`,
    [T],
  );

  // Debit note in August 2024 — gst_amount=50
  await pool.query(
    `INSERT INTO credit_debit_notes (id, tenant_id, note_type, note_number, note_date, subtotal, gst_amount, total, reason)
     VALUES ('DN-ITC-1',$1,'debit','DN001','2024-08-10',500,50,550,'Quality adjustment')
     ON CONFLICT DO NOTHING`,
    [T],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

describe('GET /api/itc/ledger', () => {
  it('returns 12-month ledger for FY 2024-25', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    expect(res.body.fy).toBe(2024);
    expect(res.body.ledger).toHaveLength(12);

    // April (index 0) — no purchases
    expect(res.body.ledger[0].month).toBe(4);
    expect(res.body.ledger[0].year).toBe(2024);
    expect(res.body.ledger[0].available).toBe(0);

    // June (index 2) — forward-charge purchase ITC=180
    const june = res.body.ledger[2];
    expect(june.month).toBe(6);
    expect(june.purchaseItc).toBe(180);
    expect(june.rcmItc).toBe(0);
    expect(june.available).toBe(180);

    // July (index 3) — RCM purchase ITC=90
    const july = res.body.ledger[3];
    expect(july.month).toBe(7);
    expect(july.rcmItc).toBe(90);
    expect(july.purchaseItc).toBe(0);
    expect(july.available).toBe(90);

    // August (index 4) — debit note ITC=50
    const aug = res.body.ledger[4];
    expect(aug.month).toBe(8);
    expect(aug.debitNoteItc).toBe(50);
    expect(aug.available).toBe(50);
  });

  it('shows cumulative balance', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    // After June: balance = 180, after July: 270, after Aug: 320
    expect(res.body.ledger[2].balance).toBe(180);
    expect(res.body.ledger[3].balance).toBe(270);
    expect(res.body.ledger[4].balance).toBe(320);
  });

  it('staff can also view ITC ledger', async () => {
    await api().get('/api/itc/ledger?fy=2024').set(staffHdrs).expect(200);
  });
});

describe('PUT /api/itc/claims/:period', () => {
  it('rejects non-admin', async () => {
    await api().put('/api/itc/claims/062024').set(staffHdrs).send({ claimedAmount: 180, status: 'filed' }).expect(403);
  });

  it('saves claim for a period', async () => {
    const res = await api()
      .put('/api/itc/claims/062024')
      .set(adminHdrs)
      .send({ claimedAmount: 180, status: 'filed' })
      .expect(200);
    expect(Number(res.body.claimed_amount)).toBe(180);
    expect(res.body.status).toBe('filed');
  });

  it('saves reversal with reason', async () => {
    const res = await api()
      .put('/api/itc/claims/072024')
      .set(adminHdrs)
      .send({ claimedAmount: 50, reversalAmount: 40, reversalReason: 'Sec 17(5) blocked', status: 'filed' })
      .expect(200);
    expect(Number(res.body.reversal_amount)).toBe(40);
    expect(res.body.reversal_reason).toBe('Sec 17(5) blocked');
  });

  it('reflects claims in ledger', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    const june = res.body.ledger[2];
    expect(june.claimed).toBe(180);
    expect(june.status).toBe('filed');

    const july = res.body.ledger[3];
    expect(july.claimed).toBe(50);
    expect(july.reversed).toBe(40);
    // net = available(90) - reversed(40) = 50
    expect(july.net).toBe(50);
  });

  it('rejects invalid status', async () => {
    await api().put('/api/itc/claims/062024').set(adminHdrs).send({ status: 'invalid' }).expect(400);
  });

  it('audit-logs the claim update', async () => {
    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [T]);
      const { rows } = await client.query(
        `SELECT action, entity_type, entity_id FROM audit_log
         WHERE tenant_id = $1 AND entity_type = 'itc_claim'`,
        [T],
      );
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(rows[0].entity_id).toBe('062024');
    } finally {
      client.release();
    }
  });
});
