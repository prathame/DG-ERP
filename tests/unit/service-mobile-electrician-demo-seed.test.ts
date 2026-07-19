import { describe, expect, it } from 'vitest';
import {
  ELECTRICIAN_DEMO_CLIENTS,
  ELECTRICIAN_DEMO_PRICE_ITEMS,
} from '../../src/platforms/service-mobile/local/electricianDemoData';
import fixture from '../fixtures/service-mobile/electrician-demo.json';

describe('electrician offline demo data', () => {
  it('matches test fixture counts and catalog prices', () => {
    expect(ELECTRICIAN_DEMO_CLIENTS).toHaveLength(fixture.clients.length);
    expect(ELECTRICIAN_DEMO_PRICE_ITEMS).toHaveLength(fixture.priceList.length);
    for (const row of fixture.priceList) {
      const found = ELECTRICIAN_DEMO_PRICE_ITEMS.find(p => p.productName === row.productName);
      expect(found?.price).toBe(row.price);
    }
  });
});
