import { describe, expect, it } from 'vitest';
import {
  CASH_ACCOUNT_NAME,
  ensureCashAccountVendor,
  findCashAccountVendor,
  isCashPartyName,
} from '../../src/lib/cashAccount';
import { generateStandaloneInvoiceHtml, generateDistributionChallanHtml } from '../../src/lib/billTemplates';

describe('cash account party', () => {
  it('matches Cash Account ignoring case and spaces', () => {
    expect(isCashPartyName('Cash Account')).toBe(true);
    expect(isCashPartyName('  cash account  ')).toBe(true);
    expect(isCashPartyName('Rajkot Accessories Supplier')).toBe(false);
    expect(isCashPartyName('')).toBe(false);
  });

  it('finds the cash party in a vendor list', () => {
    const vendors = [
      { id: '1', name: 'Walk-in' },
      { id: '2', name: 'Cash Account' },
    ];
    expect(findCashAccountVendor(vendors)?.id).toBe('2');
  });

  it('creates Cash Account when missing', async () => {
    const created = await ensureCashAccountVendor([], async input => ({ id: 'new', name: input.name }));
    expect(created.created).toBe(true);
    expect(created.vendor.name).toBe(CASH_ACCOUNT_NAME);
  });
});

const company = { companyName: 'Test Co' };
const standaloneInv = {
  invoiceNumber: 'INV/1',
  customerName: 'Rajkot Accessories Supplier',
  items: [
    {
      description: 'Item',
      qty: 1,
      rate: 10,
      gstPercent: 18,
      taxable: 10,
      tax: 1.8,
      total: 11.8,
    },
  ],
  subtotal: 10,
  taxTotal: 1.8,
  gstEnabled: true,
  grandTotal: 11.8,
  status: 'sent',
  invoiceDate: '2026-08-31',
};

describe('bill print layout', () => {
  it('does not pad the items table with an empty fill-row', () => {
    const html = generateStandaloneInvoiceHtml(standaloneInv, company, {}, { hasGst: true });
    expect(html).not.toContain('fill-row');
    expect(html).toContain('page-frame');
    expect(html).toContain('size:A4');
  });

  it('uses A5 for half-page receipts', () => {
    const html = generateStandaloneInvoiceHtml(standaloneInv, company, {}, { hasGst: true, printPage: 'half' });
    expect(html).toContain('size:A5');
  });

  it('titles a cash party bill as Cash Memo', () => {
    const html = generateStandaloneInvoiceHtml(
      { ...standaloneInv, customerName: 'Cash Account' },
      company,
      {},
      { hasGst: true },
    );
    expect(html).toContain('Cash Memo');
    expect(html).not.toContain('>Tax Invoice<');
  });
});

describe('distribution challan cash memo', () => {
  it('titles cash party challans as Cash Memo', () => {
    const html = generateDistributionChallanHtml({
      challanId: 'CH-1',
      distributionDate: '2026-08-31',
      vendor: { name: 'Cash Account' },
      company: { name: 'Test Co' },
      gstRate: 18,
      items: [
        {
          sno: 1,
          barcode: '1',
          productName: 'Seed',
          originalPrice: 10,
          discountPercent: 0,
          netPrice: 10,
          price: 10,
          gstApplied: true,
        },
      ],
      groupedItems: [
        {
          productName: 'Seed',
          barcodes: ['1'],
          originalPrice: 10,
          discountPercent: 0,
          netPrice: 10,
          quantity: 1,
          lineTotal: 10,
        },
      ],
      totalQuantity: 1,
      grossValue: 10,
      totalDiscount: 0,
      totalValue: 10,
      totalGst: 0,
      totalBilled: 10,
    } as never);
    expect(html).toContain('Cash Memo');
    expect(html).toContain('page-frame');
  });
});
