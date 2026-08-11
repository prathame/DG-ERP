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
