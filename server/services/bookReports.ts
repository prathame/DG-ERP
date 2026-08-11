/**
 * Pure helpers for Books (CA) read models — ledger statement / trial balance building blocks.
 * Convention: signed balance = Debit − Credit (positive = Dr, negative = Cr).
 */

export type BalanceSide = 'D' | 'C' | null;

/** Normalize Miracle / stored opening into a signed amount (Dr positive, Cr negative). */
export function signedOpeningBalance(
  openingBalance: number | string | null | undefined,
  openingSide?: string | null,
): number {
  const raw = Number(openingBalance || 0);
  if (!raw && raw !== 0) return 0;
  const abs = Math.abs(raw);
  if (abs === 0) return 0;
  const side = String(openingSide || '')
    .trim()
    .toUpperCase();
  if (side === 'C' || side === 'CR' || side === 'CREDIT') return -abs;
  if (side === 'D' || side === 'DR' || side === 'DEBIT') return abs;
  // Trust signed FIELD10-style amounts when side is missing
  return raw;
}

export function splitDrCr(signed: number): { debit: number; credit: number; side: BalanceSide } {
  const n = Math.round((Number(signed) || 0) * 100) / 100;
  if (n > 0) return { debit: n, credit: 0, side: 'D' };
  if (n < 0) return { debit: 0, credit: Math.abs(n), side: 'C' };
  return { debit: 0, credit: 0, side: null };
}

export function formatBalanceLabel(signed: number): string {
  const { debit, credit, side } = splitDrCr(signed);
  if (!side) return '0.00';
  const amt = (side === 'D' ? debit : credit).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${amt} ${side === 'D' ? 'Dr' : 'Cr'}`;
}

export interface StatementLineInput {
  voucherId: string;
  voucherDate: string;
  voucherNumber: string | null;
  voucherType: string;
  narration: string | null;
  debit: number;
  credit: number;
}

export interface StatementLine extends StatementLineInput {
  balance: number;
  balanceSide: BalanceSide;
  balanceLabel: string;
}

/** Build running-balance lines from a starting signed balance. */
export function buildStatementLines(openingSigned: number, rows: StatementLineInput[]): StatementLine[] {
  let bal = Math.round((openingSigned || 0) * 100) / 100;
  return rows.map(r => {
    const debit = Math.round((Number(r.debit) || 0) * 100) / 100;
    const credit = Math.round((Number(r.credit) || 0) * 100) / 100;
    bal = Math.round((bal + debit - credit) * 100) / 100;
    const split = splitDrCr(bal);
    return {
      ...r,
      debit,
      credit,
      balance: bal,
      balanceSide: split.side,
      balanceLabel: formatBalanceLabel(bal),
    };
  });
}

/** Miracle FIELD04 / group-aware classification for CA statements. */
export type StatementClass = 'income' | 'expense' | 'asset' | 'liability' | 'capital' | 'trading' | 'other';

export function classifyLedger(
  nature?: string | null,
  ledgerType?: string | null,
  groupName?: string | null,
): StatementClass {
  const n = String(nature || '')
    .trim()
    .toUpperCase();
  const t = String(ledgerType || '')
    .trim()
    .toUpperCase();
  const g = String(groupName || '').toLowerCase();

  if (n === 'I' || n === 'INCOME') return 'income';
  if (n === 'E' || n === 'EXPENSE' || n === 'EXPENSES') return 'expense';
  if (n === 'T' || n === 'TRADING') return 'trading';
  if (n === 'L' || n === 'LIABILITY' || n === 'LIABILITIES') return 'liability';
  if (n === 'C' || n === 'CAPITAL') return 'capital';
  if (n === 'B' || n === 'A' || n === 'ASSET' || n === 'ASSETS') return 'asset';

  if (['IN', 'JP', 'TS'].includes(t)) return 'income';
  if (['EX', 'EP'].includes(t)) return 'expense';
  if (t === 'LI') return 'liability';
  if (['CS', 'BK', 'PR'].includes(t)) return 'asset';

  if (/\bincome\b|\bsales\b|\brevenue\b/.test(g)) return 'income';
  if (/\bexpense|\bpurchase|\bdirect exp|\bindirect/.test(g)) return 'expense';
  if (/\bliabilit|\bpayable|\bloan\b|\bcreditor/.test(g)) return 'liability';
  if (/\bcapital|\breserve|\bsurplus/.test(g)) return 'capital';
  if (/\basset|\bdebtor|\bbank|\bcash|\bstock|\bcurrent asset/.test(g)) return 'asset';

  return 'other';
}

export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

export interface TrialBalanceLedgerRow {
  ledgerId: string;
  name: string;
  groupName: string | null;
  nature: string | null;
  ledgerType: string | null;
  statementClass: StatementClass;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
  closingBalance: number;
  closingSide: BalanceSide;
}

export function buildTrialBalanceRow(input: {
  ledgerId: string;
  name: string;
  groupName?: string | null;
  nature?: string | null;
  ledgerType?: string | null;
  openingBalance: number;
  openingSide?: string | null;
  priorDebit: number;
  priorCredit: number;
  periodDebit: number;
  periodCredit: number;
}): TrialBalanceLedgerRow {
  const bookOpen = signedOpeningBalance(input.openingBalance, input.openingSide);
  const openingSigned = round2(bookOpen + Number(input.priorDebit || 0) - Number(input.priorCredit || 0));
  const periodDebit = round2(input.periodDebit);
  const periodCredit = round2(input.periodCredit);
  const closingSigned = round2(openingSigned + periodDebit - periodCredit);
  const opening = splitDrCr(openingSigned);
  const closing = splitDrCr(closingSigned);
  return {
    ledgerId: input.ledgerId,
    name: input.name,
    groupName: input.groupName || null,
    nature: input.nature || null,
    ledgerType: input.ledgerType || null,
    statementClass: classifyLedger(input.nature, input.ledgerType, input.groupName),
    openingDebit: opening.debit,
    openingCredit: opening.credit,
    periodDebit,
    periodCredit,
    closingDebit: closing.debit,
    closingCredit: closing.credit,
    closingBalance: closingSigned,
    closingSide: closing.side,
  };
}
