import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { BookVoucherValidationError, createBookVoucher, realisePdcVoucher } from '../../server/services/bookVouchers';

const TENANT = 'T-TEST-BOOK-VOUCHERS';

async function seedLedgers() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'Book Voucher Test',$2,'bv@test.com','BV','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `bv-${TENANT.toLowerCase()}`],
  );
  const fy = uid('BF');
  await pool.query(
    `INSERT INTO book_financial_years (id, tenant_id, code, label, is_active, external_ref)
     VALUES ($1,$2,'YR25','FY 2025-26',true,'YR25')
     ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true`,
    [fy, TENANT],
  );
  const g = uid('BG');
  await pool.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref)
     VALUES ($1,$2,'Cash','A','G-CASH')`,
    [g, TENANT],
  );
  const cash = uid('BL');
  const party = uid('BL');
  const bank = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
     VALUES
       ($1,$4,'Cash Account',$5,'A','CS',0,'L-CASH'),
       ($2,$4,'MITULBHAI',$5,'A','PR',0,'L-PARTY'),
       ($3,$4,'HDFC Bank',$5,'A','BK',0,'L-BANK')`,
    [cash, party, bank, TENANT, g],
  );
  return { cash, party, bank };
}

describe('bookVouchers', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Book Voucher Test',$2,'bv@test.com','BV','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `bv-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('creates a balanced receipt voucher', async () => {
    await cleanupTestData(TENANT);
    const { cash, party } = await seedLedgers();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-06-01',
        voucherNumber: 'CR/1',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 1500,
        narration: 'Test receipt',
      });
      await client.query('COMMIT');
      expect(created.amount).toBe(1500);
      expect(created.voucherType).toBe('receipt');
      expect(created.ops.dualWrite).toBe('skipped');

      const entries = await pool.query(
        `SELECT ledger_id, debit::float AS debit, credit::float AS credit
         FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_no`,
        [TENANT, created.id],
      );
      expect(entries.rows).toHaveLength(2);
      expect(entries.rows[0]).toMatchObject({ ledger_id: cash, debit: 1500, credit: 0 });
      expect(entries.rows[1]).toMatchObject({ ledger_id: party, debit: 0, credit: 1500 });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('creates payment and contra vouchers', async () => {
    await cleanupTestData(TENANT);
    const { cash, party, bank } = await seedLedgers();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pay = await createBookVoucher(client, TENANT, {
        voucherType: 'payment',
        voucherDate: '2025-06-02',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 200,
      });
      const contra = await createBookVoucher(client, TENANT, {
        voucherType: 'contra',
        voucherDate: '2025-06-03',
        partyLedgerId: bank,
        contraLedgerId: cash,
        amount: 500,
      });
      await client.query('COMMIT');
      expect(pay.voucherType).toBe('payment');
      expect(contra.voucherType).toBe('contra');
      expect(contra.amount).toBe(500);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('creates a sales voucher (Dr party / Cr sales income)', async () => {
    await cleanupTestData(TENANT);
    const { party } = await seedLedgers();
    const sales = uid('BL');
    const g = (await pool.query(`SELECT id FROM book_account_groups WHERE tenant_id = $1 LIMIT 1`, [TENANT]))
      .rows[0] as { id: string };
    await pool.query(
      `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
       VALUES ($1,$2,'Sales Income',$3,'I','IN',0,'L-SALES')`,
      [sales, TENANT, g.id],
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await createBookVoucher(client, TENANT, {
        voucherType: 'sales',
        voucherDate: '2025-06-10',
        voucherNumber: 'SE/9',
        partyLedgerId: party,
        contraLedgerId: sales,
        amount: 999,
        narration: 'Desk sales',
      });
      await client.query('COMMIT');
      expect(created.voucherType).toBe('sales');
      expect(created.amount).toBe(999);
      const entries = await pool.query(
        `SELECT ledger_id, debit::float AS debit, credit::float AS credit
         FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_no`,
        [TENANT, created.id],
      );
      expect(entries.rows).toEqual([
        expect.objectContaining({ ledger_id: party, debit: 999, credit: 0 }),
        expect.objectContaining({ ledger_id: sales, debit: 0, credit: 999 }),
      ]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('creates PDC receipt, keeps it off posting sums, and realises to receipt', async () => {
    await cleanupTestData(TENANT);
    const { cash, party } = await seedLedgers();
    let pdcId = '';
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // Ensure memo columns exist (idempotent) for older test DBs
      await client.query(`ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS instrument_ref TEXT`);
      await client.query(`ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS maturity_date DATE`);
      await client.query(`ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS memo_status TEXT`);
      await client.query(`ALTER TABLE book_vouchers ADD COLUMN IF NOT EXISTS realised_voucher_id TEXT`);
      const pdc = await createBookVoucher(client, TENANT, {
        voucherType: 'pdc_receipt',
        voucherDate: '2025-08-01',
        maturityDate: '2025-09-15',
        instrumentRef: '998877',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 5000,
        narration: 'PDC from party',
      });
      expect(pdc.voucherType).toBe('pdc_receipt');
      expect(pdc.amount).toBe(5000);
      pdcId = pdc.id;
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const memoRow = (
      await pool.query(
        `SELECT memo_status, instrument_ref, maturity_date::text AS maturity_date
         FROM book_vouchers WHERE tenant_id = $1 AND id = $2`,
        [TENANT, pdcId],
      )
    ).rows[0];
    expect(memoRow).toMatchObject({
      memo_status: 'open',
      instrument_ref: '998877',
    });
    expect(String(memoRow.maturity_date).startsWith('2025-09-15')).toBe(true);

    const ignored = await pool.query(
      `SELECT COALESCE(SUM(e.debit),0)::float AS debit
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id = e.voucher_id AND v.tenant_id = e.tenant_id
       WHERE e.tenant_id = $1 AND e.ledger_id = $2
         AND v.voucher_type NOT IN ('pdc_receipt','pdc_payment','memorandum')`,
      [TENANT, cash],
    );
    expect(Number(ignored.rows[0].debit)).toBe(0);

    const raw = await pool.query(
      `SELECT COALESCE(SUM(e.debit),0)::float AS debit
       FROM book_voucher_entries e
       WHERE e.tenant_id = $1 AND e.ledger_id = $2 AND e.voucher_id = $3`,
      [TENANT, cash, pdcId],
    );
    expect(Number(raw.rows[0].debit)).toBe(5000);

    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      const realised = await realisePdcVoucher(client2, TENANT, pdcId);
      expect(realised.voucherType).toBe('receipt');
      expect(realised.amount).toBe(5000);
      await client2.query('COMMIT');

      const after = await pool.query(
        `SELECT memo_status, realised_voucher_id FROM book_vouchers WHERE tenant_id = $1 AND id = $2`,
        [TENANT, pdcId],
      );
      expect(after.rows[0]).toMatchObject({
        memo_status: 'realised',
        realised_voucher_id: realised.realisedId,
      });

      const posted = await pool.query(
        `SELECT COALESCE(SUM(e.debit),0)::float AS debit
         FROM book_voucher_entries e
         JOIN book_vouchers v ON v.id = e.voucher_id AND v.tenant_id = e.tenant_id
         WHERE e.tenant_id = $1 AND e.ledger_id = $2
           AND v.voucher_type NOT IN ('pdc_receipt','pdc_payment','memorandum')`,
        [TENANT, cash],
      );
      expect(Number(posted.rows[0].debit)).toBe(5000);
    } catch (e) {
      await client2.query('ROLLBACK');
      throw e;
    } finally {
      client2.release();
    }
  });

  it('creates credit and debit note vouchers with correct sides', async () => {
    await cleanupTestData(TENANT);
    const { party } = await seedLedgers();
    const sales = uid('BL');
    const g = (await pool.query(`SELECT id FROM book_account_groups WHERE tenant_id = $1 LIMIT 1`, [TENANT]))
      .rows[0] as { id: string };
    await pool.query(
      `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
       VALUES ($1,$2,'Sales Income',$3,'I','IN',0,'L-SALES')`,
      [sales, TENANT, g.id],
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cn = await createBookVoucher(client, TENANT, {
        voucherType: 'credit_note',
        voucherDate: '2025-07-01',
        voucherNumber: 'CN/1',
        partyLedgerId: party,
        contraLedgerId: sales,
        amount: 250,
        narration: 'Sales return',
      });
      expect(cn.voucherType).toBe('credit_note');
      expect(cn.amount).toBe(250);

      const dn = await createBookVoucher(client, TENANT, {
        voucherType: 'debit_note',
        voucherDate: '2025-07-02',
        voucherNumber: 'DN/1',
        partyLedgerId: party,
        contraLedgerId: sales,
        amount: 80,
        narration: 'Extra charge',
      });
      expect(dn.voucherType).toBe('debit_note');
      await client.query('COMMIT');

      const cnEntries = await pool.query(
        `SELECT ledger_id, debit::float AS debit, credit::float AS credit
         FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_no`,
        [TENANT, cn.id],
      );
      expect(cnEntries.rows).toEqual([
        expect.objectContaining({ ledger_id: sales, debit: 250, credit: 0 }),
        expect.objectContaining({ ledger_id: party, debit: 0, credit: 250 }),
      ]);

      const dnEntries = await pool.query(
        `SELECT ledger_id, debit::float AS debit, credit::float AS credit
         FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2 ORDER BY line_no`,
        [TENANT, dn.id],
      );
      expect(dnEntries.rows).toEqual([
        expect.objectContaining({ ledger_id: party, debit: 80, credit: 0 }),
        expect.objectContaining({ ledger_id: sales, debit: 0, credit: 80 }),
      ]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('creates purchase and purchase_return vouchers (Dr/Cr purchase vs supplier)', async () => {
    await cleanupTestData(TENANT);
    const { party } = await seedLedgers();
    const purchase = uid('BL');
    const g = (await pool.query(`SELECT id FROM book_account_groups WHERE tenant_id = $1 LIMIT 1`, [TENANT]))
      .rows[0] as { id: string };
    await pool.query(
      `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
       VALUES ($1,$2,'Purchase Account',$3,'E','EX',0,'L-PURCH')`,
      [purchase, TENANT, g.id],
    );
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const pu = await createBookVoucher(client, TENANT, {
        voucherType: 'purchase',
        voucherDate: '2025-08-01',
        voucherNumber: 'PU/1',
        partyLedgerId: party,
        contraLedgerId: purchase,
        amount: 1200,
        narration: 'Supplier bill',
      });
      expect(pu.voucherType).toBe('purchase');

      const pr = await createBookVoucher(client, TENANT, {
        voucherType: 'purchase_return',
        voucherDate: '2025-08-02',
        voucherNumber: 'QR/1',
        partyLedgerId: party,
        contraLedgerId: purchase,
        amount: 200,
        narration: 'Return to supplier',
      });
      expect(pr.voucherType).toBe('purchase_return');
      await client.query('COMMIT');

      const puLines = await pool.query(
        `SELECT ledger_id, debit::float AS debit, credit::float AS credit
         FROM book_voucher_entries WHERE tenant_id=$1 AND voucher_id=$2 ORDER BY line_no`,
        [TENANT, pu.id],
      );
      expect(puLines.rows).toEqual([
        expect.objectContaining({ ledger_id: purchase, debit: 1200, credit: 0 }),
        expect.objectContaining({ ledger_id: party, debit: 0, credit: 1200 }),
      ]);

      const prLines = await pool.query(
        `SELECT ledger_id, debit::float AS debit, credit::float AS credit
         FROM book_voucher_entries WHERE tenant_id=$1 AND voucher_id=$2 ORDER BY line_no`,
        [TENANT, pr.id],
      );
      expect(prLines.rows).toEqual([
        expect.objectContaining({ ledger_id: party, debit: 200, credit: 0 }),
        expect.objectContaining({ ledger_id: purchase, debit: 0, credit: 200 }),
      ]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('rejects unbalanced journals and same-ledger cash vouchers', async () => {
    await cleanupTestData(TENANT);
    const { cash, party } = await seedLedgers();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await expect(
        createBookVoucher(client, TENANT, {
          voucherType: 'receipt',
          voucherDate: '2025-06-01',
          partyLedgerId: cash,
          contraLedgerId: cash,
          amount: 10,
        }),
      ).rejects.toBeInstanceOf(BookVoucherValidationError);

      await expect(
        createBookVoucher(client, TENANT, {
          voucherType: 'journal',
          voucherDate: '2025-06-01',
          entries: [
            { ledgerId: cash, debit: 100 },
            { ledgerId: party, credit: 50 },
          ],
        }),
      ).rejects.toThrow(/not balanced/i);

      const ok = await createBookVoucher(client, TENANT, {
        voucherType: 'journal',
        voucherDate: '2025-06-01',
        entries: [
          { ledgerId: cash, debit: 100 },
          { ledgerId: party, credit: 100 },
        ],
      });
      expect(ok.amount).toBe(100);
      expect(ok.ops.dualWrite).toBe('skipped');
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('dual-writes receipt to invoice_payments when party maps to vendor', async () => {
    await cleanupTestData(TENANT);
    const { cash, party } = await seedLedgers();
    const vendorId = uid('VN');
    await pool.query(`INSERT INTO vendors (id, tenant_id, name, external_ref) VALUES ($1,$2,'MITULBHAI','L-PARTY')`, [
      vendorId,
      TENANT,
    ]);
    const invId = uid('SI');
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, party_type, party_id, status, grand_total, invoice_date, items)
       VALUES ($1,$2,'INV-1','MITULBHAI','vendor',$3,'sent',1000,'2025-05-01','[]')`,
      [invId, TENANT, vendorId],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await createBookVoucher(client, TENANT, {
        voucherType: 'receipt',
        voucherDate: '2025-06-01',
        voucherNumber: 'CR/9',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 400,
        narration: 'Partial receipt',
      });
      await client.query('COMMIT');

      expect(created.ops.dualWrite).toBe('receipt');
      expect(created.ops.vendorId).toBe(vendorId);
      expect(created.ops.invoicePayments).toBe(1);
      expect(created.ops.paymentMethod).toBe('Cash');

      const pays = await pool.query(
        `SELECT amount::float AS amount, idempotency_key, payment_method
         FROM invoice_payments WHERE tenant_id = $1 AND invoice_id = $2`,
        [TENANT, invId],
      );
      expect(pays.rows).toHaveLength(1);
      expect(pays.rows[0].amount).toBe(400);
      expect(pays.rows[0].idempotency_key).toBe(`books:${created.id}:0`);
      expect(pays.rows[0].payment_method).toBe('Cash');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('dual-writes payment to vendor_payments', async () => {
    await cleanupTestData(TENANT);
    const { cash, party } = await seedLedgers();
    const vendorId = uid('VN');
    await pool.query(`INSERT INTO vendors (id, tenant_id, name, external_ref) VALUES ($1,$2,'MITULBHAI','L-PARTY')`, [
      vendorId,
      TENANT,
    ]);

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await createBookVoucher(client, TENANT, {
        voucherType: 'payment',
        voucherDate: '2025-06-02',
        partyLedgerId: party,
        contraLedgerId: cash,
        amount: 250,
      });
      await client.query('COMMIT');

      expect(created.ops.dualWrite).toBe('payment');
      expect(created.ops.vendorPayments).toBe(1);

      const pays = await pool.query(
        `SELECT amount::float AS amount, idempotency_key FROM vendor_payments WHERE tenant_id = $1`,
        [TENANT],
      );
      expect(pays.rows).toHaveLength(1);
      expect(pays.rows[0].amount).toBe(250);
      expect(pays.rows[0].idempotency_key).toBe(`books:${created.id}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('dual-writes purchase items to ops stock when supplier and product resolve', async () => {
    await cleanupTestData(TENANT);
    await pool.query('ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS external_ref TEXT');
    await pool.query('ALTER TABLE products ADD COLUMN IF NOT EXISTS external_ref TEXT');
    const { party } = await seedLedgers();
    const purchase = uid('BL');
    const g = (
      await pool.query(`SELECT group_id AS id FROM book_ledgers WHERE tenant_id=$1 AND id=$2`, [TENANT, party])
    ).rows[0] as { id: string };
    await pool.query(
      `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
       VALUES ($1,$2,'Purchase A/c',$3,'E','PU',0,'L-PUR')`,
      [purchase, TENANT, g.id],
    );
    const supplierId = uid('SU');
    await pool.query(`INSERT INTO suppliers (id, tenant_id, name, external_ref) VALUES ($1,$2,'MITULBHAI','L-PARTY')`, [
      supplierId,
      TENANT,
    ]);
    const productId = uid('PR');
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock, external_ref) VALUES ($1,$2,'Bolt',10,0,'X-BOLT')`,
      [productId, TENANT],
    );
    const bookProductId = uid('BP');
    await pool.query(
      `INSERT INTO book_products (id, tenant_id, name, unit, external_ref) VALUES ($1,$2,'Bolt','Piece','X-BOLT')`,
      [bookProductId, TENANT],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const created = await createBookVoucher(client, TENANT, {
        voucherType: 'purchase',
        voucherDate: '2025-06-03',
        voucherNumber: 'PU/1',
        partyLedgerId: party,
        contraLedgerId: purchase,
        amount: 100,
        items: [{ productId: bookProductId, qty: 2, rate: 50, amount: 100 }],
      });
      await client.query('COMMIT');

      expect(created.ops.dualWrite).toBe('purchase');
      expect(created.ops.stockUnits).toBe(2);
      expect(created.ops.supplierId).toBe(supplierId);

      const stock = await pool.query(`SELECT stock::int AS s FROM products WHERE tenant_id=$1 AND id=$2`, [
        TENANT,
        productId,
      ]);
      expect(stock.rows[0].s).toBe(2);

      const items = await pool.query(
        `SELECT COUNT(*)::int AS n FROM book_voucher_items WHERE tenant_id=$1 AND voucher_id=$2`,
        [TENANT, created.id],
      );
      expect(items.rows[0].n).toBe(1);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
});
