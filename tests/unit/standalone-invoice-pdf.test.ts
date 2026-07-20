import { describe, expect, it } from 'vitest';
import { buildStandaloneInvoicePdfBlob } from '../../src/lib/standaloneInvoicePdf';

const baseInv = {
  invoiceNumber: 'INV/2026-27/0001',
  customerName: 'City Cafe',
  customerPhone: '9123456780',
  customerAddress: '8 Market Lane Jaipur Rajasthan 302001',
  items: [
    {
      description: 'MCB 32A Single Pole',
      hsnSac: '8536',
      qty: 1,
      rate: 170,
      gstPercent: 0,
      taxable: 170,
      tax: 0,
      total: 170,
    },
  ],
  subtotal: 170,
  taxTotal: 0,
  gstEnabled: false,
  grandTotal: 170,
  status: 'paid',
  invoiceDate: '2026-07-20',
  paidAmount: 170,
  advanceApplied: 170,
  outstanding: 0,
};

async function pdfText(blob: Blob): Promise<string> {
  const buf = Buffer.from(await blob.arrayBuffer());
  // jsPDF embeds ASCII strings literally — enough for layout label checks.
  return buf.toString('latin1');
}

describe('buildStandaloneInvoicePdfBlob (Cap light print-like)', () => {
  it('draws print-like sections without html2canvas', async () => {
    const blob = await buildStandaloneInvoicePdfBlob(
      baseInv,
      {
        companyName: 'Prathamesh',
        email: 'patelprathamesh007@gmail.com',
        phone: '9999999999',
      },
      {
        hasGst: false,
        billSettings: {
          footerText: 'Powered by Dhandho Management',
          tagline: 'Quality Service',
          bankName: 'Demo Bank',
          bankAccountNumber: '123456',
          bankIfsc: 'DEMO0001',
          signatoryName: 'Owner',
          signatoryDesignation: 'Proprietor',
          termsAndConditions: 'Payment due on receipt.',
          // 1x1 PNG — exercises addImage path without html2canvas
          logoBase64:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
          signatureBase64:
            'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
        },
      },
    );

    expect(blob.type).toMatch(/pdf/i);
    expect(blob.size).toBeGreaterThan(2000);

    const text = await pdfText(blob);
    expect(text).toContain('INVOICE');
    expect(text).toContain('BILL TO');
    expect(text).toContain('ITEM NAME');
    expect(text).toContain('PRICE/UNIT');
    expect(text).toContain('City Cafe');
    expect(text).toContain('Sub Total');
    expect(text).toContain('Balance');
    expect(text).toContain('Authorized Signatory');
    expect(text).toContain('Bank Details');
    expect(text).toContain('Powered by Dhandho Management');
    expect(text).toContain('Quality Service');
    expect(text).toContain('Terms and Conditions');
    expect(text).toContain('Owner');
    expect(text).toContain('Proprietor');
    // Human date, not raw ISO timestamp
    expect(text).not.toContain('2026-07-20T00:00:00');
    expect(text).toMatch(/20 Jul 2026|Jul 2026/);
  });

  it('quotation variant titles QUOTATION and omits bank', async () => {
    const blob = await buildStandaloneInvoicePdfBlob(
      baseInv,
      { companyName: 'Prathamesh', phone: '9999999999' },
      {
        hasGst: false,
        docType: 'quotation',
        billSettings: {
          bankName: 'Demo Bank',
          bankAccountNumber: '123456',
          footerText: 'Thanks for business with us',
        },
      },
    );
    const text = await pdfText(blob);
    expect(text).toContain('QUOTATION');
    expect(text).toContain('Quotation No');
    expect(text).not.toContain('Bank Details');
    expect(text).not.toContain('TAX INVOICE');
    expect(text).toContain('Thanks for business with us');
  });

  it('uses TAX INVOICE title and GST columns when hasGst', async () => {
    const blob = await buildStandaloneInvoicePdfBlob(
      {
        ...baseInv,
        gstEnabled: true,
        taxTotal: 30.6,
        taxCgst: 15.3,
        taxSgst: 15.3,
        grandTotal: 200.6,
        paidAmount: 0,
        advanceApplied: 0,
        outstanding: 200.6,
        status: 'sent',
        items: [
          {
            description: 'Service',
            hsnSac: '9983',
            qty: 1,
            rate: 170,
            gstPercent: 18,
            taxable: 170,
            tax: 30.6,
            total: 200.6,
          },
        ],
      },
      { companyName: 'Shop', gstNumber: '24AAAAA0000A1Z5' },
      { hasGst: true },
    );
    const text = await pdfText(blob);
    expect(text).toContain('TAX INVOICE');
    expect(text).toContain('HSN');
    expect(text).toContain('CGST');
  });
});
