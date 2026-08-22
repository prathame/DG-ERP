/** UPI pay link + QR data URL for bill PDFs (print + jsPDF). */

export function buildUpiPayLink(upiId: string, accountName?: string | null): string {
  const pa = String(upiId || '').trim();
  if (!pa) return '';
  const pn = String(accountName || 'Business').trim() || 'Business';
  return `upi://pay?pa=${encodeURIComponent(pa)}&pn=${encodeURIComponent(pn)}&cu=INR`;
}

/** Generate a PNG data URL locally (no external API). */
export async function generateQrDataUrl(text: string, width = 120): Promise<string> {
  const payload = String(text || '').trim();
  if (!payload) return '';
  const { default: QRCode } = await import('qrcode');
  return QRCode.toDataURL(payload, { width, margin: 1, errorCorrectionLevel: 'M' });
}

/** Generate a PNG data URL for a UPI pay link. */
export async function generateUpiQrDataUrl(upiId: string, accountName?: string | null): Promise<string> {
  const link = buildUpiPayLink(upiId, accountName);
  if (!link) return '';
  return generateQrDataUrl(link, 120);
}

/**
 * Prefer saved billSettings.bankUpiQrBase64; otherwise generate once locally.
 * Stored QR is regenerated server-side when UPI ID / account name changes.
 */
export async function resolveUpiQrDataUrl(billSettings: Record<string, unknown> | undefined | null): Promise<string> {
  const bs = billSettings || {};
  const upiId = String(bs.bankUpiId || '').trim();
  if (!upiId) return '';
  const stored = storedUpiQrDataUrl(bs);
  if (stored) return stored;
  return generateUpiQrDataUrl(upiId, String(bs.bankAccountName || 'Business'));
}

/** Sync read of cached UPI QR from bill settings (no network / no generate). */
export function storedUpiQrDataUrl(billSettings: Record<string, unknown> | undefined | null): string {
  const stored = typeof billSettings?.bankUpiQrBase64 === 'string' ? billSettings.bankUpiQrBase64.trim() : '';
  return stored.startsWith('data:image/') ? stored : '';
}
