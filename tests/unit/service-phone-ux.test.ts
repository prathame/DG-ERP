import { describe, expect, it } from 'vitest';
import { isServicePhoneUx } from '../../src/platforms/service-cloud/mode';
import { isServiceMobileMode } from '../../src/platforms/service-mobile/mode';

describe('isServicePhoneUx', () => {
  it('is true whenever Offline Mobile mode is on', () => {
    // Vitest for this repo often runs without VITE_DEPLOYMENT_MODE=service-mobile;
    // when it is set (service-mobile test scripts), helper must follow Offline.
    if (isServiceMobileMode()) {
      expect(isServicePhoneUx('service')).toBe(true);
      expect(isServicePhoneUx('manufacturer')).toBe(true);
      expect(isServicePhoneUx(null)).toBe(true);
    } else {
      // Cloud browser / non-Capacitor: service type alone is not enough
      expect(isServicePhoneUx('service')).toBe(false);
      expect(isServicePhoneUx('manufacturer')).toBe(false);
    }
  });
});
