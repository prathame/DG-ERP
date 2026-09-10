/**
 * ITC Ledger — realistic agro-wholesale test data.
 *
 * Seeds purchases across Apr–Sep 2024 using real products from test-data/valid/products.csv:
 *   - Pesticides/herbicides (18% GST): Syngenta Cruiser, Bayer Confidor, Dhanuka Targa
 *   - Seeds (5% GST): Mahindra Tomato Seeds, Nunhems Okra Seeds
 *   - Fertilizer (5% GST): Zuari Urea, IFFCO DAP
 *   - Equipment (18% GST): Neptune Knapsack Sprayer
 * RCM purchases, credit/debit notes, and claim/reversal workflows included.
 *
 * ITC formula: billed_price - cost_price (when gst_applied=true).
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

// Real agro products from test-data/valid/products.csv
const PRODUCTS = [
  { id: 'P-ITC-SYN100', name: 'Syngenta Cruiser 350 FS (100ml)', hsn: '38089190', gst: 18, cost: 380, price: 480 },
  { id: 'P-ITC-BAY250', name: 'Bayer Confidor 200 SL (250ml)', hsn: '38089190', gst: 18, cost: 490, price: 620 },
  { id: 'P-ITC-DHN500', name: 'Dhanuka Targa Super (500ml)', hsn: '38083010', gst: 18, cost: 610, price: 780 },
  {
    id: 'P-ITC-MAH010',
    name: 'Mahindra ARISTO Hybrid Tomato Seeds (10g)',
    hsn: '12099100',
    gst: 5,
    cost: 210,
    price: 285,
  },
  { id: 'P-ITC-NUN100', name: 'Nunhems Laxmi Okra Seeds (100g)', hsn: '12099100', gst: 5, cost: 155, price: 210 },
  { id: 'P-ITC-ZUA050', name: 'Zuari Urea 46% N (50kg)', hsn: '31021000', gst: 5, cost: 242, price: 267 },
  { id: 'P-ITC-IFF050', name: 'IFFCO DAP 18-46-0 (50kg)', hsn: '31053000', gst: 5, cost: 1180, price: 1350 },
  { id: 'P-ITC-NEP016', name: 'Neptune Knapsack Sprayer 16L', hsn: '84242000', gst: 18, cost: 1420, price: 1850 },
];

// Real agro suppliers from test-data/valid/vendors.csv
const SUPPLIERS = [
  { id: 'SUP-ITC-ANAND', name: 'Anand Agri Solutions', gst: '24AABCA1234L1ZP' },
  { id: 'SUP-ITC-KISAN', name: 'Kisan Krishi Kendra', gst: '24BBBCK5678M1ZQ' },
  { id: 'SUP-ITC-GANESH', name: 'Shree Ganesh Seeds', gst: '24CCCSG9012N1ZR' },
];

// Purchases spread across Apr–Sep 2024 FY, with computed billed_price = cost * (1 + gst/100)
// ITC = billed_price - cost_price
const PURCHASES = [
  // Apr 2024 — Kharif season prep: pesticides from Anand Agri
  {
    id: 'PP-ITC-01',
    product: 'P-ITC-SYN100',
    supplier: 'SUP-ITC-ANAND',
    date: '2024-04-08',
    qty: 120,
    cost: 380,
    gst: 18,
  },
  {
    id: 'PP-ITC-02',
    product: 'P-ITC-BAY250',
    supplier: 'SUP-ITC-ANAND',
    date: '2024-04-15',
    qty: 200,
    cost: 490,
    gst: 18,
  },

  // May 2024 — Seeds from Shree Ganesh
  {
    id: 'PP-ITC-03',
    product: 'P-ITC-MAH010',
    supplier: 'SUP-ITC-GANESH',
    date: '2024-05-05',
    qty: 500,
    cost: 210,
    gst: 5,
  },
  {
    id: 'PP-ITC-04',
    product: 'P-ITC-NUN100',
    supplier: 'SUP-ITC-GANESH',
    date: '2024-05-18',
    qty: 300,
    cost: 155,
    gst: 5,
  },

  // Jun 2024 — Fertilizer from Kisan Krishi
  {
    id: 'PP-ITC-05',
    product: 'P-ITC-ZUA050',
    supplier: 'SUP-ITC-KISAN',
    date: '2024-06-10',
    qty: 600,
    cost: 242,
    gst: 5,
  },
  {
    id: 'PP-ITC-06',
    product: 'P-ITC-IFF050',
    supplier: 'SUP-ITC-KISAN',
    date: '2024-06-22',
    qty: 400,
    cost: 1180,
    gst: 5,
  },

  // Jul 2024 — Equipment + herbicide
  {
    id: 'PP-ITC-07',
    product: 'P-ITC-NEP016',
    supplier: 'SUP-ITC-ANAND',
    date: '2024-07-12',
    qty: 48,
    cost: 1420,
    gst: 18,
  },
  {
    id: 'PP-ITC-08',
    product: 'P-ITC-DHN500',
    supplier: 'SUP-ITC-ANAND',
    date: '2024-07-25',
    qty: 60,
    cost: 610,
    gst: 18,
  },

  // Aug 2024 — Restock pesticide (larger lot)
  {
    id: 'PP-ITC-09',
    product: 'P-ITC-SYN100',
    supplier: 'SUP-ITC-ANAND',
    date: '2024-08-05',
    qty: 200,
    cost: 380,
    gst: 18,
  },

  // Sep 2024 — Rabi prep: seeds + fertilizer
  {
    id: 'PP-ITC-10',
    product: 'P-ITC-MAH010',
    supplier: 'SUP-ITC-GANESH',
    date: '2024-09-10',
    qty: 300,
    cost: 210,
    gst: 5,
  },
  {
    id: 'PP-ITC-11',
    product: 'P-ITC-ZUA050',
    supplier: 'SUP-ITC-KISAN',
    date: '2024-09-20',
    qty: 400,
    cost: 242,
    gst: 5,
  },
];

// RCM purchases — unregistered farmer supply (Jul + Sep)
const RCM_PURCHASES = [
  {
    id: 'PP-ITC-RCM-01',
    product: 'P-ITC-ZUA050',
    supplier: 'SUP-ITC-KISAN',
    date: '2024-07-08',
    qty: 100,
    cost: 242,
    gst: 5,
  },
  {
    id: 'PP-ITC-RCM-02',
    product: 'P-ITC-IFF050',
    supplier: 'SUP-ITC-KISAN',
    date: '2024-09-15',
    qty: 50,
    cost: 1180,
    gst: 5,
  },
];

function billedPrice(cost: number, gst: number, qty: number) {
  return Math.round(cost * qty * (1 + gst / 100) * 100) / 100;
}

function taxAmount(cost: number, gst: number, qty: number) {
  return Math.round(cost * qty * (gst / 100) * 100) / 100;
}

// Expected ITC by month (billed_price - cost_price per row)
// Apr: SYN100 120*380*0.18 = 8208, BAY250 200*490*0.18 = 17640  → 25848
// May: MAH010 500*210*0.05 = 5250, NUN100 300*155*0.05 = 2325  → 7575
// Jun: ZUA050 600*242*0.05 = 7260, IFF050 400*1180*0.05 = 23600  → 30860
// Jul: NEP016 48*1420*0.18 = 12268.80, DHN500 60*610*0.18 = 6588  → 18856.80
// Aug: SYN100 200*380*0.18 = 13680
// Sep: MAH010 300*210*0.05 = 3150, ZUA050 400*242*0.05 = 4840  → 7990
const EXPECTED_PURCHASE_ITC: Record<number, number> = {
  4: 25848, // Apr
  5: 7575, // May
  6: 30860, // Jun
  7: 18856.8, // Jul
  8: 13680, // Aug
  9: 7990, // Sep
};

// RCM ITC by month
// Jul: ZUA050 100*242*0.05 = 1210
// Sep: IFF050 50*1180*0.05 = 2950
const EXPECTED_RCM_ITC: Record<number, number> = {
  7: 1210,
  9: 2950,
};

beforeAll(async () => {
  await cleanupTestData(T);

  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id, gst_number, business_type)
     VALUES ($1,'Shree Kisan Agro Wholesale','itc-test','itcadmin@test.com','ITC Admin','active','TRIAL','24AABCD1234E1Z5','dealer')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role) VALUES
     ($1,$2,'itcadmin@test.com',$3,'ITC Admin','Admin'),
     ($4,$2,'itcstaff@test.com',$3,'ITC Staff','Staff')
     ON CONFLICT DO NOTHING`,
    [U_ADMIN, T, hash, U_STAFF],
  );

  // Suppliers
  for (const s of SUPPLIERS) {
    await pool.query(
      `INSERT INTO suppliers (id, tenant_id, name, gst_number)
       VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
      [s.id, T, s.name, s.gst],
    );
  }

  // Products
  for (const p of PRODUCTS) {
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, hsn_code, gst_rate, price, cost_price)
       VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
      [p.id, T, p.name, p.hsn, p.gst, p.price, p.cost],
    );
  }

  // Forward-charge purchases
  for (const pp of PURCHASES) {
    const totalCost = pp.cost * pp.qty;
    const billed = billedPrice(pp.cost, pp.gst, pp.qty);
    await pool.query(
      `INSERT INTO product_purchases (id, tenant_id, product_id, supplier_id, purchase_date, cost_price, billed_price, gst_applied, barcode, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,$9) ON CONFLICT DO NOTHING`,
      [pp.id, T, pp.product, pp.supplier, pp.date, totalCost, billed, `BC-${pp.id}`, `B-${pp.id}`],
    );
  }

  // RCM purchases
  for (const pp of RCM_PURCHASES) {
    const totalCost = pp.cost * pp.qty;
    const billed = billedPrice(pp.cost, pp.gst, pp.qty);
    await pool.query(
      `INSERT INTO product_purchases (id, tenant_id, product_id, supplier_id, purchase_date, cost_price, billed_price, gst_applied, is_rcm, barcode, batch_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true,true,$8,$9) ON CONFLICT DO NOTHING`,
      [pp.id, T, pp.product, pp.supplier, pp.date, totalCost, billed, `BC-${pp.id}`, `B-${pp.id}`],
    );
  }

  // Debit notes — quality issue on pesticide batch (Aug) and seed lot (Sep)
  await pool.query(
    `INSERT INTO credit_debit_notes (id, tenant_id, note_type, note_number, note_date, subtotal, gst_amount, total, reason, vendor_name)
     VALUES
       ('DN-ITC-1',$1,'debit','DN-AGRO-001','2024-08-12',5000,900,5900,'Damaged Syngenta Cruiser batch — 10 boxes leaked','Anand Agri Solutions'),
       ('DN-ITC-2',$1,'debit','DN-AGRO-002','2024-09-25',2000,100,2100,'Poor germination rate on Mahindra Tomato Seeds','Shree Ganesh Seeds')
     ON CONFLICT DO NOTHING`,
    [T],
  );

  // Credit note (reduces ITC) — price correction on IFFCO DAP (Jun)
  await pool.query(
    `INSERT INTO credit_debit_notes (id, tenant_id, note_type, note_number, note_date, subtotal, gst_amount, total, reason, vendor_name)
     VALUES ('CN-ITC-1',$1,'credit','CN-AGRO-001','2024-06-28',3000,150,3150,'IFFCO DAP price reduction retrospective','Kisan Krishi Kendra')
     ON CONFLICT DO NOTHING`,
    [T],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

// ─── Ledger computation ──────────────────────────────────────────────────────

describe('GET /api/itc/ledger', () => {
  it('returns 12-month register for FY 2024-25', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    expect(res.body.fy).toBe(2024);
    expect(res.body.ledger).toHaveLength(12);
    expect(res.body.ledger[0].month).toBe(4);
    expect(res.body.ledger[0].year).toBe(2024);
    expect(res.body.ledger[11].month).toBe(3);
    expect(res.body.ledger[11].year).toBe(2025);
  });

  it('Apr 2024: pesticide purchases ITC = 25848 (SYN100 @18% + BAY250 @18%)', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    const apr = res.body.ledger[0];
    expect(apr.purchaseItc).toBeCloseTo(EXPECTED_PURCHASE_ITC[4], 1);
    expect(apr.rcmItc).toBe(0);
    expect(apr.debitNoteItc).toBe(0);
    expect(apr.available).toBeCloseTo(EXPECTED_PURCHASE_ITC[4], 1);
  });

  it('May 2024: seed purchases ITC = 7575 (MAH010 + NUN100 @5%)', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    const may = res.body.ledger[1];
    expect(may.purchaseItc).toBeCloseTo(EXPECTED_PURCHASE_ITC[5], 1);
  });

  it('Jun 2024: fertilizer ITC = 30860 (ZUA050 + IFF050 @5%)', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    const jun = res.body.ledger[2];
    expect(jun.purchaseItc).toBeCloseTo(EXPECTED_PURCHASE_ITC[6], 1);
  });

  it('Jul 2024: equipment + herbicide ITC = 18856.80, RCM ITC = 1210', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    const jul = res.body.ledger[3];
    expect(jul.purchaseItc).toBeCloseTo(EXPECTED_PURCHASE_ITC[7], 1);
    expect(jul.rcmItc).toBeCloseTo(EXPECTED_RCM_ITC[7], 1);
    expect(jul.available).toBeCloseTo(EXPECTED_PURCHASE_ITC[7] + EXPECTED_RCM_ITC[7], 1);
  });

  it('Aug 2024: restock ITC = 13680 + debit note adj = 900', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    const aug = res.body.ledger[4];
    expect(aug.purchaseItc).toBeCloseTo(EXPECTED_PURCHASE_ITC[8], 1);
    expect(aug.debitNoteItc).toBeCloseTo(900, 1);
    expect(aug.available).toBeCloseTo(EXPECTED_PURCHASE_ITC[8] + 900, 1);
  });

  it('Sep 2024: rabi prep ITC = 7990, RCM = 2950, DN adj = 100', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    const sep = res.body.ledger[5];
    expect(sep.purchaseItc).toBeCloseTo(EXPECTED_PURCHASE_ITC[9], 1);
    expect(sep.rcmItc).toBeCloseTo(EXPECTED_RCM_ITC[9], 1);
    expect(sep.debitNoteItc).toBeCloseTo(100, 1);
    expect(sep.available).toBeCloseTo(EXPECTED_PURCHASE_ITC[9] + EXPECTED_RCM_ITC[9] + 100, 1);
  });

  it('Oct–Mar 2025: no purchases = zero available', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    for (let i = 6; i < 12; i++) {
      expect(res.body.ledger[i].available).toBe(0);
    }
  });

  it('cumulative balance grows correctly across months', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    let running = 0;
    for (const row of res.body.ledger) {
      running += row.net;
      expect(row.balance).toBeCloseTo(running, 1);
    }
  });

  it('staff can view ledger (blockVendors, not requireAdmin)', async () => {
    await api().get('/api/itc/ledger?fy=2024').set(staffHdrs).expect(200);
  });
});

// ─── Claim/reversal CRUD ─────────────────────────────────────────────────────

describe('PUT /api/itc/claims/:period', () => {
  it('rejects non-admin (Staff gets 403)', async () => {
    await api()
      .put('/api/itc/claims/042024')
      .set(staffHdrs)
      .send({ claimedAmount: 25848, status: 'filed' })
      .expect(403);
  });

  it('saves claim for Apr 2024 — full ITC claimed after GSTR-3B filing', async () => {
    const res = await api()
      .put('/api/itc/claims/042024')
      .set(adminHdrs)
      .send({ claimedAmount: 25848, status: 'filed' })
      .expect(200);
    expect(Number(res.body.claimed_amount)).toBe(25848);
    expect(res.body.status).toBe('filed');
  });

  it('saves partial claim + reversal for Jul 2024 (Sec 17(5) blocked credit on personal sprayer)', async () => {
    const res = await api()
      .put('/api/itc/claims/072024')
      .set(adminHdrs)
      .send({
        claimedAmount: 15000,
        reversalAmount: 5066.8,
        reversalReason: 'Sec 17(5) — Neptune Sprayer used for personal farm, blocked credit',
        status: 'filed',
      })
      .expect(200);
    expect(Number(res.body.reversal_amount)).toBeCloseTo(5066.8, 1);
    expect(res.body.reversal_reason).toMatch(/Sec 17\(5\)/);
  });

  it('reflects claims in ledger response', async () => {
    const res = await api().get('/api/itc/ledger?fy=2024').set(adminHdrs).expect(200);
    const apr = res.body.ledger[0];
    expect(apr.claimed).toBe(25848);
    expect(apr.status).toBe('filed');

    const jul = res.body.ledger[3];
    expect(jul.claimed).toBe(15000);
    expect(jul.reversed).toBeCloseTo(5066.8, 1);
    // net = available - reversed
    expect(jul.net).toBeCloseTo(jul.available - 5066.8, 1);
  });

  it('rejects invalid status value', async () => {
    await api().put('/api/itc/claims/042024').set(adminHdrs).send({ status: 'approved' }).expect(400);
  });

  it('upserts — updating same period overwrites values', async () => {
    const res = await api()
      .put('/api/itc/claims/042024')
      .set(adminHdrs)
      .send({ claimedAmount: 25848, status: 'confirmed' })
      .expect(200);
    expect(res.body.status).toBe('confirmed');
  });

  it('audit-logs the claim update', async () => {
    const client = await pool.connect();
    try {
      await client.query(`SELECT set_config('app.tenant_id', $1, false)`, [T]);
      const { rows } = await client.query(
        `SELECT action, entity_type, entity_id FROM audit_log
         WHERE tenant_id = $1 AND entity_type = 'itc_claim' ORDER BY created_at DESC`,
        [T],
      );
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows.some((r: Record<string, unknown>) => r.entity_id === '042024')).toBe(true);
      expect(rows.some((r: Record<string, unknown>) => r.entity_id === '072024')).toBe(true);
    } finally {
      client.release();
    }
  });
});
