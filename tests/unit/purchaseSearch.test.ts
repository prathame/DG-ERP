import { describe, expect, it } from 'vitest';
import { supplierMatchesPurchaseSearch } from '../../src/lib/purchaseSearch';

const bills = [
  { invoiceNumber: 'INV-104', productNames: ['Urea 45kg'] },
  { invoiceNumber: 'SI/25-26/0002', productNames: ['DAP'] },
];

describe('supplierMatchesPurchaseSearch', () => {
  it('matches supplier name', () => {
    expect(supplierMatchesPurchaseSearch('GSFC Vadodara', bills, 'gsfc')).toBe(true);
  });

  it('matches bill / invoice number', () => {
    expect(supplierMatchesPurchaseSearch('GSFC Vadodara', bills, 'inv-104')).toBe(true);
  });

  it('matches a product on a bill', () => {
    expect(supplierMatchesPurchaseSearch('GSFC Vadodara', bills, 'urea')).toBe(true);
  });

  it('rejects unrelated text', () => {
    expect(supplierMatchesPurchaseSearch('GSFC Vadodara', bills, 'kisan')).toBe(false);
  });

  it('treats blank search as match-all', () => {
    expect(supplierMatchesPurchaseSearch('GSFC Vadodara', bills, '  ')).toBe(true);
  });
});
