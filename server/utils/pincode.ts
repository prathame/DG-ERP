/** Extract first 6-digit pincode from a free-text address. */
export function pinFromAddress(addr: string | null | undefined): string {
  const m = String(addr || '').match(/\b(\d{6})\b/);
  return m ? m[1] : '';
}

/**
 * Estimate road distance (km) between two Indian pincodes.
 * Mock/dev fallback when NIC distance API is unavailable.
 */
export function estimatePinDistanceKm(fromPin: string, toPin: string): number {
  const f = String(fromPin || '').trim();
  const t = String(toPin || '').trim();
  if (!/^\d{6}$/.test(f) || !/^\d{6}$/.test(t)) return 0;
  if (f === t) return 1;
  const fromRegion = Math.floor(Number(f) / 10000);
  const toRegion = Math.floor(Number(t) / 10000);
  if (fromRegion !== toRegion) {
    return Math.min(2000, 80 + Math.abs(fromRegion - toRegion) * 120);
  }
  const diff = Math.abs(Number(f) - Number(t));
  return Math.max(5, Math.min(400, Math.floor(diff / 80) + 15));
}
