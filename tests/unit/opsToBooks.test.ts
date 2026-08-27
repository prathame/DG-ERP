import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import {
  postExpenseToBooks,
  postInvoicePaymentToBooks,
  postStandaloneInvoiceToBooks,
  postDistributionBatchToBooks,
  postVendorPaymentToBooks,
  postPurchaseBatchToBooks,
  postSupplierPaymentToBooks,
  postOpeningStockToBooks,
  postPurchaseReturnToBooks,
  postSaleReturnToBooks,
  ensureNativeBooksDesk,
} from '../../server/services/opsToBooks';
import {
  describeBalance,
  getBooksBalanceSheet,
  getBooksProfitLoss,
  getTrialBalance,
} from '../../server/services/bookFinancialStatements';
import { createBookVoucher } from '../../server/services/bookVouchers';

const TENANT = 'T-TEST-OPS-BOOKS';

async function seedBooksShell() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Ops Books',$2,'ob@test.com','OB','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `ob-${TENANT.toLowerCase()}`],
  );
  const fy = uid('BF');
  await pool.query(
    `INSERT INTO book_financial_years (id, tenant_id, code, label, is_active, external_ref)
     VALUES ($1,$2,'YR25','FY 2025-26',true,'YR25')
     ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true`,
    [fy, TENANT],
  );
  const gAsset = uid('BG');
  const gInc = uid('BG');
  const gExp = uid('BG');
  const gLiab = uid('BG');
  const gCap = uid('BG');
  await pool.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref)
     VALUES
       ($1,$6,'Current Assets','B','G-CA'),
       ($2,$6,'Income','I','G-IN'),
       ($3,$6,'Indirect Expenses','E','G-EX'),
       ($4,$6,'Loans','L','G-LI'),
       ($5,$6,'Capital','C','G-CAP')
     ON CONFLICT (tenant_id, external_ref) DO NOTHING`,
    [gAsset, gInc, gExp, gLiab, gCap, TENANT],
  );

  const ids = {
    cash: uid('BL'),
    bank: uid('BL'),
    sales: uid('BL'),
    rent: uid('BL'),
    loan: uid('BL'),
    capital: uid('BL'),
    trading: uid('BL'),
    party: uid('BL'),
  };

  // Resolve group ids after possible conflict upserts
  const groups = await pool.query(
    `SELECT id, external_ref FROM book_account_groups WHERE tenant_id = $1 AND external_ref LIKE 'G-%'`,
    [TENANT],
  );
  const gid = (ref: string) => (groups.rows.find(r => r.external_ref === ref) as { id: string }).id;

  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side, external_ref)
     VALUES
       ($1,$9,'Cash Account',$10,'B','CS',4000,'D','ACASHACT'),
       ($2,$9,'HDFC Bank',$10,'B','BK',0,'D','ABANK01'),
       ($3,$9,'Sales Income',$11,'I','IN',0,'C','ASALES01'),
       ($4,$9,'Rent Expense',$12,'E','EX',0,'D','ARENT01'),
       ($5,$9,'Loan Liability',$13,'L','LI',1000,'C','ALOAN01'),
       ($6,$9,'Owner Capital',$14,'C','GL',4000,'C','ACAP01'),
       ($7,$9,'Job Work Trading',$11,'T','TS',0,'C','ATRADE01'),
       ($8,$9,'MITULBHAI',$10,'B','PR',1000,'D','AGPARTY1')
     ON CONFLICT (tenant_id, external_ref) DO NOTHING`,
    [
      ids.cash,
      ids.bank,
      ids.sales,
      ids.rent,
      ids.loan,
      ids.capital,
      ids.trading,
      ids.party,
      TENANT,
      gid('G-CA'),
      gid('G-IN'),
      gid('G-EX'),
      gid('G-LI'),
      gid('G-CAP'),
    ],
  );

  const byRef = async (ref: string) =>
    (await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND external_ref = $2`, [TENANT, ref]))
      .rows[0] as { id: string };

  return {
    cash: (await byRef('ACASHACT')).id,
    bank: (await byRef('ABANK01')).id,
    sales: (await byRef('ASALES01')).id,
    rent: (await byRef('ARENT01')).id,
    trading: (await byRef('ATRADE01')).id,
    party: (await byRef('AGPARTY1')).id,
  };
}

describe('opsToBooks + CA statements', () => {
  beforeAll(async () => {
    await seedBooksShell();
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('posts GST invoice as Sales + Output CGST/SGST (not tax-in-income)', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const invId = uid('INV');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await postStandaloneInvoiceToBooks(client, TENANT, {
        id: invId,
        invoiceNumber: 'INV/GST/1',
        customerName: 'GST Party',
        grandTotal: 1180,
        subtotal: 1000,
        taxCgst: 90,
        taxSgst: 90,
        taxIgst: 0,
        invoiceDate: '2025-08-01',
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const lines = await pool.query(
      `SELECT l.name, e.debit, e.credit
       FROM book_voucher_entries e
       JOIN book_ledgers l ON l.id = e.ledger_id AND l.tenant_id = e.tenant_id
       JOIN book_vouchers v ON v.id = e.voucher_id
       WHERE e.tenant_id = $1 AND v.external_ref = $2
       ORDER BY e.line_no`,
      [TENANT, `ops:si:${invId}`],
    );
    const byName = Object.fromEntries(
      lines.rows.map((r: { name: string; debit: number; credit: number }) => [
        r.name,
        { debit: Number(r.debit), credit: Number(r.credit) },
      ]),
    );
    expect(byName['GST Party']).toEqual({ debit: 1180, credit: 0 });
    expect(byName['Sales Income']).toEqual({ debit: 0, credit: 1000 });
    expect(byName['Output CGST']).toEqual({ debit: 0, credit: 90 });
    expect(byName['Output SGST']).toEqual({ debit: 0, credit: 90 });

    const pnl = await getBooksProfitLoss(pool, TENANT, '2025-04-01', '2025-08-31');
    expect(pnl.totalIncome).toBe(1000);
    expect(pnl.netProfit).toBe(1000);

    const bs = await getBooksBalanceSheet(pool, TENANT, '2025-08-31');
    expect(bs.balanced).toBe(true);
    expect(bs.liabilities.some(l => l.name === 'Output CGST' && l.amount === 90)).toBe(true);
    expect(bs.liabilities.some(l => l.name === 'Output SGST' && l.amount === 90)).toBe(true);
    expect(bs.netProfit).toBe(1000);
    // Assets include seed openings (cash/party) + new receivable 1180
    expect(bs.assets.some(a => a.name === 'GST Party' && a.amount === 1180)).toBe(true);
  });

  it('posts invoice + receipt and balances trial balance / P&L / BS', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const invId = uid('INV');
      await postStandaloneInvoiceToBooks(client, TENANT, {
        id: invId,
        invoiceNumber: 'INV/TEST/1',
        customerName: 'Test Party',
        partyId: null,
        grandTotal: 1000,
        invoiceDate: '2025-06-01',
      });
      await postInvoicePaymentToBooks(client, TENANT, {
        id: uid('IP'),
        amount: 400,
        paymentDate: '2025-06-05',
        paymentMethod: 'Cash',
        partyName: 'Test Party',
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const tb = await getTrialBalance(pool, TENANT, '2025-04-01', '2025-06-30');
    expect(tb.balanced).toBe(true);
    expect(tb.totals.periodDebit).toBe(tb.totals.periodCredit);

    const pnl = await getBooksProfitLoss(pool, TENANT, '2025-04-01', '2025-06-30');
    expect(pnl.totalIncome).toBeGreaterThanOrEqual(1000);
    expect(pnl.netLabel).toBe('Net profit');

    const bs = await getBooksBalanceSheet(pool, TENANT, '2025-06-30');
    expect(bs.totalAssets).toBeGreaterThan(0);
    expect(bs.capital.some(c => c.name.includes('Net profit'))).toBe(true);
    expect(bs.liabilities.some(l => l.name.includes('Loan'))).toBe(true);
  });

  it('is idempotent on re-post', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const invId = 'INV-IDEMP-1';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const a = await postStandaloneInvoiceToBooks(client, TENANT, {
        id: invId,
        invoiceNumber: 'INV/IDEMP/1',
        customerName: 'Idem Party',
        grandTotal: 250,
        invoiceDate: '2025-07-01',
      });
      const b = await postStandaloneInvoiceToBooks(client, TENANT, {
        id: invId,
        invoiceNumber: 'INV/IDEMP/1',
        customerName: 'Idem Party',
        grandTotal: 250,
        invoiceDate: '2025-07-01',
      });
      await client.query('COMMIT');
      expect(a).toBeTruthy();
      expect(b).toBe(a);
    } finally {
      client.release();
    }
    const count = await pool.query(
      `SELECT COUNT(*)::int AS c FROM book_vouchers WHERE tenant_id = $1 AND external_ref = $2`,
      [TENANT, `ops:si:${invId}`],
    );
    expect(count.rows[0].c).toBe(1);
  });

  it('posts bank receipt + expense; trading debit; seeds native books when empty; skips zero', async () => {
    await cleanupTestData(TENANT);
    const ledgers = await seedBooksShell();

    const emptyTenant = 'T-TEST-OPS-EMPTY';
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Empty',$2,'e@t.com','E','active','service') ON CONFLICT (id) DO NOTHING`,
      [emptyTenant, `empty-${emptyTenant.toLowerCase()}`],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // No Miracle import — dual-write still boots Cash/Bank/Sales and posts
      expect(
        await postStandaloneInvoiceToBooks(client, emptyTenant, {
          id: 'x',
          customerName: 'N',
          grandTotal: 10,
          invoiceDate: '2025-01-01',
        }),
      ).toBeTruthy();
      const seeded = await client.query(`SELECT COUNT(*)::int AS c FROM book_ledgers WHERE tenant_id = $1`, [
        emptyTenant,
      ]);
      expect(Number(seeded.rows[0]?.c)).toBeGreaterThanOrEqual(3);

      expect(
        await postStandaloneInvoiceToBooks(client, TENANT, {
          id: 'zero',
          customerName: 'Z',
          grandTotal: 0,
          invoiceDate: '2025-01-01',
        }),
      ).toBeNull();

      expect(
        await postInvoicePaymentToBooks(client, TENANT, {
          id: uid('IP'),
          amount: 100,
          paymentDate: '2025-08-01',
          paymentMethod: 'UPI',
          partyName: 'MITULBHAI',
          referenceNumber: 'UPI-1',
        }),
      ).toBeTruthy();

      expect(
        await postExpenseToBooks(client, TENANT, {
          id: uid('EXP'),
          amount: 75,
          expenseDate: '2025-08-02',
          category: 'Office',
          description: 'Stationery',
          paymentMethod: 'Cash',
        }),
      ).toBeTruthy();

      await createBookVoucher(client, TENANT, {
        voucherType: 'journal',
        voucherDate: '2025-08-03',
        voucherNumber: 'JV/1',
        entries: [
          { ledgerId: ledgers.trading, debit: 50, credit: 0 },
          { ledgerId: ledgers.cash, debit: 0, credit: 50 },
        ],
      });

      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const pnl = await getBooksProfitLoss(pool, TENANT, '2025-08-01', '2025-08-31');
    expect(pnl.totalExpenses).toBeGreaterThanOrEqual(75);
    expect(pnl.expenses.some(e => /office|trading/i.test(e.name))).toBe(true);

    const bs = await getBooksBalanceSheet(pool, TENANT, '2025-08-31');
    expect(bs.capital.some(c => c.name.includes('Capital'))).toBe(true);
    expect(describeBalance(10).side).toBe('D');
    expect(describeBalance(-5).label).toContain('Cr');

    await cleanupTestData(emptyTenant);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [emptyTenant]);
  });

  it('resolves vendor party by external_ref', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const vendorId = uid('V');
    await pool.query(`INSERT INTO vendors (id, tenant_id, name, external_ref) VALUES ($1,$2,'MITULBHAI','AGPARTY1')`, [
      vendorId,
      TENANT,
    ]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const vid = await postStandaloneInvoiceToBooks(client, TENANT, {
        id: uid('INV'),
        invoiceNumber: 'INV/V/1',
        customerName: 'Someone Else',
        partyId: vendorId,
        grandTotal: 300,
        invoiceDate: '2025-09-01',
        notes: 'Linked party',
      });
      expect(vid).toBeTruthy();
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const entry = await pool.query(
      `SELECT l.external_ref FROM book_voucher_entries e
       JOIN book_ledgers l ON l.id = e.ledger_id AND l.tenant_id = e.tenant_id
       JOIN book_vouchers v ON v.id = e.voucher_id
       WHERE e.tenant_id = $1 AND v.voucher_type = 'sales' AND e.debit > 0
       ORDER BY v.created_at DESC LIMIT 1`,
      [TENANT],
    );
    expect(entry.rows[0]?.external_ref).toBe('AGPARTY1');
  });

  it('creates party ledger for vendor without books link and posts bank expense', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const vendorId = uid('V');
    await pool.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ($1,$2,'Brand New Client')`, [vendorId, TENANT]);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      expect(
        await postStandaloneInvoiceToBooks(client, TENANT, {
          id: uid('INV'),
          customerName: 'Brand New Client',
          partyId: vendorId,
          grandTotal: 120,
          invoiceDate: '2025-11-01',
        }),
      ).toBeTruthy();
      expect(
        await postExpenseToBooks(client, TENANT, {
          id: uid('EXP'),
          amount: 40,
          expenseDate: '2025-11-02',
          category: 'Travel',
          paymentMethod: 'NEFT',
        }),
      ).toBeTruthy();
      // trading credit → income
      const trading = (
        await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id=$1 AND external_ref='ATRADE01'`, [TENANT])
      ).rows[0].id as string;
      const cash = (
        await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id=$1 AND external_ref='ACASHACT'`, [TENANT])
      ).rows[0].id as string;
      await createBookVoucher(client, TENANT, {
        voucherType: 'journal',
        voucherDate: '2025-11-03',
        entries: [
          { ledgerId: cash, debit: 80, credit: 0 },
          { ledgerId: trading, debit: 0, credit: 80 },
        ],
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const partyLed = await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id=$1 AND external_ref = $2`, [
      TENANT,
      `ops:party:${vendorId}`,
    ]);
    expect(partyLed.rows.length).toBe(1);
    const pnl = await getBooksProfitLoss(pool, TENANT, '2025-11-01', '2025-11-30');
    expect(pnl.income.some(i => /trading|sales/i.test(i.name))).toBe(true);
  });

  it('posts distribution batch + vendor payment (manufacturer/dealer path)', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const vendorId = uid('V');
    await pool.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ($1,$2,'Dealer One') ON CONFLICT DO NOTHING`, [
      vendorId,
      TENANT,
    ]);
    const batchId = uid('D');
    const payId = uid('VP');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const salesV = await postDistributionBatchToBooks(client, TENANT, {
        batchId,
        vendorId,
        vendorName: 'Dealer One',
        billValue: 1550000,
        distributionDate: '2025-06-01',
      });
      expect(salesV).toBeTruthy();
      const again = await postDistributionBatchToBooks(client, TENANT, {
        batchId,
        vendorId,
        vendorName: 'Dealer One',
        billValue: 1550000,
        distributionDate: '2025-06-01',
      });
      expect(again).toBe(salesV);
      const receipt = await postVendorPaymentToBooks(client, TENANT, {
        id: payId,
        amount: 500000,
        paymentDate: '2025-06-05',
        paymentMethod: 'Cash',
        vendorId,
        vendorName: 'Dealer One',
      });
      expect(receipt).toBeTruthy();
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const tb = await getTrialBalance(pool, TENANT, '2025-06-01', '2025-06-30');
    expect(tb.balanced).toBe(true);
    const party = (
      await pool.query(
        `SELECT id FROM book_ledgers WHERE tenant_id=$1 AND (external_ref=$2 OR LOWER(name)=LOWER('Dealer One'))`,
        [TENANT, `ops:party:${vendorId}`],
      )
    ).rows[0] as { id: string } | undefined;
    expect(party).toBeTruthy();
  });

  it('balance sheet shows net loss plug when expenses exceed income', async () => {
    await cleanupTestData(TENANT);
    const ledgers = await seedBooksShell();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await createBookVoucher(client, TENANT, {
        voucherType: 'journal',
        voucherDate: '2025-10-01',
        entries: [
          { ledgerId: ledgers.rent, debit: 9000, credit: 0 },
          { ledgerId: ledgers.cash, debit: 0, credit: 9000 },
        ],
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const pnl = await getBooksProfitLoss(pool, TENANT, '2025-10-01', '2025-10-31');
    expect(pnl.netProfit).toBeLessThan(0);
    const bs = await getBooksBalanceSheet(pool, TENANT, '2025-10-31');
    expect(bs.assets.some(a => a.name.includes('Net loss'))).toBe(false);
    const lossPlug = bs.capital.find(a => a.name.includes('Net loss'));
    expect(lossPlug?.amount).toBe(pnl.netProfit);
  });

  it('posts purchase batch + supplier payment (Dr Stock / Cr Supplier)', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const supplierId = uid('S');
    await pool.query(
      `INSERT INTO suppliers (id, tenant_id, name) VALUES ($1,$2,'Acme Supplier') ON CONFLICT DO NOTHING`,
      [supplierId, TENANT],
    );
    const batchId = uid('PB');
    const payId = uid('SP');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pur = await postPurchaseBatchToBooks(client, TENANT, {
        batchId,
        supplierId,
        supplierName: 'Acme Supplier',
        billValue: 10000,
        purchaseDate: '2025-07-01',
      });
      expect(pur).toBeTruthy();
      const again = await postPurchaseBatchToBooks(client, TENANT, {
        batchId,
        supplierId,
        supplierName: 'Acme Supplier',
        billValue: 10000,
        purchaseDate: '2025-07-01',
      });
      expect(again).toBe(pur);
      const pay = await postSupplierPaymentToBooks(client, TENANT, {
        id: payId,
        amount: 4000,
        paymentDate: '2025-07-05',
        paymentMethod: 'Cash',
        supplierId,
        supplierName: 'Acme Supplier',
      });
      expect(pay).toBeTruthy();
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const purchase = (
      await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id=$1 AND external_ref='ops:STOCK'`, [TENANT])
    ).rows[0] as { id: string };
    const supplier = (
      await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id=$1 AND external_ref=$2`, [
        TENANT,
        `ops:supplier:${supplierId}`,
      ])
    ).rows[0] as { id: string };
    const purLines = await pool.query(
      `SELECT e.debit::float AS debit, e.credit::float AS credit, e.ledger_id
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id = e.voucher_id
       WHERE e.tenant_id=$1 AND v.external_ref=$2`,
      [TENANT, `ops:pur:${batchId}`],
    );
    expect(purLines.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ledger_id: purchase.id, debit: 10000, credit: 0 }),
        expect.objectContaining({ ledger_id: supplier.id, debit: 0, credit: 10000 }),
      ]),
    );
    const tb = await getTrialBalance(pool, TENANT, '2025-07-01', '2025-07-31');
    expect(tb.balanced).toBe(true);
  });

  it('purchase GST is stock + input tax, not a P&L expense', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const supplierId = uid('S');
    await pool.query(
      `INSERT INTO suppliers (id, tenant_id, name) VALUES ($1,$2,'GST Supplier') ON CONFLICT DO NOTHING`,
      [supplierId, TENANT],
    );
    const batchId = uid('PB');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await postPurchaseBatchToBooks(client, TENANT, {
        batchId,
        supplierId,
        supplierName: 'GST Supplier',
        billValue: 11800,
        purchaseDate: '2025-07-01',
        taxableValue: 10000,
        taxAmount: 1800,
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const stock = (
      await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id=$1 AND external_ref='ops:STOCK'`, [TENANT])
    ).rows[0] as { id: string };
    const cgst = (
      await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id=$1 AND external_ref='ops:CGST_IN'`, [TENANT])
    ).rows[0] as { id: string };
    const lines = await pool.query(
      `SELECT e.ledger_id, e.debit::float AS debit, e.credit::float AS credit
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id = e.voucher_id
       WHERE e.tenant_id=$1 AND v.external_ref=$2`,
      [TENANT, `ops:pur:${batchId}`],
    );
    expect(lines.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ledger_id: stock.id, debit: 10000, credit: 0 }),
        expect.objectContaining({ ledger_id: cgst.id, debit: 900, credit: 0 }),
      ]),
    );
    const pnl = await getBooksProfitLoss(pool, TENANT, '2025-07-01', '2025-07-31');
    expect(pnl.netProfit).toBe(0);
  });

  it('posts opening stock to the balance sheet', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const productId = uid('P');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await postOpeningStockToBooks(client, TENANT, {
        productId,
        productName: 'Urea 45kg',
        qty: 50,
        unitCost: 400,
        asOfDate: '2025-04-01',
      });
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const stock = (
      await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id=$1 AND external_ref='ops:STOCK'`, [TENANT])
    ).rows[0] as { id: string };
    const capital = (
      await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id=$1 AND external_ref='ops:OPENING_CAPITAL'`, [
        TENANT,
      ])
    ).rows[0] as { id: string };
    const lines = await pool.query(
      `SELECT e.ledger_id, e.debit::float AS debit, e.credit::float AS credit
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id = e.voucher_id
       WHERE e.tenant_id=$1 AND v.external_ref=$2`,
      [TENANT, `ops:openstock:${productId}`],
    );
    expect(lines.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ledger_id: stock.id, debit: 20000, credit: 0 }),
        expect.objectContaining({ ledger_id: capital.id, debit: 0, credit: 20000 }),
      ]),
    );
    const pnl = await getBooksProfitLoss(pool, TENANT, '2025-04-01', '2025-04-30');
    expect(pnl.netProfit).toBe(0);
  });

  it('retail distribution posts purchase (not sales)', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    await pool.query(`UPDATE tenants SET business_type = 'retail' WHERE id = $1`, [TENANT]);
    const vendorId = uid('V');
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ($1,$2,'Retail Supplier') ON CONFLICT DO NOTHING`,
      [vendorId, TENANT],
    );
    const batchId = uid('D');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const vId = await postDistributionBatchToBooks(client, TENANT, {
        batchId,
        vendorId,
        vendorName: 'Retail Supplier',
        billValue: 2500,
        distributionDate: '2025-08-01',
      });
      expect(vId).toBeTruthy();
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const v = (
      await pool.query(`SELECT voucher_type FROM book_vouchers WHERE tenant_id=$1 AND external_ref=$2`, [
        TENANT,
        `ops:dist:${batchId}`,
      ])
    ).rows[0] as { voucher_type: string };
    expect(v.voucher_type).toBe('purchase');
    const purchase = (
      await pool.query(`SELECT id FROM book_ledgers WHERE tenant_id=$1 AND external_ref='ops:PURCHASE'`, [TENANT])
    ).rows[0] as { id: string };
    const lines = await pool.query(
      `SELECT e.ledger_id, e.debit::float AS debit, e.credit::float AS credit
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id = e.voucher_id
       WHERE e.tenant_id=$1 AND v.external_ref=$2`,
      [TENANT, `ops:dist:${batchId}`],
    );
    expect(lines.rows.some(r => r.ledger_id === purchase.id && Number(r.debit) === 2500)).toBe(true);
    await pool.query(`UPDATE tenants SET business_type = 'service' WHERE id = $1`, [TENANT]);
  });

  it('does not create a second Cash Account when Miracle ACASHACT already exists', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const before = await pool.query(
      `SELECT id, external_ref, name FROM book_ledgers WHERE tenant_id=$1 AND ledger_type='CS'`,
      [TENANT],
    );
    expect(before.rows).toHaveLength(1);
    expect(before.rows[0].external_ref).toBe('ACASHACT');

    // Simulate legacy dual seed: empty ops:CASH twin
    const g = (
      await pool.query(`SELECT group_id FROM book_ledgers WHERE tenant_id=$1 AND external_ref='ACASHACT'`, [TENANT])
    ).rows[0] as { group_id: string };
    const twin = uid('BL');
    await pool.query(
      `INSERT INTO book_ledgers
         (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side, is_system, external_ref)
       VALUES ($1,$2,'Cash Account',$3,'B','CS',0,'D',true,'ops:CASH')`,
      [twin, TENANT, g.group_id],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureNativeBooksDesk(client, TENANT);
      await client.query('COMMIT');
    } finally {
      client.release();
    }

    const after = await pool.query(
      `SELECT id, external_ref FROM book_ledgers WHERE tenant_id=$1 AND ledger_type='CS' ORDER BY external_ref`,
      [TENANT],
    );
    expect(after.rows).toHaveLength(1);
    expect(after.rows[0].external_ref).toBe('ACASHACT');
    expect(after.rows.some(r => r.external_ref === 'ops:CASH')).toBe(false);
  });

  it('seeds ops:CASH only when no cash ledger exists', async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Ops Books',$2,'ob@test.com','OB','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `ob-${TENANT.toLowerCase()}`],
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await ensureNativeBooksDesk(client, TENANT);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const cash = await pool.query(
      `SELECT external_ref, name FROM book_ledgers WHERE tenant_id=$1 AND ledger_type='CS'`,
      [TENANT],
    );
    expect(cash.rows).toHaveLength(1);
    expect(cash.rows[0].external_ref).toBe('ops:CASH');
    expect(cash.rows[0].name).toBe('Cash Account');
  });

  it('posts sale return (credit note + COGS reverse) and purchase return', async () => {
    await cleanupTestData(TENANT);
    await seedBooksShell();
    const vendorId = uid('V');
    const supplierId = uid('S');
    await pool.query(`INSERT INTO vendors (id, tenant_id, name) VALUES ($1,$2,'Return Customer')`, [vendorId, TENANT]);
    await pool.query(`INSERT INTO suppliers (id, tenant_id, name) VALUES ($1,$2,'Return Supplier')`, [
      supplierId,
      TENANT,
    ]);
    const cnId = uid('CN');
    const prId = uid('DN');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      expect(
        await postSaleReturnToBooks(client, TENANT, {
          noteId: cnId,
          vendorId,
          vendorName: 'Return Customer',
          billed: 0,
          taxable: 0,
          tax: 0,
          cogs: 10,
          noteDate: '2025-08-01',
        }),
      ).toBeNull();
      const saleRet = await postSaleReturnToBooks(client, TENANT, {
        noteId: cnId,
        vendorId,
        vendorName: 'Return Customer',
        billed: 118,
        taxable: 100,
        tax: 18,
        cogs: 70,
        noteDate: '2025-08-01',
      });
      expect(saleRet).toBeTruthy();
      expect(
        await postSaleReturnToBooks(client, TENANT, {
          noteId: cnId,
          vendorId,
          vendorName: 'Return Customer',
          billed: 118,
          taxable: 100,
          tax: 18,
          cogs: 70,
          noteDate: '2025-08-01',
        }),
      ).toBe(saleRet);
      expect(
        await postPurchaseReturnToBooks(client, TENANT, {
          noteId: uid('DN'),
          supplierId,
          supplierName: 'Return Supplier',
          billed: 0,
          taxable: 0,
          tax: 0,
          noteDate: '2025-08-02',
        }),
      ).toBeNull();
      const purRet = await postPurchaseReturnToBooks(client, TENANT, {
        noteId: prId,
        supplierId,
        supplierName: 'Return Supplier',
        billed: 118,
        taxable: 100,
        tax: 18,
        noteDate: '2025-08-02',
      });
      expect(purRet).toBeTruthy();
      expect(
        await postPurchaseReturnToBooks(client, TENANT, {
          noteId: prId,
          supplierId,
          supplierName: 'Return Supplier',
          billed: 118,
          taxable: 100,
          tax: 18,
          noteDate: '2025-08-02',
        }),
      ).toBe(purRet);
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    const cn = await pool.query(`SELECT voucher_type FROM book_vouchers WHERE tenant_id=$1 AND external_ref=$2`, [
      TENANT,
      `ops:cn:${cnId}`,
    ]);
    expect(cn.rows[0]?.voucher_type).toBe('credit_note');
    const cogs = await pool.query(`SELECT voucher_type FROM book_vouchers WHERE tenant_id=$1 AND external_ref=$2`, [
      TENANT,
      `ops:cogs-ret:${cnId}`,
    ]);
    expect(cogs.rows[0]?.voucher_type).toBe('journal');
    const pr = await pool.query(`SELECT voucher_type FROM book_vouchers WHERE tenant_id=$1 AND external_ref=$2`, [
      TENANT,
      `ops:pr:${prId}`,
    ]);
    expect(pr.rows[0]?.voucher_type).toBe('purchase_return');
    const tb = await getTrialBalance(pool, TENANT, '2025-08-01', '2025-08-31');
    expect(tb.balanced).toBe(true);
  });
});
