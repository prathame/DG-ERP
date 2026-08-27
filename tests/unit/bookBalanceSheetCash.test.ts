import { describe, expect, it } from 'vitest';
import {
  isCashInHandLedger,
  periodPnlCapitalPlug,
  placeBalanceSheetLine,
} from '../../server/services/bookFinancialStatements';

describe('isCashInHandLedger', () => {
  it('treats CS ledgers and Cash-in-Hand group as cash', () => {
    expect(isCashInHandLedger('CS', 'Assets')).toBe(true);
    expect(isCashInHandLedger('cs', 'whatever')).toBe(true);
    expect(isCashInHandLedger('LI', 'Cash-in-Hand')).toBe(true);
    expect(isCashInHandLedger('LI', 'Cash in Hand')).toBe(true);
  });

  it('does not treat bank or loans as cash', () => {
    expect(isCashInHandLedger('BK', 'Bank Accounts')).toBe(false);
    expect(isCashInHandLedger('LI', 'Loans')).toBe(false);
    expect(isCashInHandLedger(null, 'Sundry Creditors')).toBe(false);
  });
});

describe('placeBalanceSheetLine — cash stays an asset', () => {
  it('credit cash (expense from empty drawer) is a negative asset, not a liability', () => {
    const placed = placeBalanceSheetLine({
      statementClass: 'asset',
      ledgerType: 'CS',
      groupName: 'Cash-in-Hand',
      closingBalance: -500,
    });
    expect(placed).toEqual({ side: 'assets', amount: -500 });
  });

  it('debit cash stays a positive asset', () => {
    const placed = placeBalanceSheetLine({
      statementClass: 'asset',
      ledgerType: 'CS',
      groupName: 'Cash-in-Hand',
      closingBalance: 1754,
    });
    expect(placed).toEqual({ side: 'assets', amount: 1754 });
  });

  it('keeps cash on assets even if the ledger was tagged as a liability', () => {
    const placed = placeBalanceSheetLine({
      statementClass: 'liability',
      ledgerType: 'CS',
      groupName: 'Cash-in-Hand',
      closingBalance: -500,
    });
    expect(placed).toEqual({ side: 'assets', amount: -500 });
  });

  it('bank credit (overdraft) stays a liability', () => {
    const placed = placeBalanceSheetLine({
      statementClass: 'asset',
      ledgerType: 'BK',
      groupName: 'Bank Accounts',
      closingBalance: -2000,
    });
    expect(placed).toEqual({ side: 'liabilities', amount: 2000 });
  });

  it('supplier credit stays a liability', () => {
    const placed = placeBalanceSheetLine({
      statementClass: 'liability',
      ledgerType: 'LI',
      groupName: 'Sundry Creditors',
      closingBalance: -940,
    });
    expect(placed).toEqual({ side: 'liabilities', amount: 940 });
  });
});

describe('periodPnlCapitalPlug', () => {
  it('puts period net loss on capital as a negative amount', () => {
    expect(periodPnlCapitalPlug(-8694)).toEqual({
      name: 'Net loss (current period)',
      groupName: 'P&L',
      amount: -8694,
    });
  });

  it('puts period net profit on capital', () => {
    expect(periodPnlCapitalPlug(100)).toEqual({
      name: 'Net profit (current period)',
      groupName: 'P&L',
      amount: 100,
    });
  });
});
