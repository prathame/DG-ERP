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
