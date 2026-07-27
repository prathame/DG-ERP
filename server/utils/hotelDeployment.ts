/** Hotel / restaurant data hosting mode chosen at SA onboard. */

export type HotelDeployment = 'cloud' | 'byo_db' | 'local_server';

export const HOTEL_DEPLOYMENTS: readonly HotelDeployment[] = ['cloud', 'byo_db', 'local_server'] as const;

export function isHotelDeployment(v: unknown): v is HotelDeployment {
  return typeof v === 'string' && (HOTEL_DEPLOYMENTS as readonly string[]).includes(v);
}

/** Normalize SA body; non-hotel → null. Default hotel mode is cloud. */
export function resolveHotelDeployment(businessType: string, raw: unknown): HotelDeployment | null {
  if (businessType !== 'hotel_restaurant') return null;
  if (raw === undefined || raw === null || raw === '') return 'cloud';
  if (!isHotelDeployment(raw)) {
    throw Object.assign(new Error('hotelDeployment must be cloud, byo_db, or local_server'), {
      code: 'INVALID_HOTEL_DEPLOYMENT',
    });
  }
  return raw;
}

export function looksLikePostgresUrl(url: string): boolean {
  return /^postgres(ql)?:\/\//i.test(String(url || '').trim());
}

/**
 * BYO mode requires a Postgres URL. Returns trimmed plain URL or null when not needed.
 * Throws with code INVALID_HOTEL_DB_URL when byo_db and URL missing/invalid.
 */
export function resolveHotelDatabaseUrl(deployment: HotelDeployment | null, raw: unknown): string | null {
  if (deployment !== 'byo_db') return null;
  const url = String(raw ?? '').trim();
  if (!url || !looksLikePostgresUrl(url)) {
    throw Object.assign(new Error('databaseUrl is required for byo_db (postgres:// or postgresql://)'), {
      code: 'INVALID_HOTEL_DB_URL',
    });
  }
  return url;
}
