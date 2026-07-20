import { describe, expect, it } from 'vitest';
import { amountInWords, generateStandaloneInvoiceHtml } from '../../src/lib/billTemplates';

const baseInv = {
  invoiceNumber: 'INV/2026-27/0001',
  customerName: 'Cash Sale',
  customerPhone: '8806907616',
  items: [
    {
      description: 'Sample Item',
      hsnSac: '9983',
      qty: 1,
      rate: 100,
      gstPercent: 18,
      taxable: 100,
      tax: 18,
      total: 118,
    },
  ],
  subtotal: 100,
  taxTotal: 18,
  taxCgst: 9,
  taxSgst: 9,
  gstEnabled: true,
  grandTotal: 118,
  status: 'paid',
  invoiceDate: '2026-07-19',
  paidAmount: 118,
  outstanding: 0,
};

describe('generateStandaloneInvoiceHtml', () => {
  it('uses bordered outer sections and GST summary at the end', () => {
    const html = generateStandaloneInvoiceHtml(
      baseInv,
      {
        companyName: 'Prathmesh Busa',
        phone: '8806907616',
        email: 'a@b.com',
        gstNumber: '24AAAAA0000A1Z5',
      },
      { invoicePrefix: '', footerText: 'Powered by Dhandho' },
      { hasGst: true },
    );

    expect(html).toContain('class="outer title-box');
    expect(html).toContain('Tax Invoice');
    expect(html).toContain('class="outer items"');
    expect(html).toContain('fill-row');
    expect(html).toContain('Bill To');
    expect(html).toContain('Sub Total');
    expect(html).toContain('Balance');
    expect(html).toContain('HSN/SAC');
    expect(html).toContain('CGST Rate');
    expect(html).toContain('SGST Rate');
    expect(html).toContain('Authorized Signatory');
    // Totals / GST calc live in print-end (after items), not floating mid-page
    expect(html).toContain('class="print-end');
    const printEndAt = html.indexOf('class="print-end');
    const gstTableAt = html.indexOf('CGST Rate');
    expect(gstTableAt).toBeGreaterThan(printEndAt);
  });

  it('omits GST summary table when invoice is non-GST', () => {
    const html = generateStandaloneInvoiceHtml(
      {
        ...baseInv,
        gstEnabled: false,
        taxTotal: 0,
        grandTotal: 100,
        items: [{ ...baseInv.items[0], tax: 0, total: 100, gstPercent: 0 }],
      },
      { companyName: 'Shop' },
      {},
      { hasGst: false },
    );
    expect(html).toContain('Invoice');
    expect(html).not.toContain('CGST Rate');
    expect(html).toContain('class="outer');
  });

  it('quotation variant uses QUOTATION title and omits bank', () => {
    const html = generateStandaloneInvoiceHtml(
      baseInv,
      { companyName: 'Shop', phone: '999' },
      {
        bankName: 'Demo Bank',
        bankAccountNumber: '123',
        bankUpiId: 'a@upi',
        footerText: 'Thanks for business with us',
        termsAndConditions: 'Material cost 100% advance',
      },
      { hasGst: true, docType: 'quotation' },
    );
    expect(html).toContain('Quotation');
    expect(html).toContain('Quotation No');
    expect(html).toContain('print-end');
    expect(html).toContain('Thanks for business with us');
    expect(html).not.toContain('Bank Details');
    expect(html).not.toContain('Tax Invoice');
    expect(html).toContain('This quotation is subject to confirmation.');
  });
});

describe('amountInWords', () => {
  it('formats rupees', () => {
    expect(amountInWords(100)).toMatch(/One Hundred Rupees/i);
    expect(amountInWords(0)).toBe('Zero Rupees Only');
  });
});
