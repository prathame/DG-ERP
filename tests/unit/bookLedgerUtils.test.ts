import { describe, expect, it } from 'vitest';
import {
  isCashBankLedger,
  isPurchaseAccountLedger,
  isSalesIncomeLedger,
  twoLineJournalEntries,
} from '../../src/features/books/bookLedgerUtils';

describe('isCashBankLedger', () => {
  it('detects Miracle CS/BK/BN types', () => {
    expect(isCashBankLedger({ ledgerType: 'CS', name: 'Petty' })).toBe(true);
    expect(isCashBankLedger({ ledgerType: 'BK', name: 'HDFC' })).toBe(true);
    expect(isCashBankLedger({ ledgerType: 'BN', name: 'SBI' })).toBe(true);
  });

  it('detects cash/bank from name or group', () => {
    expect(isCashBankLedger({ name: 'Cash in hand', ledgerType: 'GL' })).toBe(true);
    expect(isCashBankLedger({ name: 'Current', groupName: 'Bank Accounts' })).toBe(true);
  });

  it('rejects ordinary party ledgers', () => {
    expect(isCashBankLedger({ ledgerType: 'PR', name: 'ACME TRADERS' })).toBe(false);
    expect(isCashBankLedger({ ledgerType: 'IN', name: 'Sales' })).toBe(false);
  });
});

describe('isSalesIncomeLedger / isPurchaseAccountLedger', () => {
  it('detects sales income types and names', () => {
    expect(isSalesIncomeLedger({ ledgerType: 'IN', name: 'Sales' })).toBe(true);
    expect(isSalesIncomeLedger({ ledgerType: 'TS', name: 'Trading' })).toBe(true);
    expect(isSalesIncomeLedger({ name: 'Service Income', ledgerType: 'GL' })).toBe(true);
  });

  it('detects purchase account types and names', () => {
    expect(isPurchaseAccountLedger({ ledgerType: 'PU', name: 'Purchase' })).toBe(true);
    expect(isPurchaseAccountLedger({ ledgerType: 'EX', name: 'Expense' })).toBe(true);
    expect(isPurchaseAccountLedger({ name: 'Goods Purchase', ledgerType: 'GL' })).toBe(true);
  });

  it('does not confuse sales with purchase', () => {
    expect(isSalesIncomeLedger({ ledgerType: 'PU', name: 'Purchase' })).toBe(false);
    expect(isPurchaseAccountLedger({ ledgerType: 'IN', name: 'Sales' })).toBe(false);
  });
});

describe('twoLineJournalEntries', () => {
  it('builds balanced Dr/Cr lines', () => {
    expect(twoLineJournalEntries('L-DR', 'L-CR', 250.5)).toEqual([
      { ledgerId: 'L-DR', debit: 250.5, credit: 0 },
      { ledgerId: 'L-CR', debit: 0, credit: 250.5 },
    ]);
  });
});
