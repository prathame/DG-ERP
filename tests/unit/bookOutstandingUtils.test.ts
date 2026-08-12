import { describe, expect, it } from 'vitest';
import { billsForParty, filterOpenBills, partiesWithOpenDues } from '../../src/features/books/bookOutstandingUtils';

describe('partiesWithOpenDues', () => {
  it('keeps positive balances and sorts by due desc', () => {
    const rows = partiesWithOpenDues([
      { partyKey: 'a', clientName: 'Alpha', balance: 100, invoiceCount: 1 },
      { partyKey: 'b', clientName: 'Beta', balance: 0, invoiceCount: 0 },
      { partyKey: 'c', clientName: 'Gamma', balance: 250.5, invoiceCount: 2 },
    ]);
    expect(rows.map(r => r.partyKey)).toEqual(['c', 'a']);
  });
});

describe('filterOpenBills / billsForParty', () => {
  const bills = [
    {
      partyKey: 'vendor:1',
      clientName: 'Acme',
      invoiceId: 'i1',
      invoiceNumber: 'GT/1',
      invoiceDate: '2026-04-01',
      balance: 50,
      grandTotal: 50,
      paid: 0,
    },
    {
      partyKey: 'vendor:2',
      clientName: 'Beta Co',
      invoiceId: 'i2',
      invoiceNumber: 'INV-9',
      invoiceDate: '2026-04-02',
      balance: 20,
      grandTotal: 100,
      paid: 80,
    },
  ];

  it('filters by party or bill number', () => {
    expect(filterOpenBills(bills, 'gt/').map(b => b.invoiceId)).toEqual(['i1']);
    expect(filterOpenBills(bills, 'beta').map(b => b.invoiceId)).toEqual(['i2']);
  });

  it('scopes bills to a party', () => {
    expect(billsForParty(bills, 'vendor:1')).toHaveLength(1);
    expect(billsForParty(bills, 'vendor:9')).toHaveLength(0);
  });
});
