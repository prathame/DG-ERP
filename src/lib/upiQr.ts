/** UPI pay link + QR data URL for bill PDFs (print + jsPDF). */

export function buildUpiPayLink(upiId: string, accountName?: string | null): string {
  const pa = String(upiId || '').trim();
  if (!pa) return '';
  const pn = String(accountName || 'Business').trim() || 'Business';
  return `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&cu=INR`;
}

/** Generate a PNG data URL locally (no external qrserver fetch). */
export async function generateUpiQrDataUrl(upiId: string, accountName?: string | null): Promise<string> {
  const link = buildUpiPayLink(upiId, accountName);
  if (!link) return '';
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(link, { width: 120, margin: 1, errorCorrectionLevel: 'M' });
}

/**
 * Prefer saved billSettings.bankUpiQrBase64; otherwise generate once locally.
 * Stored QR is regenerated server-side when UPI ID / account name changes.
 */
export async function resolveUpiQrDataUrl(billSettings: Record<string, unknown> | undefined | null): Promise<string> {
  const bs = billSettings || {};
  const upiId = String(bs.bankUpiId || '').trim();
  if (!upiId) return '';
  const stored = typeof bs.bankUpiQrBase64 === 'string' ? bs.bankUpiQrBase64.trim() : '';
  if (stored.startsWith('data:image/')) return stored;
  return generateUpiQrDataUrl(upiId, String(bs.bankAccountName || 'Business'));
}
