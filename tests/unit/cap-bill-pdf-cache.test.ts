import { describe, expect, it } from 'vitest';
import { billPdfContentKey } from '../../src/lib/capBillPdfCache';

const inv = {
  id: 'INV-1',
  invoiceNumber: 'INV/1',
  customerName: 'Acme',
  items: [
    {
      description: 'A',
      qty: 1,
      rate: 100,
      gstPercent: 0,
      taxable: 100,
      tax: 0,
      total: 100,
    },
  ],
  subtotal: 100,
  taxTotal: 0,
  grandTotal: 100,
  status: 'sent',
  invoiceDate: '2026-07-20',
};

describe('billPdfContentKey', () => {
  it('is stable for same invoice + template', () => {
    const a = billPdfContentKey(inv, 'invoice', { bankName: 'X', logoBase64: 'data:image/png;base64,aa' });
    const b = billPdfContentKey(inv, 'invoice', { bankName: 'X', logoBase64: 'data:image/png;base64,aa' });
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(2);
  });

  it('changes when line totals change', () => {
    const a = billPdfContentKey(inv, 'invoice', {});
    const b = billPdfContentKey(
      { ...inv, grandTotal: 120, items: [{ ...inv.items[0], total: 120, rate: 120 }] },
      'invoice',
      {},
    );
    expect(a).not.toBe(b);
  });

  it('differs for quotation vs invoice', () => {
    expect(billPdfContentKey(inv, 'invoice', {})).not.toBe(billPdfContentKey(inv, 'quotation', {}));
  });

  it('changes when bank template changes', () => {
    const a = billPdfContentKey(inv, 'invoice', { bankName: 'A' });
    const b = billPdfContentKey(inv, 'invoice', { bankName: 'B' });
    expect(a).not.toBe(b);
  });
});
