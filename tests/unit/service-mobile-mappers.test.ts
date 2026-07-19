import { describe, it, expect } from 'vitest';
import {
  mapBank,
  mapInvoice,
  mapProduct,
  mapSupplier,
  mapStaff,
  mapPriceRule,
  mapVendor,
} from '../../src/platforms/service-mobile/local/mappers';
import { isInterstateSupply, splitGstTax } from '../../src/platforms/service-mobile/local/invoiceHelpers';

describe('service-mobile local mappers', () => {
  it('maps product fields the invoice create form expects (gstRate, hsnCode)', () => {
    const p = mapProduct({
      id: 'P-1',
      name: 'Service A',
      price: 500,
      gst_percent: 12,
      hsn_code: '9983',
    });
    expect(p.gstRate).toBe(12);
    expect(p.hsnCode).toBe('9983');
    expect(p.price).toBe(500);
  });

  it('maps vendor gstNumber for party GSTIN on invoices', () => {
    const v = mapVendor({ id: 'V-1', name: 'Acme', gstin: '24AABCT1332L1ZS' });
    expect(v.gstNumber).toBe('24AABCT1332L1ZS');
  });

  it('maps invoice snake_case to UI camelCase', () => {
    const inv = mapInvoice({
      id: 'INV-1',
      invoice_number: 'INV/26-27/0001',
      customer_name: 'Acme',
      client_name: 'Acme',
      status: 'draft',
      items: '[]',
      subtotal: 100,
      tax_total: 18,
      grand_total: 118,
      invoice_date: '2026-07-17',
    });
    expect(inv.invoiceNumber).toBe('INV/26-27/0001');
    expect(inv.customerName).toBe('Acme');
    expect(inv.grandTotal).toBe(118);
    expect(inv.taxTotal).toBe(18);
    expect(inv.items).toEqual([]);
  });

  it('tolerates corrupt invoice items JSON without throwing', () => {
    const inv = mapInvoice({
      id: 'INV-bad',
      invoice_number: 'X',
      customer_name: 'Z',
      items: '{not-json',
      grand_total: 10,
    });
    expect(inv.items).toEqual([]);
    expect(inv.grandTotal).toBe(10);
  });

  it('maps supplier fields for PurchasesView', () => {
    const s = mapSupplier({
      id: 'S-1',
      name: 'Parts Co',
      contact_person: 'Ravi',
      phone: '999',
      gst_number: 'GST1',
    });
    expect(s.contactPerson).toBe('Ravi');
    expect(s.gstNumber).toBe('GST1');
  });

  it('maps staff payment aggregates', () => {
    const s = mapStaff({
      id: 'ST-1',
      name: 'Ram',
      total_paid: 1000,
      total_advance: 200,
      total_repaid: 50,
      payment_count: 2,
    });
    expect(s.totalPaid).toBe(1000);
    expect(s.advanceBalance).toBe(150);
    expect(s.paymentCount).toBe(2);
  });

  it('maps price list rules for PriceListView', () => {
    const r = mapPriceRule({
      id: 'PL-1',
      name: 'Vendor rate',
      product_id: 'P-1',
      product_name: 'Widget',
      vendor_id: 'V-1',
      vendor_name: 'Acme',
      min_qty: 1,
      max_qty: null,
      price: 99.5,
      is_active: true,
    });
    expect(r.productId).toBe('P-1');
    expect(r.productName).toBe('Widget');
    expect(r.vendorId).toBe('V-1');
    expect(r.price).toBe(99.5);
    expect(r.isActive).toBe(true);
  });

  it('maps bank ifscCode for BankMasterView (not ifsc alone)', () => {
    const b = mapBank({
      id: 'B-1',
      name: 'Main',
      account_number: '123',
      bank_name: 'HDFC',
      branch: 'SG Hwy',
      ifsc: 'HDFC0001234',
    });
    expect(b.ifscCode).toBe('HDFC0001234');
    expect(b.accountNumber).toBe('123');
    expect(b.bankName).toBe('HDFC');
  });
});

describe('service-mobile invoice helpers', () => {
  it('splits CGST/SGST vs IGST', () => {
    expect(isInterstateSupply('24AAAAA0000A1Z5', '27BBBBB0000B1Z5')).toBe(true);
    expect(isInterstateSupply('24AAAAA0000A1Z5', '24BBBBB0000B1Z5')).toBe(false);
    const intra = splitGstTax(18, false);
    expect(intra.taxCgst + intra.taxSgst).toBeCloseTo(18, 1);
    expect(intra.taxIgst).toBe(0);
    const inter = splitGstTax(18, true);
    expect(inter.taxIgst).toBe(18);
  });
});
