import { describe, expect, it } from 'vitest';
import {
  buildStatementLines,
  buildTrialBalanceRow,
  classifyLedger,
  formatBalanceLabel,
  signedOpeningBalance,
  splitDrCr,
} from '../../server/services/bookReports';

describe('bookReports', () => {
  it('signedOpeningBalance respects Dr/Cr side over sign', () => {
    expect(signedOpeningBalance(1500, 'D')).toBe(1500);
    expect(signedOpeningBalance(-1500, 'D')).toBe(1500);
    expect(signedOpeningBalance(800, 'C')).toBe(-800);
    expect(signedOpeningBalance(-800, 'C')).toBe(-800);
    expect(signedOpeningBalance(-250, null)).toBe(-250);
    expect(signedOpeningBalance(0, 'D')).toBe(0);
  });

  it('splitDrCr and formatBalanceLabel', () => {
    expect(splitDrCr(120)).toEqual({ debit: 120, credit: 0, side: 'D' });
    expect(splitDrCr(-45.5)).toEqual({ debit: 0, credit: 45.5, side: 'C' });
    expect(formatBalanceLabel(1000)).toContain('Dr');
    expect(formatBalanceLabel(-250)).toContain('Cr');
  });

  it('buildStatementLines runs a Dr/Cr balance', () => {
    const lines = buildStatementLines(1000, [
      {
        voucherId: 'v1',
        voucherDate: '2025-04-02',
        voucherNumber: 'GT/1',
        voucherType: 'sales',
        narration: 'Sale',
        debit: 500,
        credit: 0,
      },
      {
        voucherId: 'v2',
        voucherDate: '2025-04-05',
        voucherNumber: 'CR/1',
        voucherType: 'receipt',
        narration: 'Receipt',
        debit: 0,
        credit: 1200,
      },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0].balance).toBe(1500);
    expect(lines[0].balanceSide).toBe('D');
    expect(lines[1].balance).toBe(300);
    expect(lines[1].balanceSide).toBe('D');
  });

  it('classifyLedger maps Miracle natures and group fallbacks', () => {
    expect(classifyLedger('I', 'IN', null)).toBe('income');
    expect(classifyLedger('B', 'PR', 'Sundry Debtors')).toBe('asset');
    expect(classifyLedger('L', 'LI', null)).toBe('liability');
    expect(classifyLedger('T', 'TS', null)).toBe('trading');
    expect(classifyLedger('E', 'EX', null)).toBe('expense');
    expect(classifyLedger('C', null, null)).toBe('capital');
    expect(classifyLedger(null, 'EX', null)).toBe('expense');
    expect(classifyLedger(null, null, 'Sales Income')).toBe('income');
    expect(classifyLedger(null, null, 'Purchase Expenses')).toBe('expense');
    expect(classifyLedger(null, null, 'Sundry Creditors')).toBe('liability');
    expect(classifyLedger(null, null, 'Duties & Taxes')).toBe('liability');
    expect(classifyLedger(null, null, 'Capital Account')).toBe('capital');
    expect(classifyLedger(null, null, 'Bank Accounts')).toBe('asset');
    expect(classifyLedger(null, null, 'Misc')).toBe('other');
  });

  it('buildTrialBalanceRow closes opening + period', () => {
    const row = buildTrialBalanceRow({
      ledgerId: 'L1',
      name: 'Party',
      nature: 'B',
      ledgerType: 'PR',
      openingBalance: 1000,
      openingSide: 'D',
      priorDebit: 0,
      priorCredit: 200,
      periodDebit: 500,
      periodCredit: 100,
    });
    expect(row.openingDebit).toBe(800);
    expect(row.periodDebit).toBe(500);
    expect(row.closingDebit).toBe(1200);
    expect(row.statementClass).toBe('asset');
  });
});
