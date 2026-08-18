import { describe, expect, it } from 'vitest';
import {
  billsForParty,
  daysPastDue,
  filterOpenBills,
  outstandingAgeBucket,
  partiesWithOpenDues,
  summarizeArAging,
} from '../../src/features/books/bookOutstandingUtils';

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

describe('AR aging helpers', () => {
  const asOf = new Date(2026, 7, 16); // 16 Aug 2026

  it('daysPastDue and outstandingAgeBucket', () => {
    expect(daysPastDue('2026-08-10', asOf)).toBe(6);
    expect(outstandingAgeBucket(6)).toBe('0-30');
    expect(outstandingAgeBucket(45)).toBe('31-60');
    expect(outstandingAgeBucket(75)).toBe('61-90');
    expect(outstandingAgeBucket(100)).toBe('90+');
  });

  it('ages from dueDate when present (not invoice date)', () => {
    // Invoice 1 Jul, due 10 Aug → only 6 days past due on 16 Aug
    expect(daysPastDue('2026-08-01', asOf, '2026-08-10')).toBe(6);
    // Not yet due → 0
    expect(daysPastDue('2026-07-01', asOf, '2026-08-20')).toBe(0);
  });

  it('summarizeArAging buckets open balances', () => {
    const totals = summarizeArAging(
      [
        { invoiceDate: '2026-08-01', balance: 100 }, // 15d
        { invoiceDate: '2026-07-01', balance: 200 }, // 46d
        { invoiceDate: '2026-05-01', balance: 50 }, // 107d
        { invoiceDate: '2026-01-01', balance: 0 }, // ignored
      ],
      asOf,
    );
    expect(totals.d0_30).toBe(100);
    expect(totals.d31_60).toBe(200);
    expect(totals.d61_90).toBe(0);
    expect(totals.d90plus).toBe(50);
    expect(totals.total).toBe(350);
  });

  it('summarizeArAging prefers dueDate for buckets', () => {
    const totals = summarizeArAging(
      [
        // Old invoice but due recently → 0-30
        { invoiceDate: '2026-01-01', dueDate: '2026-08-10', balance: 100 },
        // Due long ago → 90+
        { invoiceDate: '2026-08-01', dueDate: '2026-04-01', balance: 50 },
      ],
      asOf,
    );
    expect(totals.d0_30).toBe(100);
    expect(totals.d90plus).toBe(50);
  });
});
