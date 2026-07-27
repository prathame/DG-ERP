import { describe, expect, it } from 'vitest';
import {
  filterMastersForBusinessType,
  HOTEL_MASTER_ALLOWLIST,
  isHotelRestaurantBusiness,
  isMasterAllowedForHotel,
} from '../../shared/hotelMasters';

describe('hotelMasters', () => {
  it('identifies hotel_restaurant only', () => {
    expect(isHotelRestaurantBusiness('hotel_restaurant')).toBe(true);
    expect(isHotelRestaurantBusiness('manufacturer')).toBe(false);
    expect(isHotelRestaurantBusiness(null)).toBe(false);
  });

  it('allowlists bank and staff only', () => {
    expect(HOTEL_MASTER_ALLOWLIST).toEqual(['bank', 'staff']);
    expect(isMasterAllowedForHotel('bank')).toBe(true);
    expect(isMasterAllowedForHotel('staff')).toBe(true);
    expect(isMasterAllowedForHotel('vendor')).toBe(false);
    expect(isMasterAllowedForHotel('item')).toBe(false);
    expect(isMasterAllowedForHotel('priceList')).toBe(false);
    expect(isMasterAllowedForHotel('customer')).toBe(false);
  });

  it('filters hub tiles for hotel; leaves other types alone', () => {
    const tiles = [{ id: 'item' }, { id: 'vendor' }, { id: 'bank' }, { id: 'staff' }, { id: 'priceList' }];
    expect(filterMastersForBusinessType(tiles, 'hotel_restaurant').map(t => t.id)).toEqual(['bank', 'staff']);
    expect(filterMastersForBusinessType(tiles, 'manufacturer')).toEqual(tiles);
  });
});
