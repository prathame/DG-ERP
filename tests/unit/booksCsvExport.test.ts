import { describe, expect, it } from 'vitest';
import {
  balanceSheetCsv,
  dayBookCsv,
  fundBookCsv,
  profitLossCsv,
  tradeRegisterCsv,
  tradingAccountCsv,
  trialBalanceCsv,
} from '../../server/services/booksCsvExport';

describe('booksCsvExport', () => {
  it('trialBalanceCsv includes headers, ledger rows, and totals', () => {
    const csv = trialBalanceCsv({
      from: '2025-04-01',
      to: '2026-03-31',
      balanced: true,
      count: 1,
      rows: [
        {
          ledgerId: 'L1',
          name: 'Cash Account',
          groupName: 'Assets',
          openingDebit: 1000,
          openingCredit: 0,
          periodDebit: 500,
          periodCredit: 200,
          closingDebit: 1300,
          closingCredit: 0,
        },
      ],
      totals: {
        openingDebit: 1000,
        openingCredit: 0,
        periodDebit: 500,
        periodCredit: 200,
        closingDebit: 1300,
        closingCredit: 0,
      },
    });
    expect(csv).toContain('"Ledger"');
    expect(csv).toContain('Opening Dr');
    expect(csv).toContain('"Cash Account"');
    expect(csv).toContain('"TOTALS"');
    expect(csv).toContain('1300.00');
  });

  it('profitLossCsv lists income, expenses, and net line', () => {
    const csv = profitLossCsv({
      from: '2025-04-01',
      to: '2026-03-31',
      income: [{ name: 'Sales', groupName: 'Income', amount: 10000, statementClass: 'income' }],
      expenses: [{ name: 'Rent', groupName: 'Expense', amount: 2000, statementClass: 'expense' }],
      totalIncome: 10000,
      totalExpenses: 2000,
      netProfit: 8000,
      netLabel: 'Net profit',
    });
    expect(csv).toContain('INCOME');
    expect(csv).toContain('"Sales"');
    expect(csv).toContain('EXPENSES');
    expect(csv).toContain('"Rent"');
    expect(csv).toContain('Net profit');
    expect(csv).toContain('8000.00');
  });

  it('tradingAccountCsv includes debit, credit, and gross profit', () => {
    const csv = tradingAccountCsv({
      from: '2025-04-01',
      to: '2026-03-31',
      debit: [{ name: 'Purchases', groupName: 'Trading', amount: 3000, kind: 'purchase' }],
      credit: [{ name: 'Sales', groupName: 'Trading', amount: 5000, kind: 'sales' }],
      totalDebit: 3000,
      totalCredit: 5000,
      grossProfit: 2000,
      grossLabel: 'Gross profit',
    });
    expect(csv).toContain('DEBIT');
    expect(csv).toContain('CREDIT');
    expect(csv).toContain('Gross profit');
  });

  it('balanceSheetCsv includes assets, liabilities, and capital sections', () => {
    const csv = balanceSheetCsv({
      asOf: '2026-03-31',
      assets: [{ name: 'Cash', amount: 5000 }],
      liabilities: [{ name: 'Loan', amount: 1000 }],
      capital: [{ name: 'Capital', amount: 4000 }],
      totalAssets: 5000,
      totalLiabilities: 1000,
      totalCapital: 4000,
      totalLiabilitiesAndCapital: 5000,
      netProfit: 0,
      balanced: true,
      difference: 0,
    });
    expect(csv).toContain('ASSETS');
    expect(csv).toContain('"Cash"');
    expect(csv).toContain('LIABILITIES');
    expect(csv).toContain('CAPITAL');
  });

  it('dayBookCsv escapes commas in narration', () => {
    const csv = dayBookCsv([
      {
        date: '2026-03-15',
        voucherNumber: 'RV-1',
        voucherType: 'receipt',
        ledgerName: 'Cash',
        debit: 100,
        credit: 0,
        narration: 'Party A, advance',
      },
    ]);
    expect(csv).toContain('Party A, advance');
    expect(csv).toContain('100.00');
  });

  it('tradeRegisterCsv maps register rows', () => {
    const csv = tradeRegisterCsv({
      kind: 'sales',
      from: '2025-04-01',
      to: '2026-03-31',
      rows: [
        {
          voucherId: 'V1',
          date: '2026-03-01',
          voucherNumber: 'S-1',
          voucherType: 'sales',
          partyName: 'Buyer',
          contraName: 'Sales',
          amount: 1180,
          taxable: 1000,
          cgst: 90,
          sgst: 90,
          igst: 0,
          narration: null,
          externalRef: null,
        },
      ],
      totals: { count: 1, amount: 1180, taxable: 1000, cgst: 90, sgst: 90, igst: 0 },
    });
    expect(csv).toContain('"Buyer"');
    expect(csv).toContain('1180.00');
  });

  it('fundBookCsv uses fund book lines', () => {
    const csv = fundBookCsv({
      kind: 'cash',
      accounts: [],
      ledger: null,
      from: '2025-04-01',
      to: '2026-03-31',
      opening: { debit: 0, credit: 0, balance: 0, balanceSide: null, balanceLabel: '0.00' },
      closing: { debit: 0, credit: 0, balance: 100, balanceSide: 'D', balanceLabel: '100.00' },
      totals: { debit: 100, credit: 0 },
      lines: [
        {
          voucherId: 'V1',
          date: '2026-03-01',
          voucherNumber: 'R-1',
          voucherType: 'receipt',
          particulars: 'Party',
          narration: null,
          debit: 100,
          credit: 0,
          balance: 100,
          balanceSide: 'D',
          balanceLabel: '100.00',
        },
      ],
    });
    expect(csv).toContain('"Party"');
    expect(csv).toContain('100.00');
  });
});
