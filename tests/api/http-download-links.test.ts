import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { api } from '../http';
import { pool } from '../helpers';
import { DEFAULT_SERVICE_MOBILE_APP_URL } from '../../server/download-defaults';

const KEY = 'service_mobile_app_url';

describe('GET /api/download-links', () => {
  let previous: string | null | undefined;

  beforeAll(async () => {
    const row = (await pool.query('SELECT value FROM platform_config WHERE key = $1', [KEY])).rows[0] as
      { value: string | null } | undefined;
    previous = row ? row.value : undefined;
    await pool.query('DELETE FROM platform_config WHERE key = $1', [KEY]);
  });

  afterAll(async () => {
    if (previous === undefined) {
      await pool.query('DELETE FROM platform_config WHERE key = $1', [KEY]);
    } else {
      await pool.query(
        'INSERT INTO platform_config (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
        [KEY, previous],
      );
    }
  });

  it('returns evergreen Offline Mobile APK when platform_config is unset', async () => {
    const res = await api().get('/api/download-links');
    expect(res.status).toBe(200);
    expect(res.body.serviceMobileAppUrl).toBe(DEFAULT_SERVICE_MOBILE_APP_URL);
    expect(res.body.serviceMobileAppUrl).toContain('/releases/download/offline-mobile/');
  });

  it('prefers platform_config override when set', async () => {
    const override = 'https://example.com/custom-offline.apk';
    await pool.query(
      'INSERT INTO platform_config (key, value, updated_at) VALUES ($1,$2,NOW()) ON CONFLICT (key) DO UPDATE SET value=$2, updated_at=NOW()',
      [KEY, override],
    );
    const res = await api().get('/api/download-links');
    expect(res.status).toBe(200);
    expect(res.body.serviceMobileAppUrl).toBe(override);
    await pool.query('DELETE FROM platform_config WHERE key = $1', [KEY]);
  });
});
