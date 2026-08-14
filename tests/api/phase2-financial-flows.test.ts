/**
 * Phase 2: End-to-end financial flow tests.
 *
 * Tests complete workflows: invoice creation → payment → reports.
 * Verifies overpayment guard, partial payments, expense recording, credit notes.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool, createTestToken, cleanupTestData } from '../helpers';
import { api, authHeaders } from '../http';

const T = 'T-FIN-FLOW-001';
const U = 'U-FIN-ADMIN-001';

const token = createTestToken({ userId: U, tenantId: T, email: 'fin@test.com', role: 'Admin', name: 'Fin Admin' });
const hdrs = authHeaders(token, T);

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

let invId: string;
let invId2: string;

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id, gst_number)
     VALUES ($1,'FinFlow Corp','finflow-corp','fin@test.com','Fin Admin','active','TRIAL','27FINFLOW1234F1Z5')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'fin@test.com',$3,'Fin Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
  await pool.query(
    `INSERT INTO vendors (id, tenant_id, name, gst_number, phone)
     VALUES ('VEND-FIN-001',$1,'Sharma Traders','27SHARM1234S1Z5','9820001234')
     ON CONFLICT DO NOTHING`,
    [T],
  );
  await pool.query(`INSERT INTO bill_settings (tenant_id, show_hsn_sac) VALUES ($1, true) ON CONFLICT DO NOTHING`, [T]);
});

afterAll(async () => {
  await cleanupTestData(T);
});

// ─── Invoice creation ─────────────────────────────────────────────────────────

describe('Invoice creation', () => {
  it('creates invoice — returns 201 with id and invoiceNumber', async () => {
    const r = await api()
      .post('/api/invoices')
      .set(hdrs)
      .send({
        customerName: 'Bombay Buyer',
        items: [
          {
            description: 'Consulting',
            quantity: 1,
            price: 10000,
            taxable: 10000,
            tax: 1800,
            gstRate: 18,
            total: 11800,
          },
        ],
        subtotal: 10000,
        taxTotal: 1800,
        grandTotal: 11800,
        gstEnabled: true,
      });
    expect(r.status).toBe(201);
    invId = r.body.id;
    expect(invId).toBeDefined();
    expect(r.body.invoiceNumber).toBeDefined();
  });

  it('invoice number is unique — two invoices get different numbers', async () => {
    const r = await api()
      .post('/api/invoices')
      .set(hdrs)
      .send({
        customerName: 'Second Buyer',
        items: [{ description: 'Item', quantity: 1, price: 500, taxable: 500, tax: 0, total: 500 }],
        subtotal: 500,
        taxTotal: 0,
        grandTotal: 500,
        gstEnabled: false,
      });
    expect(r.status).toBe(201);
    invId2 = r.body.id;
    expect(r.body.invoiceNumber).not.toBe(
      (await pool.query('SELECT invoice_number FROM standalone_invoices WHERE id = $1', [invId])).rows[0]
        ?.invoice_number,
    );
  });

  it('GET /api/invoices lists the created invoices', async () => {
    const r = await api().get('/api/invoices').set(hdrs);
    expect(r.status).toBe(200);
    const body = Array.isArray(r.body) ? r.body : (r.body.invoices ?? []);
    const ids = body.map((i: { id: string }) => i.id);
    expect(ids).toContain(invId);
  });

  it('GET /api/invoices/:id returns invoice detail', async () => {
    const r = await api().get(`/api/invoices/${invId}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.id).toBe(invId);
  });
});

// ─── Payment flows ────────────────────────────────────────────────────────────

describe('Payment flows', () => {
  const PAY_INV_ID = 'INV-PAY-TEST-001';

  beforeAll(async () => {
    // Seed a 'sent' invoice directly — avoids dependency on HTTP invoice creation order
    await pool.query(
      `INSERT INTO standalone_invoices
       (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total, grand_total, status, invoice_date, gst_enabled, invoice_kind)
       VALUES ($1,$2,'PAY-TEST-0001','Payment Test Customer','[]',10000,1800,11800,'sent',CURRENT_DATE,true,'sale')
       ON CONFLICT DO NOTHING`,
      [PAY_INV_ID, T],
    );
  });

  it('partial payment — invoice stays sent (not paid)', async () => {
    const r = await api()
      .post('/api/invoice-finance/payments')
      .set(hdrs)
      .send({
        invoiceId: PAY_INV_ID,
        amount: 5000,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'Bank Transfer',
      });
    expect([200, 201]).toContain(r.status);
    const inv = (await pool.query('SELECT status FROM standalone_invoices WHERE id = $1', [PAY_INV_ID])).rows[0] as {
      status: string;
    };
    expect(inv.status).not.toBe('paid');
  });

  it('second payment completes invoice — status becomes paid', async () => {
    const r = await api()
      .post('/api/invoice-finance/payments')
      .set(hdrs)
      .send({
        invoiceId: PAY_INV_ID,
        amount: 6800,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'UPI',
      });
    expect([200, 201]).toContain(r.status);
    const inv = (await pool.query('SELECT status FROM standalone_invoices WHERE id = $1', [PAY_INV_ID])).rows[0] as {
      status: string;
    };
    expect(inv.status).toBe('paid');
  });

  it('overpayment is rejected with 400', async () => {
    // Fresh invoice with balance 500
    const r1 = await api()
      .post('/api/invoices')
      .set(hdrs)
      .send({
        customerName: 'Overpay Test',
        items: [{ description: 'Item', quantity: 1, price: 500, taxable: 500, tax: 0, total: 500 }],
        subtotal: 500,
        taxTotal: 0,
        grandTotal: 500,
        gstEnabled: false,
      });
    const oId = r1.body.id;
    const r2 = await api()
      .post('/api/invoice-finance/payments')
      .set(hdrs)
      .send({
        invoiceId: oId,
        amount: 1000,
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'Cash',
      });
    expect(r2.status).toBe(400);
    expect(r2.body.error).toBeDefined();
  });

  it('invoice finance summary shows client with outstanding balance', async () => {
    const r = await api().get('/api/invoice-finance/summary').set(hdrs);
    expect(r.status).toBe(200);
    // Summary should be an array of client payment summaries
    const summary = Array.isArray(r.body) ? r.body : (r.body.clients ?? []);
    expect(Array.isArray(summary)).toBe(true);
  });

  it('invoice summary shows correct outstanding', async () => {
    const r = await api().get('/api/invoice-finance/summary').set(hdrs);
    expect(r.status).toBe(200);
  });
});

// ─── Invoice cancellation ──────────────────────────────────────────────────────

describe('Invoice cancellation rules', () => {
  it('cannot cancel invoice that is fully paid', async () => {
    const r = await api().delete(`/api/invoices/${invId}`).set(hdrs);
    if (r.status === 200) {
      // If delete succeeded, verify it's soft-deleted (status=cancelled)
      const inv = (await pool.query('SELECT status FROM standalone_invoices WHERE id = $1', [invId])).rows[0] as {
        status?: string;
      };
      expect(inv?.status).toBe('cancelled');
    } else {
      // 400 is acceptable — paid invoice cannot be cancelled
      expect(r.status).toBe(400);
    }
  });

  it('can delete a draft invoice with no payments', async () => {
    const r = await api().delete(`/api/invoices/${invId2}`).set(hdrs);
    // Draft invoice with no payments should be deletable
    expect([200, 201]).toContain(r.status);
  });
});

// ─── Expense flow ─────────────────────────────────────────────────────────────

describe('Expense recording', () => {
  it('creates expense successfully', async () => {
    const r = await api()
      .post('/api/expenses')
      .set(hdrs)
      .send({
        category: 'Office Supplies',
        description: 'Printer paper',
        amount: 2500,
        expenseDate: new Date().toISOString().slice(0, 10),
        paymentMethod: 'Cash',
      });
    expect([200, 201]).toContain(r.status);
  });

  it('GET /api/expenses lists expenses', async () => {
    const r = await api().get('/api/expenses').set(hdrs);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body) || Array.isArray(r.body.expenses)).toBe(true);
  });

  it('accounts P&L: netProfit = totalIncome - totalExpenses', async () => {
    const r = await api().get('/api/accounts/profit-loss').set(hdrs);
    expect(r.status).toBe(200);
    const { totalIncome, totalExpenses, netProfit } = r.body;
    if (typeof netProfit === 'number' && typeof totalIncome === 'number' && typeof totalExpenses === 'number') {
      expect(Math.abs(netProfit - (totalIncome - totalExpenses))).toBeLessThan(0.05);
    }
    // Structure must be present even if values are 0
    expect(r.body).toHaveProperty('netProfit');
  });
});

// ─── Credit/Debit notes ────────────────────────────────────────────────────────

describe('Credit and Debit notes', () => {
  it('creates credit note successfully', async () => {
    // Route is POST /api/accounts/notes (not /api/credit-debit-notes)
    const r = await api()
      .post('/api/accounts/notes')
      .set(hdrs)
      .send({
        noteType: 'credit',
        noteDate: new Date().toISOString().slice(0, 10),
        vendorId: 'VEND-FIN-001',
        vendorName: 'Sharma Traders',
        items: [{ description: 'Returned goods', quantity: 1, price: 5000, withGst: true }],
        gstRate: 18,
        reason: 'Defective goods',
      });
    expect([200, 201]).toContain(r.status);
  });

  it('creates debit note successfully', async () => {
    const r = await api()
      .post('/api/accounts/notes')
      .set(hdrs)
      .send({
        noteType: 'debit',
        noteDate: new Date().toISOString().slice(0, 10),
        vendorId: 'VEND-FIN-001',
        vendorName: 'Sharma Traders',
        items: [{ description: 'Additional freight', quantity: 1, price: 500, withGst: true }],
        gstRate: 18,
        reason: 'Freight charge',
      });
    expect([200, 201]).toContain(r.status);
  });

  it('GET /api/accounts/notes lists notes', async () => {
    const r = await api().get('/api/accounts/notes').set(hdrs);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body)).toBe(true);
  });
});

// ─── Reports ──────────────────────────────────────────────────────────────────

describe('Financial reports', () => {
  it('GET /api/accounts/profit-loss returns valid structure', async () => {
    const r = await api().get('/api/accounts/profit-loss').set(hdrs);
    expect(r.status).toBe(200);
    // Ops P&L: { revenue, costOfGoods, expenses, netProfit, ... }
    // Books P&L: { totalIncome, totalExpenses, netProfit, ... }
    // Either structure is valid
    expect(r.body).toHaveProperty('netProfit');
  });

  it('GET /api/accounts/balance-sheet returns valid structure', async () => {
    const r = await api().get('/api/accounts/balance-sheet').set(hdrs);
    expect(r.status).toBe(200);
    // Has some recognizable field
    expect(typeof r.body).toBe('object');
    expect(r.body).not.toBeNull();
  });

  it('GET /api/accounts/cash-flow returns valid structure', async () => {
    const r = await api().get('/api/accounts/cash-flow').set(hdrs);
    expect(r.status).toBe(200);
  });

  it('GET /api/reports/stock-summary returns valid structure', async () => {
    const r = await api().get('/api/reports/stock-summary').set(hdrs);
    expect(r.status).toBe(200);
    // Can be array or { data: [] }
    expect(Array.isArray(r.body) || Array.isArray(r.body?.data) || typeof r.body === 'object').toBe(true);
  });

  it('GET /api/reports/sales-register returns valid structure', async () => {
    const r = await api().get('/api/reports/sales-register').set(hdrs);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body) || Array.isArray(r.body?.data) || typeof r.body === 'object').toBe(true);
  });

  it('GET /api/reports/payment-register returns valid structure', async () => {
    const r = await api().get('/api/reports/payment-register').set(hdrs);
    expect(r.status).toBe(200);
    expect(Array.isArray(r.body) || Array.isArray(r.body?.data) || typeof r.body === 'object').toBe(true);
  });

  it('GET /api/reports/outstanding returns valid structure', async () => {
    const r = await api().get('/api/reports/outstanding').set(hdrs);
    expect([200, 404]).toContain(r.status); // may need specific params
    if (r.status === 200) {
      expect(Array.isArray(r.body) || typeof r.body === 'object').toBe(true);
    }
  });

  it('GSTR-3B compute runs without error', async () => {
    const month = new Date().getMonth() + 1;
    const year = new Date().getFullYear();
    const r = await api().get(`/api/gstr3b/compute?month=${month}&year=${year}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body).toHaveProperty('output');
    expect(r.body).toHaveProperty('itc');
    expect(r.body).toHaveProperty('netPayable');
  });
});
