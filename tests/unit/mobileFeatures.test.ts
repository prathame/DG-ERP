import { describe, expect, it } from 'vitest';
import { defaultMobileFeatures, mobileFeatureAllowsTab, normalizeMobileFeatures } from '../../shared/mobileFeatures';

describe('mobileFeatures', () => {
  it('defaults silver casting without quotations', () => {
    const f = defaultMobileFeatures('silver_casting');
    expect(f.quotations).toBe(false);
    expect(f.stock).toBe(true);
  });

  it('normalizes partial payloads', () => {
    const f = normalizeMobileFeatures({ stock: false }, 'manufacturer');
    expect(f.stock).toBe(false);
    expect(f.sales).toBe(true);
  });

  it('maps features to tabs', () => {
    const f = normalizeMobileFeatures({
      stock: true,
      sales: false,
      quotations: false,
      collections: true,
      reports: false,
      chatbot: true,
    });
    expect(mobileFeatureAllowsTab('inventory', f)).toBe(true);
    expect(mobileFeatureAllowsTab('invoices', f)).toBe(false);
    expect(mobileFeatureAllowsTab('finance', f)).toBe(true);
    expect(mobileFeatureAllowsTab('chatbot', f)).toBe(true);
    expect(mobileFeatureAllowsTab('settings', f)).toBe(false);
  });

  it('defaults chatbot off for companion pack', () => {
    expect(defaultMobileFeatures('manufacturer').chatbot).toBe(false);
  });
});
