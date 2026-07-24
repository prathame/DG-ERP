import { describe, it, expect } from 'vitest';
import { api } from '../http';

/** Capacitor WebView + local Vite origins must be able to call public activate without CORS/CORP blocking. */
const CAPACITOR_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', 'ionic://localhost'];
const LOOPBACK_ORIGINS = ['http://localhost:3000', 'http://localhost:3010', 'http://127.0.0.1:3000'];

describe('CORS for Capacitor (Offline Mobile)', () => {
  for (const origin of [...CAPACITOR_ORIGINS, ...LOOPBACK_ORIGINS]) {
    it(`allows Origin ${origin} on service-mobile activate`, async () => {
      const res = await api().post('/api/service-mobile/activate').set('Origin', origin).send({
        licenseKey: 'DG-SM-CORS-PROBE',
        machineId: '0123456789abcdef0123456789abcdef',
      });
      expect(res.headers['access-control-allow-origin']).toBe(origin);
      expect(String(res.headers['cross-origin-resource-policy'] || '')).toMatch(/cross-origin/i);
      // Key may not exist — we only assert the browser can read the response
      expect([400, 404, 403]).toContain(res.status);
    });
  }

  it('does not reflect arbitrary Origin', async () => {
    const res = await api().post('/api/service-mobile/activate').set('Origin', 'https://evil.example').send({
      licenseKey: 'DG-SM-CORS-PROBE',
      machineId: '0123456789abcdef0123456789abcdef',
    });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('preflight allows Idempotency-Key for Cap payment POSTs', async () => {
    const origin = 'https://localhost';
    const res = await api()
      .options('/api/vendor-finance/v1/payments')
      .set('Origin', origin)
      .set('Access-Control-Request-Method', 'POST')
      .set(
        'Access-Control-Request-Headers',
        'content-type,authorization,x-tenant-id,x-correlation-id,x-dg-client,idempotency-key',
      );
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
    const allow = String(res.headers['access-control-allow-headers'] || '').toLowerCase();
    expect(allow).toContain('idempotency-key');
  });
});
