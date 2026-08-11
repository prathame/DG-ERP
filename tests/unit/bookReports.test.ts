import { describe, expect, it } from 'vitest';
import {
  buildStatementLines,
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
});
