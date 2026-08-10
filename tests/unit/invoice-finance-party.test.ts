import { describe, it, expect } from 'vitest';
import { mergeServiceVendorAdvances, parsePartyKey } from '../../server/routes/invoice-finance';

describe('parsePartyKey', () => {
  it('parses vendor and customer keys', () => {
    expect(parsePartyKey('vendor:V-1')).toEqual({
      partyType: 'vendor',
      partyId: 'V-1',
      clientName: null,
      partyKey: 'vendor:V-1',
    });
    expect(parsePartyKey('customer:C-9')).toEqual({
      partyType: 'customer',
      partyId: 'C-9',
      clientName: null,
      partyKey: 'customer:C-9',
    });
  });

  it('supports URL-encoded keys', () => {
    expect(parsePartyKey(encodeURIComponent('vendor:V 1')).partyId).toBe('V 1');
  });

  it('treats plain names and name: prefix as legacy', () => {
    expect(parsePartyKey('Acme Corp')).toEqual({
      partyType: null,
      partyId: null,
      clientName: 'Acme Corp',
      partyKey: 'name:Acme Corp',
    });
    expect(parsePartyKey('name:Acme Corp').partyKey).toBe('name:Acme Corp');
  });

  it('rejects empty party id after type prefix', () => {
    expect(parsePartyKey('vendor:')).toEqual({
      partyType: null,
      partyId: null,
      clientName: '',
      partyKey: 'name:',
    });
  });
});

describe('mergeServiceVendorAdvances', () => {
  it('merges vendor_payments as advances for service vendors only', () => {
    const result = mergeServiceVendorAdvances({
      businessType: 'service',
      partyType: 'vendor',
      totalInvoiced: 0,
      invoicePaid: 0,
      invoicePayments: [],
      vendorPayments: [
        {
          id: 'VP1',
          amount: 10000,
          payment_date: '2025-06-01',
          payment_method: 'Cash',
          notes: 'Miracle payment',
        },
        {
          id: 'VP2',
          amount: 20000,
          payment_date: '2025-07-01',
          payment_method: 'Cash',
        },
      ],
    });
    expect(result.advanceBalance).toBe(30000);
    expect(result.totalPaid).toBe(30000);
    expect(result.balance).toBe(-30000);
    expect(result.payments).toHaveLength(2);
    expect(result.payments.every(p => p.isAdvance)).toBe(true);
  });

  it('does not merge for dealer / manufacturer', () => {
    const result = mergeServiceVendorAdvances({
      businessType: 'dealer',
      partyType: 'vendor',
      totalInvoiced: 0,
      invoicePaid: 0,
      invoicePayments: [],
      vendorPayments: [{ id: 'VP1', amount: 5000, payment_date: '2025-01-01' }],
    });
    expect(result.totalPaid).toBe(0);
    expect(result.advanceBalance).toBe(0);
    expect(result.payments).toHaveLength(0);
  });

  it('adds advances on top of invoice payments for service', () => {
    const result = mergeServiceVendorAdvances({
      businessType: 'service',
      partyType: 'vendor',
      totalInvoiced: 100000,
      invoicePaid: 40000,
      invoicePayments: [
        {
          id: 'IP1',
          invoiceId: 'INV1',
          invoiceNumber: 'GT/1',
          amount: 40000,
          paymentDate: '2025-05-01',
          paymentMethod: 'Cash',
          isAdvance: false,
        },
      ],
      vendorPayments: [{ id: 'VP1', amount: 5000, payment_date: '2025-08-01', payment_method: 'Cash' }],
    });
    expect(result.totalPaid).toBe(45000);
    expect(result.balance).toBe(55000);
    expect(result.payments).toHaveLength(2);
    expect(result.payments[0]?.id).toBe('VP1'); // newer date first
  });
});
