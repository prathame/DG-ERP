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
