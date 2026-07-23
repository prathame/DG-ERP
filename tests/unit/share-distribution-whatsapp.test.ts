import { describe, expect, it } from 'vitest';
import type { DistributionBillData } from '../../src/api';
import { distributionHalfToStandalonePrint } from '../../src/lib/shareDistributionWhatsApp';

function sampleBill(overrides?: Partial<DistributionBillData>): DistributionBillData {
  return {
    challanId: 'BATCH-1',
    distributionDate: '2026-07-21',
    vendor: { name: 'Anand Agri', phone: '9876543210', gstNumber: '24AABCA1234M1Z8' },
    company: { name: 'Demo Co', phone: '9999999999', gstNumber: '24AAAAA0000A1Z5' },
    gstRate: 18,
    deliverySet: {
      isDualDocs: true,
      outstandingScope: 'batch',
      gstDocNo: 'BATCH-1-GST',
      nonGstDocNo: 'BATCH-1-BOS',
      gstDocKind: 'tax_invoice',
      nonGstDocKind: 'bill_of_supply',
    },
    items: [
      {
        sno: 1,
        barcode: 'A1',
        productName: 'Confidor',
        originalPrice: 1000,
        discountPercent: 0,
        price: 1000,
        billedPrice: 1180,
        status: 'Distributed',
        gstApplied: true,
      },
      {
        sno: 2,
        barcode: 'B1',
        productName: 'BoS Item',
        originalPrice: 500,
        discountPercent: 0,
        price: 500,
        billedPrice: 500,
        status: 'Distributed',
        gstApplied: false,
      },
    ],
    groupedItems: [],
    totalQuantity: 2,
    savedGstUnits: 1,
    grossValue: 1500,
    totalDiscount: 0,
    totalValue: 1680,
    ...overrides,
  };
}

describe('distributionHalfToStandalonePrint', () => {
  it('maps GST half to Tax Invoice printable with tax', () => {
    const m = distributionHalfToStandalonePrint(sampleBill(), 'gst');
    expect(m).not.toBeNull();
    expect(m!.docNo).toBe('BATCH-1-GST');
    expect(m!.hasGst).toBe(true);
    expect(m!.inv.items).toHaveLength(1);
    expect(m!.inv.items[0].description).toBe('Confidor');
    expect(m!.inv.items[0].taxable).toBe(1000);
    expect(m!.inv.items[0].tax).toBe(180);
    expect(m!.inv.items[0].total).toBe(1180);
    expect(m!.inv.grandTotal).toBe(1180);
    expect(m!.filename).toMatch(/Tax-Invoice/);
  });

  it('maps BoS half without GST', () => {
    const m = distributionHalfToStandalonePrint(sampleBill(), 'bos');
    expect(m).not.toBeNull();
    expect(m!.docNo).toBe('BATCH-1-BOS');
    expect(m!.hasGst).toBe(false);
    expect(m!.inv.items).toHaveLength(1);
    expect(m!.inv.items[0].description).toBe('BoS Item');
    expect(m!.inv.items[0].tax).toBe(0);
    expect(m!.inv.grandTotal).toBe(500);
    expect(m!.filename).toMatch(/Bill-of-Supply/);
  });

  it('returns null when half has no lines', () => {
    const bill = sampleBill({
      items: sampleBill().items.filter(i => i.gstApplied === true),
    });
    expect(distributionHalfToStandalonePrint(bill, 'bos')).toBeNull();
  });
});
