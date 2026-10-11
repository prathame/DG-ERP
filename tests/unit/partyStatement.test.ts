import { describe, it, expect } from 'vitest';
import {
  buildPartyStatementDisplay,
  formatStatementDate,
  partyStatementFilename,
  renderPartyStatementHtml,
  type PartyStatementModel,
} from '../../shared/partyStatement';

describe('partyStatement', () => {
  const base: PartyStatementModel = {
    companyName: 'EXPERT LIGHT',
    partyName: 'PRAVINBHAI BUSHA',
    partyPhone: '9764057232',
    partyAddress: 'RAJKOT',
    from: '2026-04-01',
    to: '2027-03-31',
    openingSigned: 4277,
    debitLines: [
      { date: '2026-04-04', particular: 'Sale', amount: 820, billNo: 'EEL-2236' },
      { date: '2026-05-28', particular: 'Sale', amount: 1504, billNo: 'EEL-715' },
      { date: '2026-06-22', particular: 'Sale', amount: 1020, billNo: 'EEL-1044' },
      { date: '2026-08-29', particular: 'Sale', amount: 4000, billNo: 'EEL-2124' },
      { date: '2026-09-21', particular: 'Sale', amount: 33, billNo: 'EEL-2470' },
    ],
    creditLines: [
      { date: '2026-04-04', particular: 'CRct', amount: 820 },
      { date: '2026-06-27', particular: 'CRct', amount: 2524 },
      { date: '2026-08-27', particular: 'CRct', amount: 4277 },
    ],
    closingSigned: 0,
  };

  it('balances debit and credit columns like Miracle (opening + closing pad)', () => {
    const d = buildPartyStatementDisplay(base);
    expect(d.opening.side).toBe('debit');
    expect(d.opening.amount).toBe(4277);
    expect(d.closing.side).toBe('debit');
    expect(d.closing.amount).toBe(4033);
    expect(d.debitTotal).toBe(d.creditTotal);
    expect(d.debitTotal).toBe(11654);
    expect(d.creditColumn.some(r => r.label === 'DB Closing Balance')).toBe(true);
    expect(d.debitColumn.some(r => r.label === 'DB Opening Balance')).toBe(true);
  });

  it('handles credit opening (advance) with closing on debit column', () => {
    const d = buildPartyStatementDisplay({
      ...base,
      openingSigned: -500,
      debitLines: [{ date: '2026-05-01', particular: 'Sale', amount: 200, billNo: 'X-1' }],
      creditLines: [],
    });
    // opening -500 + 200 sales - 0 receipts = -300 credit closing
    expect(d.opening.side).toBe('credit');
    expect(d.closing.side).toBe('credit');
    expect(d.closing.amount).toBe(300);
    expect(d.debitTotal).toBe(d.creditTotal);
  });

  it('formats dates and filename like Miracle sample', () => {
    expect(formatStatementDate('2026-04-01')).toBe('01/04/2026');
    expect(partyStatementFilename('PRAVINBHAI BUSHA', '9764057232', '2026-04-01', '2027-03-31')).toBe(
      'PRAVINBHAIBUSHA-9764057232_PartyStatement_01-04-26_31-03-27.PDF',
    );
  });

  it('renders dual-column HTML with company and party', () => {
    const html = renderPartyStatementHtml(buildPartyStatementDisplay(base));
    expect(html).toContain('EXPERT LIGHT');
    expect(html).toContain('Account Statement For PRAVINBHAI BUSHA');
    expect(html).toContain('Debit Particulars');
    expect(html).toContain('Credit Particulars');
    expect(html).toContain('EEL-2236');
    expect(html).toContain('DB Closing Balance');
  });
});
