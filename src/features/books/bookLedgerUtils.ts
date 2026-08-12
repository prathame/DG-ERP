/** Books ledger helpers for cash/bank fund detection (voucher desk + fund book). */

export type BookLedgerLike = {
  id?: string;
  name?: string;
  ledgerType?: string;
  groupName?: string;
};

/** True when ledger is a cash or bank fund (Miracle CS / BK / BN or name/group hint). */
export function isCashBankLedger(l: BookLedgerLike): boolean {
  const t = (l.ledgerType || '').toUpperCase();
  const g = `${l.groupName || ''} ${l.name || ''}`.toLowerCase();
  return t === 'CS' || t === 'BK' || t === 'BN' || /cash|bank/.test(g);
}

/** Sales / income ledger (Miracle IN / TS / JP or name/group hint). */
export function isSalesIncomeLedger(l: BookLedgerLike): boolean {
  const t = (l.ledgerType || '').toUpperCase();
  const g = `${l.groupName || ''} ${l.name || ''}`.toLowerCase();
  return t === 'IN' || t === 'TS' || t === 'JP' || /sales|income|revenue|return/.test(g);
}

/** Purchase / expense account (Miracle EX / PU / TP or name/group hint). */
export function isPurchaseAccountLedger(l: BookLedgerLike): boolean {
  const t = (l.ledgerType || '').toUpperCase();
  const g = `${l.groupName || ''} ${l.name || ''}`.toLowerCase();
  return t === 'EX' || t === 'PU' || t === 'TP' || /purchase|bought|expense/.test(g);
}

/** Balanced two-line journal for desk: Dr debitLedger / Cr creditLedger. */
export function twoLineJournalEntries(
  debitLedgerId: string,
  creditLedgerId: string,
  amount: number,
): Array<{ ledgerId: string; debit: number; credit: number }> {
  const amt = Math.round(Number(amount) * 100) / 100;
  return [
    { ledgerId: debitLedgerId, debit: amt, credit: 0 },
    { ledgerId: creditLedgerId, debit: 0, credit: amt },
  ];
}

export type DeskJournalLineInput = { ledgerId: string; debit: number; credit: number };

/** Normalize desk journal lines for POST /books/vouchers (drop empty ledgers). */
export function journalEntriesFromDeskLines(
  lines: Array<{ ledgerId: string; debit: string | number; credit: string | number }>,
): DeskJournalLineInput[] {
  return lines
    .filter(l => l.ledgerId)
    .map(l => ({
      ledgerId: l.ledgerId,
      debit: Math.round((Number(l.debit) || 0) * 100) / 100,
      credit: Math.round((Number(l.credit) || 0) * 100) / 100,
    }))
    .filter(l => l.debit > 0 || l.credit > 0);
}

/** Debit/credit totals and whether the journal balances. */
export function journalDeskTotals(lines: DeskJournalLineInput[]): {
  debit: number;
  credit: number;
  balanced: boolean;
} {
  const debit = Math.round(lines.reduce((s, l) => s + l.debit, 0) * 100) / 100;
  const credit = Math.round(lines.reduce((s, l) => s + l.credit, 0) * 100) / 100;
  return { debit, credit, balanced: debit > 0 && Math.abs(debit - credit) < 0.005 };
}
