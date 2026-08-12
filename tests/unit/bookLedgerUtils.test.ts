import { describe, expect, it } from 'vitest';
import { isCashBankLedger } from '../../src/features/books/bookLedgerUtils';

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
