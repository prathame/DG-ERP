/** Extract first 6-digit pincode from a free-text address. */
export function pinFromAddress(addr: string | null | undefined): string {
  const m = String(addr || '').match(/\b(\d{6})\b/);
  return m ? m[1] : '';
}
