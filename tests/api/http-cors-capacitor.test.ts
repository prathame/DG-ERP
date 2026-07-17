import { describe, it, expect } from 'vitest';
import { api } from '../http';

/** Capacitor WebView origins must be able to call public activate without CORS/CORP blocking. */
const CAPACITOR_ORIGINS = ['https://localhost', 'capacitor://localhost', 'http://localhost', 'ionic://localhost'];

describe('CORS for Capacitor (Offline Mobile)', () => {
  for (const origin of CAPACITOR_ORIGINS) {
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
});
