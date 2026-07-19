import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api } from '../http';
import { pool } from '../helpers';
import { DEFAULT_SERVICE_CLOUD_APP_URL, DEFAULT_SERVICE_MOBILE_APP_URL } from '../../server/download-defaults';

const MOBILE_KEY = 'service_mobile_app_url';
const CLOUD_KEY = 'service_cloud_app_url';

describe('GET /api/download-links', () => {
  let previousMobile: string | null | undefined;
  let previousCloud: string | null | undefined;

  beforeAll(async () => {
    const mobile = (await pool.query('SELECT value FROM platform_config WHERE key = $1', [MOBILE_KEY])).rows[0] as
      { value: string | null } | undefined;
    const cloud = (await pool.query('SELECT value FROM platform_config WHERE key = $1', [CLOUD_KEY])).rows[0] as
      { value: string | null } | undefined;
    previousMobile = mobile ? mobile.value : undefined;
    previousCloud = cloud ? cloud.value : undefined;
    await pool.query('DELETE FROM platform_config WHERE key = ANY($1::text[])', [[MOBILE_KEY, CLOUD_KEY]]);
  });

  afterAll(async () => {
    for (const [key, previous] of [
      [MOBILE_KEY, previousMobile],
      [CLOUD_KEY, previousCloud],
    ] as const) {
      if (previous === undefined) {
        await pool.query('DELETE FROM platform_config WHERE key = $1', [key]);
      } else {
        await pool.query(
          'INSERT INTO platform_config (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
          [key, previous],
        );
      }
    }
  });

  it('returns evergreen Offline + Online APKs when platform_config is unset', async () => {
    const res = await api().get('/api/download-links');
    expect(res.status).toBe(200);
    expect(res.body.serviceMobileAppUrl).toBe(DEFAULT_SERVICE_MOBILE_APP_URL);
    expect(res.body.serviceMobileAppUrl).toContain('/releases/download/offline-mobile/');
    expect(res.body.serviceCloudAppUrl).toBe(DEFAULT_SERVICE_CLOUD_APP_URL);
    expect(res.body.serviceCloudAppUrl).toContain('/releases/download/service-cloud/');
  });

  it('prefers platform_config override when set', async () => {
    const override = 'https://example.com/custom-offline.apk';
    await pool.query(
      'INSERT INTO platform_config (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
      [MOBILE_KEY, override],
    );
    const res = await api().get('/api/download-links');
    expect(res.status).toBe(200);
    expect(res.body.serviceMobileAppUrl).toBe(override);
    expect(res.body.serviceCloudAppUrl).toBe(DEFAULT_SERVICE_CLOUD_APP_URL);
    await pool.query('DELETE FROM platform_config WHERE key = $1', [MOBILE_KEY]);
  });
});
