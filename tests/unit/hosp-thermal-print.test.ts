import { describe, expect, it } from 'vitest';
import type { HospOrderDetail } from '../../src/features/hospitality/hospApi';
import {
  computeHospBillTaxTotals,
  escHtml,
  generateKotHtml,
  generateTableBillHtml,
  type KotTicket,
} from '../../src/features/hospitality/hospThermalPrint';

const baseDetail = (overrides?: Partial<HospOrderDetail>): HospOrderDetail => ({
  order: {
    id: 'o1',
    table_id: 't1',
    status: 'open',
    token: 'T-12',
    order_type: 'dine_in',
    ...(overrides?.order || {}),
  },
  items: overrides?.items ?? [
    {
      id: 'i1',
      name: 'Butter Chicken',
      qty: 2,
      unit_price: 250,
      notes: '',
      kitchen_status: 'ready',
      modifiers: [{ name: 'Extra gravy', price_delta: 20 }],
      lineTotal: 540,
    },
  ],
  total: overrides?.total ?? 540,
  subtotal: overrides?.subtotal,
  discount_value: overrides?.discount_value,
  table: overrides?.table ?? { id: 't1', name: 'T1', seats: 4, status: 'occupied', zone: 'Hall' },
  label: overrides?.label ?? null,
});

const baseTicket = (overrides?: Partial<KotTicket>): KotTicket => ({
  id: 'k1',
  name: 'Paneer Tikka',
  qty: 1,
  notes: '',
  kitchen_status: 'queued',
  table_name: 'T3',
  label: undefined,
  order_type: 'dine_in',
  waiter_name: 'Ravi',
  fired_at: '2026-07-27T10:05:00Z',
  modifiers: [{ name: 'Less spicy' }],
  ...overrides,
});

