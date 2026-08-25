import { GST_PINCODE_DISTANCE_URL } from '../../shared/gstEwbValidation';

export { GST_PINCODE_DISTANCE_URL };

/** Extract first 6-digit pincode from a free-text address. */
export function pinFromAddress(addr: string | null | undefined): string {
  const m = String(addr || '').match(/\b(\d{6})\b/);
  return m ? m[1] : '';
}

export function isSixDigitPin(pin: string | null | undefined): boolean {
  return /^\d{6}$/.test(String(pin || '').trim());
}

/** Open NIC PIN-to-PIN page and copy From/To pins for the captcha form. */
export async function openGstPinDistanceLookup(
  fromPin?: string,
  toPin?: string,
): Promise<{ copied: boolean; fromPin: string; toPin: string }> {
  const from = String(fromPin || '').trim();
  const to = String(toPin || '').trim();
  let copied = false;
  const lines: string[] = [];
  if (isSixDigitPin(from)) lines.push(`From: ${from}`);
  if (isSixDigitPin(to)) lines.push(`To: ${to}`);
  if (lines.length && typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      copied = true;
    } catch {
      copied = false;
    }
  }
  if (typeof window !== 'undefined') {
    window.open(GST_PINCODE_DISTANCE_URL, '_blank', 'noopener,noreferrer');
  }
  return { copied, fromPin: from, toPin: to };
}
