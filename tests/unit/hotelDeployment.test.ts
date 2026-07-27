import { describe, expect, it } from 'vitest';
import {
  isHotelDeployment,
  looksLikePostgresUrl,
  resolveHotelDatabaseUrl,
  resolveHotelDeployment,
} from '../../server/utils/hotelDeployment';

describe('hotelDeployment', () => {
  it('accepts the three SA modes', () => {
    expect(isHotelDeployment('cloud')).toBe(true);
    expect(isHotelDeployment('byo_db')).toBe(true);
    expect(isHotelDeployment('local_server')).toBe(true);
    expect(isHotelDeployment('saas')).toBe(false);
  });

  it('defaults hotel to cloud; non-hotel to null', () => {
    expect(resolveHotelDeployment('hotel_restaurant', undefined)).toBe('cloud');
    expect(resolveHotelDeployment('hotel_restaurant', 'local_server')).toBe('local_server');
    expect(resolveHotelDeployment('retail', 'cloud')).toBe(null);
  });

  it('rejects invalid hotel deployment strings', () => {
    expect(() => resolveHotelDeployment('hotel_restaurant', 'saas')).toThrow(/hotelDeployment/);
  });

  it('requires postgres URL only for byo_db', () => {
    expect(resolveHotelDatabaseUrl('cloud', undefined)).toBe(null);
    expect(resolveHotelDatabaseUrl('local_server', 'postgresql://x')).toBe(null);
    expect(resolveHotelDatabaseUrl('byo_db', 'postgresql://u:p@h/db')).toBe('postgresql://u:p@h/db');
    expect(() => resolveHotelDatabaseUrl('byo_db', '')).toThrow(/databaseUrl/);
    expect(() => resolveHotelDatabaseUrl('byo_db', 'mysql://x')).toThrow(/databaseUrl/);
  });

  it('recognizes postgres URL schemes', () => {
    expect(looksLikePostgresUrl('postgres://a')).toBe(true);
    expect(looksLikePostgresUrl('postgresql://a')).toBe(true);
    expect(looksLikePostgresUrl('http://a')).toBe(false);
  });
});
