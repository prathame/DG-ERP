import QRCode from 'qrcode';

export function buildUpiPayLink(upiId: string, accountName?: string | null): string {
  const pa = String(upiId || '').trim();
  if (!pa) return '';
  const pn = String(accountName || 'Business').trim() || 'Business';
  return `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&cu=INR`;
}

export async function generateUpiQrBase64(upiId: string, accountName?: string | null): Promise<string | null> {
  const link = buildUpiPayLink(upiId, accountName);
  if (!link) return null;
  return QRCode.toDataURL(link, { width: 120, margin: 1, errorCorrectionLevel: 'M' });
}
