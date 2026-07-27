import { describe, expect, it } from 'vitest';
import type { HospOrderDetail } from '../../src/features/hospitality/hospApi';
import {
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

  it('adds CGST/SGST when gstRate is set; omits tax lines otherwise', () => {
    const withGst = generateTableBillHtml(baseDetail({ total: 100, items: [] }), 'T1', 'Shop', {
      gstRate: 5,
    });
    expect(withGst).toContain('CGST @');
    expect(withGst).toContain('SGST @');
    expect(withGst).toContain('Sub Total');

    const plain = generateTableBillHtml(baseDetail({ total: 100, items: [] }), 'T1', 'Shop');
    expect(plain).not.toContain('CGST');
    expect(plain).not.toContain('SGST');
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
    expect(html).not.toMatch(/Rs\.|₹|unit_price|Rate|Amt|GRAND TOTAL/i);
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
