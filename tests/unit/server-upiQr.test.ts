import { describe, expect, it } from 'vitest';
import { buildUpiPayLink, generateUpiQrBase64 } from '../../server/utils/upiQr';

describe('server upiQr', () => {
  it('builds UPI pay link with encoded params', () => {
    const link = buildUpiPayLink('shop@okaxis', 'Dhandho Store');
    expect(link).toContain('upi://pay?');
    expect(link).toContain('pa=shop%40okaxis');
    expect(link).toContain('pn=Dhandho%20Store');
  });

  it('returns empty link when UPI id missing', () => {
    expect(buildUpiPayLink('', 'Name')).toBe('');
    expect(buildUpiPayLink('  ', 'Name')).toBe('');
  });

  it('generates QR data URL for valid UPI id', async () => {
    const dataUrl = await generateUpiQrBase64('pay@upi', 'Biz');
    expect(dataUrl?.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('returns null when UPI id missing', async () => {
    expect(await generateUpiQrBase64('')).toBeNull();
  });
});
