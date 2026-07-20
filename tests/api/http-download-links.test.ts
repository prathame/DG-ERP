import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api } from '../http';
import { pool } from '../helpers';
import {
  DEFAULT_SERVICE_CLOUD_APP_URL,
  DEFAULT_SERVICE_CLOUD_IOS_URL,
  DEFAULT_SERVICE_MOBILE_APP_URL,
  DEFAULT_SERVICE_MOBILE_IOS_URL,
} from '../../server/download-defaults';

const MOBILE_KEY = 'service_mobile_app_url';
const MOBILE_IOS_KEY = 'service_mobile_ios_url';
const CLOUD_KEY = 'service_cloud_app_url';
const CLOUD_IOS_KEY = 'service_cloud_ios_url';
const ALL_KEYS = [MOBILE_KEY, MOBILE_IOS_KEY, CLOUD_KEY, CLOUD_IOS_KEY];

describe('GET /api/download-links', () => {
  const previous: Record<string, string | null | undefined> = {};

  beforeAll(async () => {
    for (const key of ALL_KEYS) {
      const row = (await pool.query('SELECT value FROM platform_config WHERE key = $1', [key])).rows[0] as
        { value: string | null } | undefined;
      previous[key] = row ? row.value : undefined;
    }
    await pool.query('DELETE FROM platform_config WHERE key = ANY($1::text[])', [ALL_KEYS]);
  });

  afterAll(async () => {
    for (const key of ALL_KEYS) {
      const prev = previous[key];
      if (prev === undefined) {
        await pool.query('DELETE FROM platform_config WHERE key = $1', [key]);
      } else {
        await pool.query(
          'INSERT INTO platform_config (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
          [key, prev],
        );
      }
    }
  });

  it('returns unified dhandho-mobile Android/iOS defaults when platform_config is unset', async () => {
    const res = await api().get('/api/download-links');
    expect(res.status).toBe(200);
    expect(res.body.serviceMobileAppUrl).toBe(DEFAULT_SERVICE_MOBILE_APP_URL);
    expect(res.body.serviceMobileIosUrl).toBe(DEFAULT_SERVICE_MOBILE_IOS_URL);
    // Legacy cloud keys alias the same unified evergreen assets
    expect(res.body.serviceCloudAppUrl).toBe(DEFAULT_SERVICE_CLOUD_APP_URL);
    expect(res.body.serviceCloudIosUrl).toBe(DEFAULT_SERVICE_CLOUD_IOS_URL);
    expect(res.body.serviceMobileAppUrl).toContain('/releases/download/dhandho-mobile/');
    expect(res.body.serviceMobileAppUrl).toContain('dhandho-mobile-debug.apk');
    expect(res.body.serviceMobileIosUrl).toContain('.app.zip');
    expect(res.body.serviceCloudAppUrl).toContain('/releases/download/dhandho-mobile/');
    expect(res.body.serviceCloudIosUrl).toContain('.app.zip');
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
    expect(res.body.serviceMobileIosUrl).toBe(DEFAULT_SERVICE_MOBILE_IOS_URL);
    expect(res.body.serviceCloudAppUrl).toBe(DEFAULT_SERVICE_CLOUD_APP_URL);
    await pool.query('DELETE FROM platform_config WHERE key = $1', [MOBILE_KEY]);
  });
});
