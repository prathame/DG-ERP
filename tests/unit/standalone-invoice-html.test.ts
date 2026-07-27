import { describe, expect, it } from 'vitest';
import { amountInWords, generateQuotationHtml, generateStandaloneInvoiceHtml } from '../../src/lib/billTemplates';

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
    // Table/section borders stay dark (#222), not washed #ccc/#ddd
    expect(html).toContain('border:1px solid #222');
    expect(html).not.toMatch(/border:[^;]*#ccc|border-bottom:[^;]*#ddd/);
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

  it('omits invoice due date even when present; quotations still show Valid until', () => {
    const invoiceHtml = generateStandaloneInvoiceHtml(
      { ...baseInv, dueDate: '2026-08-01' },
      { companyName: 'Shop' },
      {},
      { hasGst: true },
    );
    expect(invoiceHtml).toContain('Tax Invoice');
    expect(invoiceHtml).toContain('Date');
    expect(invoiceHtml).not.toContain('cust-label">Due');
    expect(invoiceHtml).not.toContain('Valid until');

    const quoteHtml = generateStandaloneInvoiceHtml(
      { ...baseInv, dueDate: '2026-08-01' },
      { companyName: 'Shop' },
      {},
      { hasGst: true, docType: 'quotation' },
    );
    expect(quoteHtml).toContain('Valid until');
    expect(quoteHtml).not.toContain('cust-label">Due');
  });
});

describe('generateQuotationHtml (Party Quotes / A4)', () => {
  it('uses full-page A4 invoice layout — never 80mm thermal receipt CSS', () => {
    const html = generateQuotationHtml({
      quotationNumber: 'Q-HOTEL-1',
      quotationDate: '2026-07-27',
      validUntil: '2026-08-10',
      status: 'Draft',
      customerName: 'Wedding party',
      customerPhone: '9999999999',
      items: [
        {
          productName: 'Veg thali × 50',
          quantity: 50,
          price: 250,
          discountPercent: 0,
          withGst: true,
          lineNet: 12500,
          lineGst: 2250,
          lineTotal: 14750,
        },
      ],
      subtotal: 12500,
      gstRate: 18,
      gstAmount: 2250,
      total: 14750,
      company: {
        name: 'Hotel Demo',
        phone: '8806907616',
        address: 'Main Road',
        gstNumber: '24AAAAA0000A1Z5',
      },
      billSettings: { footerText: 'Powered by Dhandho' },
    });

    expect(html).toContain('Quotation');
    expect(html).toContain('Quotation No');
    expect(html).toContain('Hotel Demo');
    expect(html).toContain('Veg thali');
    expect(html).toContain('Wedding party');
    expect(html).toMatch(/@page\{[^}]*size:\s*A4/);
    expect(html).toContain('font-family:Arial,Helvetica,sans-serif');
    expect(html).toContain('class="outer');
    expect(html).not.toMatch(/size:\s*80mm/);
    expect(html).not.toContain('dg-thermal-page');
    expect(html).not.toContain('Courier New');
    expect(html).not.toContain('max-width:300px');
  });
});

describe('amountInWords', () => {
  it('formats rupees', () => {
    expect(amountInWords(100)).toMatch(/One Hundred Rupees/i);
    expect(amountInWords(0)).toBe('Zero Rupees Only');
  });
});
