import { describe, it, expect } from 'vitest';
import {
  isQuoteShapedInvoiceLine,
  needsInvoiceLineRemap,
  normalizeInvoiceLine,
  normalizeInvoiceLineItems,
} from '../../src/platforms/service-mobile/local/invoiceLineNormalize';

describe('invoiceLineNormalize', () => {
  it('detects quote-shaped lines without invoice fields', () => {
    expect(
      isQuoteShapedInvoiceLine({
        productName: 'AC Service',
        quantity: 1,
        unitPrice: 1000,
        lineNet: 1000,
        lineGst: 180,
        lineTotal: 1180,
      }),
    ).toBe(true);
    expect(
      isQuoteShapedInvoiceLine({
        description: 'AC Service',
        qty: 1,
        rate: 1000,
        taxable: 1000,
        tax: 180,
        total: 1180,
      }),
    ).toBe(false);
  });

  it('maps quote shape → description/qty/taxable', () => {
    const n = normalizeInvoiceLine({
      productId: 'p1',
      productName: 'Fan Motor',
      quantity: 2,
      unitPrice: 500,
      lineNet: 1000,
      lineGst: 180,
      lineTotal: 1180,
    });
    expect(n.description).toBe('Fan Motor');
    expect(n.qty).toBe(2);
    expect(n.rate).toBe(500);
    expect(n.taxable).toBe(1000);
    expect(n.tax).toBe(180);
    expect(n.total).toBe(1180);
    expect(n.productId).toBe('p1');
  });

  it('needsInvoiceLineRemap when any line is quote-shaped', () => {
    expect(
      needsInvoiceLineRemap([
        { productName: 'X', quantity: 1, lineNet: 10 },
        { description: 'Y', qty: 1, taxable: 10 },
      ]),
    ).toBe(true);
    expect(needsInvoiceLineRemap([{ description: 'Y', qty: 1, taxable: 10 }])).toBe(false);
  });

  it('normalizeInvoiceLineItems accepts JSON string', () => {
    const items = normalizeInvoiceLineItems(
      JSON.stringify([{ productName: 'Wire', quantity: 1, price: 50, lineNet: 50, lineGst: 0, lineTotal: 50 }]),
    );
    expect(items).toHaveLength(1);
    expect(items[0]!.description).toBe('Wire');
    expect(items[0]!.qty).toBe(1);
  });
});
