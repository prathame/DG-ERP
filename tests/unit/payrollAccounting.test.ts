import { describe, expect, it } from 'vitest';
import { buildStaffPaymentBookPosting } from '../../server/services/opsToBooks';

describe('staff payment Books posting', () => {
  it('posts salary as expense debit and cash credit', () => {
    const posting = buildStaffPaymentBookPosting('salary', 1250.456, 'SALARY', 'CASH');

    expect(posting).toMatchObject({
      amount: 1250.46,
      category: 'Staff Salary',
      partyLedgerId: 'SALARY',
      contraLedgerId: 'CASH',
    });
    expect(posting.entries).toEqual([
      { ledgerId: 'SALARY', debit: 1250.46, credit: 0 },
      { ledgerId: 'CASH', debit: 0, credit: 1250.46 },
    ]);
  });

  it('posts advance repayment as cash debit and staff advance credit', () => {
    const posting = buildStaffPaymentBookPosting('advance_repay', 5000, 'STAFF_ADVANCE', 'BANK');

    expect(posting).toMatchObject({
      amount: 5000,
      category: 'Staff Advance',
      partyLedgerId: 'BANK',
      contraLedgerId: 'STAFF_ADVANCE',
    });
    expect(posting.entries).toEqual([
      { ledgerId: 'BANK', debit: 5000, credit: 0 },
      { ledgerId: 'STAFF_ADVANCE', debit: 0, credit: 5000 },
    ]);
  });
});
