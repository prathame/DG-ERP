import { describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import {
  isSalaryLikeLedgerName,
  staffNameFromSalaryVoucher,
  syncBooksSalaryToStaff,
} from '../../server/services/booksSalaryToStaff';
import { booksDeskHasData, sumBooksExpenses, sumTenantExpenses } from '../../server/services/booksExpenses';

function mockPool(impl: (sql: string, params: unknown[]) => { rows: unknown[] }): Pool {
  return {
    query: vi.fn(async (sql: string, params: unknown[] = []) => impl(sql, params)),
  } as unknown as Pool;
}

describe('booksSalaryToStaff helpers', () => {
  it('detects salary-like ledger names', () => {
    expect(isSalaryLikeLedgerName('SALARY EXP')).toBe(true);
    expect(isSalaryLikeLedgerName('DESIGNER SALARY')).toBe(true);
    expect(isSalaryLikeLedgerName('Staff Wages')).toBe(true);
    expect(isSalaryLikeLedgerName('Daily wage account')).toBe(true);
    expect(isSalaryLikeLedgerName('Rent')).toBe(false);
    expect(isSalaryLikeLedgerName(null)).toBe(false);
    expect(isSalaryLikeLedgerName('')).toBe(false);
  });

  it('prefers narration, then ledger, then dash', () => {
    expect(staffNameFromSalaryVoucher('  Ramesh  ', 'SALARY EXP')).toBe('Ramesh');
    expect(staffNameFromSalaryVoucher('', 'DESIGNER SALARY')).toBe('DESIGNER SALARY');
    expect(staffNameFromSalaryVoucher(null, '')).toBe('—');
    expect(staffNameFromSalaryVoucher('x'.repeat(200), 'L')).toHaveLength(120);
  });
});

describe('syncBooksSalaryToStaff', () => {
  it('upserts staff member + payment from Books salary vouchers', async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const pool = mockPool((sql, params) => {
      calls.push({ sql, params });
      if (sql.includes('book_vouchers')) {
        return {
          rows: [
            {
              voucher_id: 'BV1',
              external_ref: 'miracle:1',
              voucher_date: '2025-06-10',
              voucher_number: 'P-1',
              amount: 8000,
              narration: null,
              ledger_name: 'DESIGNER SALARY',
              payment_method: 'Cash',
            },
            {
              voucher_id: 'BV0',
              amount: 0,
              ledger_name: 'SALARY EXP',
              narration: null,
              voucher_date: '2025-01-01',
            },
          ],
        };
      }
      if (sql.includes('staff_members') && sql.includes('SELECT')) {
        return { rows: [] };
      }
      return { rows: [] };
    });

    const result = await syncBooksSalaryToStaff(pool, 'T1');
    expect(result.synced).toBe(1);
    expect(calls.some(c => c.sql.includes('INSERT INTO staff_members'))).toBe(true);
    expect(calls.some(c => c.sql.includes('INSERT INTO staff_payments'))).toBe(true);
    const pay = calls.find(c => c.sql.includes('INSERT INTO staff_payments'))!;
    expect(pay.params[0]).toBe('SPbk-BV1');
    expect(pay.params[2]).toBe('DESIGNER SALARY');
    expect(pay.params[3]).toBe(8000);
    expect(pay.params[7]).toBe('books:BV1');
  });

  it('skips creating staff when member already exists and accepts Date voucher_date', async () => {
    const pool = mockPool(sql => {
      if (sql.includes('book_vouchers')) {
        return {
          rows: [
            {
              voucher_id: 'BV2',
              amount: 17000,
              narration: 'April pay',
              ledger_name: 'SALARY EXP',
              voucher_date: new Date('2025-04-09T00:00:00.000Z'),
              payment_method: 'Bank Transfer',
              external_ref: 'CP1',
            },
          ],
        };
      }
      if (sql.includes('staff_members') && sql.includes('SELECT')) {
        return { rows: [{ id: 'STF1' }] };
      }
      return { rows: [] };
    });
    const result = await syncBooksSalaryToStaff(pool, 'T1');
    expect(result.synced).toBe(1);
    const inserts = (pool.query as ReturnType<typeof vi.fn>).mock.calls.filter((c: unknown[]) =>
      String(c[0]).includes('INSERT INTO staff_members'),
    );
    expect(inserts).toHaveLength(0);
  });
});

describe('booksExpenses', () => {
  it('booksDeskHasData is true when ledgers or vouchers exist', async () => {
    expect(
      await booksDeskHasData(
        mockPool(() => ({ rows: [{ ledgers: 2, vouchers: 0 }] })),
        'T1',
      ),
    ).toBe(true);
    expect(
      await booksDeskHasData(
        mockPool(() => ({ rows: [{ ledgers: 0, vouchers: 0 }] })),
        'T1',
      ),
    ).toBe(false);
  });

  it('sumBooksExpenses applies optional date filters', async () => {
    const pool = mockPool((_sql, params) => {
      expect(params[0]).toBe('T1');
      expect(params).toContain('2025-04-01');
      expect(params).toContain('2026-03-31');
      return { rows: [{ v: 9335469 }] };
    });
    expect(await sumBooksExpenses(pool, 'T1', '2025-04-01', '2026-03-31')).toBe(9335469);
  });

  it('sumTenantExpenses uses Books when desk has data, else ops expenses', async () => {
    const booksPool = mockPool(sql => {
      if (sql.includes('SELECT COUNT(*)') || sql.includes('book_ledgers WHERE tenant_id')) {
        return { rows: [{ ledgers: 10, vouchers: 5 }] };
      }
      if (sql.includes('SUM(amount)') || sql.includes('books_exp')) {
        return { rows: [{ v: 100 }] };
      }
      return { rows: [{ v: 0 }] };
    });
    expect(await sumTenantExpenses(booksPool, 'T1', '2025-01-01', null)).toBe(100);

    let sawOps = false;
    const opsPool = mockPool(sql => {
      if (sql.includes('(SELECT COUNT(*)::int FROM book_ledgers')) {
        return { rows: [{ ledgers: 0, vouchers: 0 }] };
      }
      if (sql.includes('FROM expenses')) {
        sawOps = true;
        return { rows: [{ v: 42 }] };
      }
      return { rows: [{ v: 0 }] };
    });
    expect(await sumTenantExpenses(opsPool, 'T1', '2025-01-01', '2025-12-31')).toBe(42);
    expect(sawOps).toBe(true);
  });
});
