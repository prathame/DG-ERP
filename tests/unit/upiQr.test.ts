import { describe, it, expect } from 'vitest';
import { buildUpiPayLink, generateUpiQrDataUrl } from '../../src/lib/upiQr';

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
});
