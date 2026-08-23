import { describe, expect, it } from 'vitest';
import { parsePortalResponseJson } from '../../shared/parsePortalResponse';

describe('parsePortalResponseJson', () => {
  it('parses standard NIC e-invoice response', () => {
    const r = parsePortalResponseJson({
      Irn: 'a'.repeat(64),
      AckNo: '123456789012',
      AckDt: '23/08/2026 3:16:15 pm',
      SignedQRCode: 'eyJhbGciOiJSUzI1NiJ9.test',
      Status: 'ACT',
      EwbNo: 658366876269,
    });
    expect(r.irn).toBe('a'.repeat(64));
    expect(r.ackNo).toBe('123456789012');
    expect(r.irnQr).toBe('eyJhbGciOiJSUzI1NiJ9.test');
    expect(r.ewbNumber).toBe('658366876269');
  });

  it('parses bulk Success array and matches DocNo', () => {
    const r = parsePortalResponseJson(
      {
        Success: [
          { DocDtls: { No: 'INV/A' }, Irn: 'b'.repeat(64), SignedQRCode: 'qr-a' },
          { DocDtls: { No: 'INV/B' }, Irn: 'c'.repeat(64), SignedQRCode: 'qr-b', EwbNo: '111' },
        ],
      },
      'INV/B',
    );
    expect(r.irn).toBe('c'.repeat(64));
    expect(r.ewbNumber).toBe('111');
    expect(r.irnQr).toBe('qr-b');
  });

  it('parses e-way-only response', () => {
    const r = parsePortalResponseJson({ ewayBillNo: '998877665544' });
    expect(r.ewbNumber).toBe('998877665544');
    expect(r.irn).toBeUndefined();
  });

  it('rejects cancelled IRN', () => {
    expect(() => parsePortalResponseJson({ Irn: 'x'.repeat(64), Status: 'CNL' })).toThrow(/cancelled/i);
  });

  it('rejects empty payload', () => {
    expect(() => parsePortalResponseJson({ foo: 'bar' })).toThrow(/No IRN/i);
  });
});