describe('escHtml', () => {
  it('escapes XSS-sensitive characters', () => {
    expect(escHtml(`<img src=x onerror="alert(1)">`)).toBe('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
    expect(escHtml('A & B')).toBe('A &amp; B');
  });
});

describe('computeHospBillTaxTotals', () => {
  it('inclusive: extracts taxable + CGST/SGST; grand equals menu subtotal', () => {
    const t = computeHospBillTaxTotals(105, 5, true);
    expect(t.grand).toBe(105);
    expect(t.taxable).toBe(100);
    expect(t.taxTotal).toBe(5);
    expect(t.cgst).toBe(2.5);
    expect(t.sgst).toBe(2.5);
    expect(t.pricesIncludeGst).toBe(true);
  });

  it('exclusive: adds CGST/SGST on subtotal', () => {
    const t = computeHospBillTaxTotals(100, 5, false);
    expect(t.taxable).toBe(100);
    expect(t.taxTotal).toBe(5);
    expect(t.cgst).toBe(2.5);
    expect(t.sgst).toBe(2.5);
    expect(t.grand).toBe(105);
    expect(t.pricesIncludeGst).toBe(false);
  });

  it('zero rate: no tax lines math', () => {
    const t = computeHospBillTaxTotals(200, 0, true);
    expect(t.taxTotal).toBe(0);
    expect(t.grand).toBe(200);
    expect(t.taxable).toBe(200);
  });
});

describe('generateTableBillHtml', () => {
  it('emits 80mm thermal shell with Item/Qty/Rate/Amt and trailing page override', () => {
    const html = generateTableBillHtml(baseDetail(), 'T1', 'Silver Hotel');
    expect(html).toContain('id="dg-thermal-page"');
    expect(html).toContain('size:80mm auto');
    expect(html).toContain('Silver Hotel');
    expect(html).toContain('<th>Item</th>');
    expect(html).toContain('Qty');
    expect(html).toContain('Rate');
    expect(html).toContain('Amt');
    expect(html).toContain('Butter Chicken');
    expect(html).toContain('Extra gravy');
    expect(html).toContain('GRAND TOTAL');
    expect(html).toContain('Rs.');
  });

  it('prints optional guest name and mobile when present', () => {
    const html = generateTableBillHtml(
      baseDetail({
        order: {
          id: 'o1',
          table_id: 't1',
          status: 'billed',
          customer_name: 'Priya',
          customer_phone: '9876501234',
        },
      }),
      'T1',
      'Silver Hotel',
    );
    expect(html).toContain('Guest:');
    expect(html).toContain('Priya');
    expect(html).toContain('9876501234');
  });

  it('escapes hostile item / company / table strings', () => {
    const html = generateTableBillHtml(
      baseDetail({
        items: [
          {
            id: 'i2',
            name: '<script>alert(1)</script>',
            qty: 1,
            unit_price: 10,
            notes: '<b>hot</b>',
            kitchen_status: 'ready',
            modifiers: [{ name: '"><img src=x>', price_delta: 0 }],
            lineTotal: 10,
          },
        ],
        total: 10,
      }),
      'T"<script>',
      '<Company>',
    );
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;hot&lt;/b&gt;');
    expect(html).toContain('&lt;Company&gt;');
    expect(html).toContain('&quot;&gt;&lt;img src=x&gt;');
  });

  it('GST off (no gstRate): no CGST/SGST; grand equals post-discount total; GSTIN/FSSAI still print', () => {
    const html = generateTableBillHtml(
      baseDetail({
        total: 450,
        subtotal: 500,
        discount_value: 50,
        order: {
          id: 'o1',
          table_id: 't1',
          status: 'open',
          discount_percent: 10,
          discount_amount: 0,
        },
        items: [],
      }),
      'T1',
      'Shop',
      { gstin: '27AABCU9603R1ZM', fssaiLicense: '12345678901234' },
    );
    expect(html).not.toContain('CGST');
    expect(html).not.toContain('SGST');
    expect(html).not.toContain('Taxable Value');
    expect(html).not.toContain('Prices include GST');
    expect(html).toContain('Discount');
    expect(html).toContain('GRAND TOTAL');
    expect(html).toContain('Rs. 450');
    expect(html).toContain('GSTIN: 27AABCU9603R1ZM');
    expect(html).toContain('FSSAI: 12345678901234');
  });

  it('inclusive GST: shows Taxable Value, does not inflate grand past menu total', () => {
    const html = generateTableBillHtml(baseDetail({ total: 105, items: [] }), 'T1', 'Shop', {
      gstRate: 5,
      pricesIncludeGst: true,
    });
    expect(html).toContain('Prices include GST');
    expect(html).toContain('Taxable Value');
    expect(html).toContain('CGST @');
    expect(html).toContain('SGST @');
    expect(html).toContain('GRAND TOTAL');
    expect(html).toContain('Rs. 105');
    expect(html).not.toContain('Rs. 110');
  });

  it('exclusive GST: adds tax on subtotal', () => {
    const html = generateTableBillHtml(baseDetail({ total: 100, items: [] }), 'T1', 'Shop', {
      gstRate: 5,
      pricesIncludeGst: false,
    });
    expect(html).toContain('Sub Total');
    expect(html).toContain('CGST @');
    expect(html).toContain('SGST @');
    expect(html).toContain('Rs. 105');
    expect(html).not.toContain('Prices include GST');
    expect(html).not.toContain('Taxable Value');
  });

  it('prints GSTIN and FSSAI on guest bill when provided; omits tax lines without gstRate', () => {
    const withIds = generateTableBillHtml(baseDetail({ total: 100, items: [] }), 'T1', 'Shop', {
      gstin: '27AABCU9603R1ZM',
      fssaiLicense: '12345678901234',
    });
    expect(withIds).toContain('GSTIN: 27AABCU9603R1ZM');
    expect(withIds).toContain('FSSAI: 12345678901234');
    expect(withIds).not.toContain('CGST');

    const plain = generateTableBillHtml(baseDetail({ total: 100, items: [] }), 'T1', 'Shop');
    expect(plain).not.toContain('GSTIN:');
    expect(plain).not.toContain('FSSAI:');
  });

  it('escapes hostile GSTIN / FSSAI', () => {
    const html = generateTableBillHtml(baseDetail({ total: 10, items: [] }), 'T1', 'Shop', {
      gstin: '<gst>',
      fssaiLicense: 'A&B',
    });
    expect(html).toContain('GSTIN: &lt;gst&gt;');
    expect(html).toContain('FSSAI: A&amp;B');
  });
  it('prints order discount line when discount_value is set', () => {
    const html = generateTableBillHtml(
      baseDetail({
        total: 450,
        subtotal: 500,
        discount_value: 50,
        order: {
          id: 'o1',
          table_id: 't1',
          status: 'open',
          discount_percent: 10,
          discount_amount: 0,
        },
        items: [],
      }),
      'T1',
      'Shop',
    );
    expect(html).toContain('Discount');
    expect(html).toContain('- Rs. 50');
    expect(html).toContain('Rs. 450');
  });
});

describe('generateKotHtml', () => {
  it('prints kitchen ticket without prices and with thermal shell', () => {
    const html = generateKotHtml(baseTicket(), 'Silver Hotel');
    expect(html).toContain('id="dg-thermal-page"');
    expect(html).toContain('*** KOT ***');
    expect(html).toContain('1 x Paneer Tikka');
    expect(html).toContain('Less spicy');
    expect(html).toContain('Waiter: Ravi');
    expect(html).toContain('Status: queued');
    expect(html).not.toMatch(/Rs\.|₹|unit_price|Rate|Amt|GRAND TOTAL|GSTIN|FSSAI/i);
  });

  it('labels parcels and escapes hostile ticket fields', () => {
    const html = generateKotHtml(
      baseTicket({
        order_type: 'parcel',
        label: 'P-9',
        name: '<svg onload=alert(1)>',
        notes: '<evil>',
        waiter_name: 'A&B',
        modifiers: [{ name: '<mod>' }],
      }),
      'Cafe',
    );
    expect(html).toContain('Parcel: P-9');
    expect(html).not.toContain('<svg');
    expect(html).toContain('&lt;svg onload=alert(1)&gt;');
    expect(html).toContain('&lt;evil&gt;');
    expect(html).toContain('A&amp;B');
    expect(html).toContain('&lt;mod&gt;');
  });
});
