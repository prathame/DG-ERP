/**
 * GSTR-2B reconcile — ops product_purchases + Books purchase vouchers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { createBookVoucher } from '../../server/services/bookVouchers';
import { normalizeGstr2bKeyPart, reconcileGstr2b } from '../../server/services/gstr2bReconcile';

const TENANT = 'T-TEST-GSTR2B';

async function ensureTenant() {
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1,'GSTR2B Test',$2,'g2b@test.com','G2B','active','service')
     ON CONFLICT (id) DO NOTHING`,
    [TENANT, `g2b-${TENANT.toLowerCase()}`],
  );
}

async function seedBooks() {
  await ensureTenant();
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
     VALUES ($1,$2,'Trading','T','G-TR')`,
    [g, TENANT],
  );
  const party = uid('BL');
  const purchase = uid('BL');
  await pool.query(
    `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, gstin, opening_balance, opening_side, external_ref)
     VALUES
       ($1,$3,'SUPPLIER BOOKS',$4,'L','PR','24AAAAA0000A1Z5',0,'C','L-SUP-B'),
       ($2,$3,'Purchase Account',$4,'E','GL',NULL,0,'D','ops:PURCHASE')`,
    [party, purchase, TENANT, g],
  );
  return { party, purchase };
}

describe('gstr2bReconcile', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'GSTR2B Test',$2,'g2b@test.com','G2B','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `g2b-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('normalizes GSTIN and invoice keys', () => {
    expect(normalizeGstr2bKeyPart('24-AAAAA-0000-A1Z5')).toBe('24AAAAA0000A1Z5');
    expect(normalizeGstr2bKeyPart('PU/99')).toBe('PU99');
  });

  it('matches Books purchases, flags mismatch, and keeps ops matches', async () => {
    await cleanupTestData(TENANT);
    const { party, purchase } = await seedBooks();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await createBookVoucher(client, TENANT, {
        voucherType: 'purchase',
        voucherDate: '2025-06-01',
        voucherNumber: 'PU/101',
        partyLedgerId: party,
        contraLedgerId: purchase,
        amount: 1180,
        narration: 'Books purchase with GST',
        entries: [
          { ledgerId: purchase, debit: 1180, credit: 0 },
          { ledgerId: party, debit: 0, credit: 1180 },
        ],
      });
      // Books-only invoice not in 2B
      await createBookVoucher(client, TENANT, {
        voucherType: 'purchase',
        voucherDate: '2025-06-02',
        voucherNumber: 'PU/999',
        partyLedgerId: party,
        contraLedgerId: purchase,
        amount: 500,
        narration: 'Not on 2B',
        entries: [
          { ledgerId: purchase, debit: 500, credit: 0 },
          { ledgerId: party, debit: 0, credit: 500 },
        ],
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const supplierId = uid('SU');
    await pool.query(
      `INSERT INTO suppliers (id, tenant_id, name, gst_number)
       VALUES ($1,$2,'Ops Supplier','27BBBBB1111B1Z5')`,
      [supplierId, TENANT],
    );
    const productId = uid('PR');
    await pool.query(`INSERT INTO products (id, tenant_id, name) VALUES ($1,$2,'Widget')`, [productId, TENANT]);
    await pool.query(
      `INSERT INTO product_purchases
         (id, tenant_id, batch_id, product_id, supplier_id, purchase_date, cost_price, gst_applied, billed_price, discount_percent, invoice_number, barcode)
       VALUES ($1,$2,'ops-batch-1',$3,$4,'2025-06-03',200,false,200,0,'OPS/1','BC-OPS-1')`,
      [uid('PP'), TENANT, productId, supplierId],
    );

    const client2 = await pool.connect();
    try {
      await client2.query('BEGIN');
      await createBookVoucher(client2, TENANT, {
        voucherType: 'purchase',
        voucherDate: '2025-06-04',
        voucherNumber: 'PU/MIS',
        partyLedgerId: party,
        contraLedgerId: purchase,
        amount: 100,
        narration: 'Mismatch amount',
        entries: [
          { ledgerId: purchase, debit: 100, credit: 0 },
          { ledgerId: party, debit: 0, credit: 100 },
        ],
      });
      await client2.query('COMMIT');
    } catch (e) {
      await client2.query('ROLLBACK');
      throw e;
    } finally {
      client2.release();
    }

    const twoB = {
      b2b: [
        {
          ctin: '24AAAAA0000A1Z5',
          trdnm: 'SUPPLIER BOOKS',
          inv: [
            { inum: 'PU/101', dt: '01-06-2025', val: 1180, itcavl: 'Y' },
            { inum: 'PU/77', dt: '05-06-2025', val: 300, itcavl: 'Y' },
            { inum: 'PU/MIS', dt: '04-06-2025', val: 250, itcavl: 'Y' },
          ],
        },
        {
          ctin: '27BBBBB1111B1Z5',
          trdnm: 'Ops Supplier',
          inv: [{ inum: 'OPS/1', dt: '03-06-2025', val: 200, itcavl: 'Y' }],
        },
      ],
    };

    const result = await reconcileGstr2b(pool, TENANT, twoB);

    const byInv = (inum: string) =>
      result.rows.find(r => normalizeGstr2bKeyPart(r.invoiceNumber) === normalizeGstr2bKeyPart(inum));

    expect(byInv('PU/101')?.status).toBe('matched');
    expect(byInv('PU/101')?.source).toBe('books');
    expect(byInv('PU/101')?.bookVal).toBe(1180);

    expect(byInv('OPS/1')?.status).toBe('matched');
    expect(byInv('OPS/1')?.source).toBe('ops');

    expect(byInv('PU/MIS')?.status).toBe('amount_mismatch');
    expect(byInv('PU/MIS')?.diff).toBe(150);

    expect(byInv('PU/77')?.status).toBe('twob_only');
    expect(byInv('PU/999')?.status).toBe('book_only');
    expect(byInv('PU/999')?.source).toBe('books');

    expect(result.stats.matched).toBeGreaterThanOrEqual(2);
    expect(result.stats.twob_only).toBeGreaterThanOrEqual(1);
    expect(result.stats.book_only).toBeGreaterThanOrEqual(1);
    expect(result.stats.amount_mismatch).toBeGreaterThanOrEqual(1);
  });

  it('dedupes dual-written ops+Books purchase under source both', async () => {
    await cleanupTestData(TENANT);
    const { party, purchase } = await seedBooks();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await createBookVoucher(client, TENANT, {
        voucherType: 'purchase',
        voucherDate: '2025-07-01',
        voucherNumber: 'DUAL/1',
        partyLedgerId: party,
        contraLedgerId: purchase,
        amount: 1180,
        narration: 'Dual write books side',
        entries: [
          { ledgerId: purchase, debit: 1180, credit: 0 },
          { ledgerId: party, debit: 0, credit: 1180 },
        ],
      });
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const supplierId = uid('SU');
    await pool.query(
      `INSERT INTO suppliers (id, tenant_id, name, gst_number)
       VALUES ($1,$2,'SUPPLIER BOOKS','24AAAAA0000A1Z5')`,
      [supplierId, TENANT],
    );
    const productId = uid('PR');
    await pool.query(`INSERT INTO products (id, tenant_id, name) VALUES ($1,$2,'Bolt')`, [productId, TENANT]);
    // Ops billed sum differs slightly; Books amount should win for bookVal
    await pool.query(
      `INSERT INTO product_purchases
         (id, tenant_id, batch_id, product_id, supplier_id, purchase_date, cost_price, gst_applied, billed_price, discount_percent, invoice_number, barcode)
       VALUES ($1,$2,'miracle:pur:DUAL',$3,$4,'2025-07-01',1000,false,1000,0,'DUAL/1','BC-DUAL-1')`,
      [uid('PP'), TENANT, productId, supplierId],
    );

    const result = await reconcileGstr2b(pool, TENANT, {
      docdata: {
        b2b: [
          {
            ctin: '24AAAAA0000A1Z5',
            trdnm: 'SUPPLIER BOOKS',
            inv: [{ inum: 'DUAL/1', dt: '01-07-2025', val: 1180, itcavl: 'Y' }],
          },
        ],
      },
    });

    const row = result.rows.find(r => normalizeGstr2bKeyPart(r.invoiceNumber) === 'DUAL1');
    expect(row?.status).toBe('matched');
    expect(row?.source).toBe('both');
    expect(row?.bookVal).toBe(1180);
    expect(result.rows.filter(r => normalizeGstr2bKeyPart(r.invoiceNumber) === 'DUAL1')).toHaveLength(1);
  });

  it('rejects JSON without B2B data', async () => {
    await expect(reconcileGstr2b(pool, TENANT, {})).rejects.toThrow(/No B2B data/);
  });
});
