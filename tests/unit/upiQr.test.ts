import { describe, it, expect } from 'vitest';
import { buildUpiPayLink, generateUpiQrDataUrl, generateQrDataUrl, storedUpiQrDataUrl } from '../../src/lib/upiQr';

describe('upiQr', () => {
  it('builds a standard UPI deep link', () => {
    const link = buildUpiPayLink('merchant@upi', 'Test Shop');
    expect(link).toContain('upi://pay?');
    expect(link).toContain('pa=merchant%40upi');
    expect(link).toContain('pn=Test%20Shop');
    expect(link).toContain('cu=INR');
  });

  it('generates a PNG data URL locally', async () => {
    const dataUrl = await generateUpiQrDataUrl('merchant@upi', 'Test Shop');
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(dataUrl.length).toBeGreaterThan(500);
  });

  it('generates arbitrary QR payloads', async () => {
    const dataUrl = await generateQrDataUrl('IRN-DEMO-PAYLOAD', 140);
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
  });

  it('returns stored QR without generating', () => {
    const dataUrl = 'data:image/png;base64,abc';
    expect(storedUpiQrDataUrl({ bankUpiQrBase64: dataUrl })).toBe(dataUrl);
    expect(storedUpiQrDataUrl({ bankUpiQrBase64: 'bad' })).toBe('');
  });
});
