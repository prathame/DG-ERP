import { describe, it, expect } from 'vitest';
import { buildStandaloneInvoicePdfBlob } from '../../src/lib/standaloneInvoicePdf';
import type { StandaloneInvoicePrint, StandaloneInvoicePrintCompany } from '../../src/lib/billTemplates';

const sampleCompany: StandaloneInvoicePrintCompany = {
  companyName: 'Test Co',
  address: 'Ahmedabad',
  gstNumber: '24AAAAA0000A1Z5',
};

const sampleInvoice: StandaloneInvoicePrint = {
  invoiceNumber: 'INV-001',
  customerName: 'Buyer',
  customerGstin: '24BBBBB0000B1Z5',
  items: [
    {
      description: 'Widget',
      hsnSac: '8471',
      qty: 2,
      unit: 'Pcs',
      rate: 100,
      gstPercent: 18,
      taxable: 200,
      tax: 36,
      total: 236,
    },
  ],
  subtotal: 200,
  taxTotal: 36,
  taxCgst: 18,
  taxSgst: 18,
  grandTotal: 236,
  status: 'unpaid',
  invoiceDate: '2026-08-22',
  notes: 'Thank you for your business.',
  irn: 'a'.repeat(64),
  irnAckNo: 'ACK123',
  irnAckDt: '2026-08-22',
};

describe('buildStandaloneInvoicePdfBlob', () => {
  it('returns a non-empty PDF blob for a GST invoice with notes and IRN', async () => {
    const blob = await buildStandaloneInvoicePdfBlob(sampleInvoice, sampleCompany, { hasGst: true });
    expect(blob.type).toBe('application/pdf');
    expect(blob.size).toBeGreaterThan(2000);
  });

  it('throws when invoice has no line items', async () => {
    await expect(buildStandaloneInvoicePdfBlob({ ...sampleInvoice, items: [] }, sampleCompany)).rejects.toThrow(
      /no line items/i,
    );
  });
});
