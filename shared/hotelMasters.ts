/**
 * Hotel / restaurant Masters policy.
 *
 * Masters stays hidden in TAB_PRESETS.hotel_restaurant. If Super Admin re-enables
 * the tab (or a deep-link somehow lands on Masters), only these hub types are safe.
 *
 * - bank: bill / invoice settlement accounts (Settings only selects, does not CRUD)
 * - staff: payroll / advances (distinct from Settings → Users login accounts)
 *
 * Not allowed: products, vendors/“guests”, customers, price lists, rewards, mapping,
 * expenses shortcuts — hospitality menu + Settings Users cover those needs.
 */

export type HotelAllowedMasterType = 'bank' | 'staff';

export const HOTEL_MASTER_ALLOWLIST: readonly HotelAllowedMasterType[] = ['bank', 'staff'];

export function isHotelRestaurantBusiness(businessType?: string | null): boolean {
  return businessType === 'hotel_restaurant';
}

export function isMasterAllowedForHotel(master: string): master is HotelAllowedMasterType {
  return (HOTEL_MASTER_ALLOWLIST as readonly string[]).includes(master);
}

/** Filter Masters hub tiles for hotel_restaurant; other types unchanged. */
export function filterMastersForBusinessType<T extends { id: string }>(
  masters: T[],
  businessType?: string | null,
): T[] {
  if (!isHotelRestaurantBusiness(businessType)) return masters;
  return masters.filter(m => isMasterAllowedForHotel(m.id));
}
