import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { getProductLedger, getBooksStockSummary, stockQtySign } from '../../server/services/bookProductLedger';

const TENANT = 'T-TEST-BOOK-PRODUCT-LEDGER';

describe('bookProductLedger', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Book Product Ledger',$2,'bpl@test.com','BPL','active','dealer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `bpl-${TENANT.toLowerCase()}`],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('maps voucher types to stock in/out signs', () => {
    expect(stockQtySign('purchase')).toBe(1);
    expect(stockQtySign('credit_note')).toBe(1);
    expect(stockQtySign('CREDIT_NOTE')).toBe(1);
    expect(stockQtySign('sales')).toBe(-1);
    expect(stockQtySign('purchase_return')).toBe(-1);
    expect(stockQtySign('debit_note')).toBe(-1);
    expect(stockQtySign('receipt')).toBe(0);
    expect(stockQtySign('')).toBe(0);
  });

  it('returns null for unknown product and supports open date range', async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Book Product Ledger',$2,'bpl@test.com','BPL','active','dealer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `bpl-${TENANT.toLowerCase()}`],
    );
    expect(await getProductLedger(pool, TENANT, 'missing', null, null)).toBeNull();

    const fy = uid('BF');
    const g = uid('BG');
    const party = uid('BL');
    const product = uid('BP');
    const cn = uid('BV');
    const pr = uid('BV');
    const dn = uid('BV');
    const junk = uid('BV');

    await pool.query(
      `INSERT INTO book_financial_years (id, tenant_id, code, label, is_active, external_ref)
       VALUES ($1,$2,'YR25','FY 2025-26',true,'YR25')
       ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true`,
      [fy, TENANT],
    );
    await pool.query(
      `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref) VALUES ($1,$2,'Trading','A','G-TR2')`,
      [g, TENANT],
    );
    await pool.query(
      `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
       VALUES ($1,$2,'Party',$3,'A','PR',0,'L-PARTY2')`,
      [party, TENANT, g],
    );
    await pool.query(
      `INSERT INTO book_products (id, tenant_id, name, sale_rate, purchase_rate, external_ref)
       VALUES ($1,$2,'Bare Item',0,0,'P-BARE')`,
      [product, TENANT],
    );
    await pool.query(
      `INSERT INTO book_vouchers
         (id, tenant_id, financial_year_id, voucher_type, voucher_date, voucher_number,
          party_ledger_id, amount, narration, external_ref)
       VALUES
         ($1,$5,$6,'credit_note','2025-07-01','CN/1',$7,100,'ret',$8),
         ($2,$5,$6,'purchase_return','2025-07-02','PR/1',$7,50,'pret',$9),
         ($3,$5,$6,'debit_note','2025-07-03','DN/1',$7,25,'dn',$10),
         ($4,$5,$6,'receipt','2025-07-04','CR/1',$7,10,'cash',$11)`,
      [cn, pr, dn, junk, TENANT, fy, party, `manual:${cn}`, `manual:${pr}`, `manual:${dn}`, `manual:${junk}`],
    );
    await pool.query(
      `INSERT INTO book_voucher_items
         (id, tenant_id, voucher_id, line_no, product_id, qty, rate, amount, external_ref)
       VALUES
         ($1,$5,$6,1,$7,2,10,20,'a'),
         ($2,$5,$8,1,$7,1,10,10,'b'),
         ($3,$5,$9,1,$7,1,10,10,'c'),
         ($4,$5,$10,1,$7,9,1,9,'d')`,
      [uid('BI'), uid('BI'), uid('BI'), uid('BI'), TENANT, cn, product, pr, dn, junk],
    );

    // Prior ignored receipt + period with CN/PR/DN; no from/to → all lines except sign-0 receipt
    const open = await getProductLedger(pool, TENANT, product, null, null);
    expect(open!.product.code).toBeNull();
    expect(open!.product.unit).toBeNull();
    expect(open!.product.hsnCode).toBeNull();
    expect(open!.openingQty).toBe(0);
    expect(open!.lines.map(l => l.voucherType).sort()).toEqual(['credit_note', 'debit_note', 'purchase_return']);
    expect(open!.closingQty).toBe(0); // +2 -1 -1

    const priorIgnored = await getProductLedger(pool, TENANT, product, '2025-07-05', null);
    expect(priorIgnored!.openingQty).toBe(0);
    expect(priorIgnored!.lines).toHaveLength(0);

    const stockAll = await getBooksStockSummary(pool, TENANT, null);
    expect(stockAll.asOf).toBeNull();
    expect(stockAll.rows.find(r => r.productId === product)?.qty).toBe(0);
    expect(stockAll.totals.qty).toBe(0);
  });

  it('builds product ledger with opening, in/out, and stock summary', async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'Book Product Ledger',$2,'bpl@test.com','BPL','active','dealer')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `bpl-${TENANT.toLowerCase()}`],
    );

    const fy = uid('BF');
    const g = uid('BG');
    const party = uid('BL');
    const sales = uid('BL');
    const product = uid('BP');
    const purchaseV = uid('BV');
    const salesV = uid('BV');

    await pool.query(
      `INSERT INTO book_financial_years (id, tenant_id, code, label, is_active, external_ref)
       VALUES ($1,$2,'YR25','FY 2025-26',true,'YR25')
       ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true`,
      [fy, TENANT],
    );
    await pool.query(
      `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref)
       VALUES ($1,$2,'Trading','A','G-TR')`,
      [g, TENANT],
    );
    await pool.query(
      `INSERT INTO book_ledgers (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, external_ref)
       VALUES
         ($1,$3,'Party',$4,'A','PR',0,'L-PARTY'),
         ($2,$3,'Sales',$4,'I','IN',0,'L-SALES')`,
      [party, sales, TENANT, g],
    );
    await pool.query(
      `INSERT INTO book_products (id, tenant_id, name, unit, hsn_code, sale_rate, purchase_rate, external_ref)
       VALUES ($1,$2,'Gold Chain','gm','7113',5000,4500,'P-CHAIN')`,
      [product, TENANT],
    );
    await pool.query(
      `INSERT INTO book_vouchers
         (id, tenant_id, financial_year_id, voucher_type, voucher_date, voucher_number,
          party_ledger_id, contra_ledger_id, amount, narration, external_ref)
       VALUES
         ($1,$3,$4,'purchase','2025-05-01','PU/1',$5,$6,45000,'Buy',$7),
         ($2,$3,$4,'sales','2025-06-10','SE/1',$5,$6,25000,'Sell',$8)`,
      [purchaseV, salesV, TENANT, fy, party, sales, `manual:${purchaseV}`, `manual:${salesV}`],
    );

    await pool.query(
      `INSERT INTO book_voucher_items
         (id, tenant_id, voucher_id, line_no, product_id, qty, rate, amount, external_ref)
       VALUES
         ($1,$3,$4,1,$5,10,4500,45000,'i1'),
         ($2,$3,$6,1,$5,4,5000,20000,'i2')`,
      [uid('BI'), uid('BI'), TENANT, purchaseV, product, salesV],
    );

    const ledger = await getProductLedger(pool, TENANT, product, '2025-06-01', '2025-06-30');
    expect(ledger).not.toBeNull();
    expect(ledger!.openingQty).toBe(10);
    expect(ledger!.lines).toHaveLength(1);
    expect(ledger!.lines[0]).toMatchObject({ qtyIn: 0, qtyOut: 4, balanceQty: 6 });
    expect(ledger!.closingQty).toBe(6);

    const full = await getProductLedger(pool, TENANT, product, '2025-04-01', '2025-12-31');
    expect(full!.openingQty).toBe(0);
    expect(full!.totals.qtyIn).toBe(10);
    expect(full!.totals.qtyOut).toBe(4);
    expect(full!.closingQty).toBe(6);

    const stock = await getBooksStockSummary(pool, TENANT, '2025-06-30');
    const row = stock.rows.find(r => r.productId === product);
    expect(row?.qty).toBe(6);
  });
});
