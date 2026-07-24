import { describe, expect, it } from 'vitest';
import {
  defaultMobileFeatures,
  mobileFeatureAllowsTab,
  mobileFeatureOptions,
  normalizeMobileFeatures,
} from '../../shared/mobileFeatures';

describe('mobileFeatures', () => {
  it('defaults from business-type tab preset', () => {
    const mfg = defaultMobileFeatures('manufacturer');
    expect(mfg.inventory).toBe(true);
    expect(mfg.warranty).toBe(true);
    expect(mfg.chatbot).toBe(false);

    const dealer = defaultMobileFeatures('dealer');
    expect(dealer.warranty).toBe(false);
    expect(dealer.rewards).toBe(false);
    expect(dealer.distribution).toBe(true);
  });

  it('defaults silver casting without quotations', () => {
    const f = defaultMobileFeatures('silver_casting');
    expect(f.quotations).toBe(false);
    expect(f.inventory).toBe(true);
  });

  it('defaults service without inventory / distribution', () => {
    const f = defaultMobileFeatures('service');
    expect(f.inventory).toBe(false);
    expect(f.distribution).toBe(false);
    expect(f.invoices).toBe(true);
    expect(f.purchases).toBe(true);
  });

  it('normalizes partial tab payloads', () => {
    const f = normalizeMobileFeatures({ inventory: false }, 'manufacturer');
    expect(f.inventory).toBe(false);
    expect(f.sales).toBe(true);
  });

  it('migrates legacy companion pack keys', () => {
    const f = normalizeMobileFeatures(
      {
        stock: true,
        sales: false,
        quotations: false,
        collections: true,
        reports: false,
        chatbot: true,
      },
      'manufacturer',
    );
    expect(f.inventory).toBe(true);
    expect(f.sales).toBe(false);
    expect(f.invoices).toBe(false);
    expect(f.finance).toBe(true);
    expect(f.analytics).toBe(false);
    expect(f.accounts).toBe(false);
    expect(f.chatbot).toBe(true);
  });

  it('maps features to tabs', () => {
    const f = normalizeMobileFeatures({
      inventory: true,
      sales: false,
      invoices: false,
      quotations: false,
      finance: true,
      analytics: false,
      accounts: false,
      chatbot: true,
    });
    expect(mobileFeatureAllowsTab('inventory', f)).toBe(true);
    expect(mobileFeatureAllowsTab('invoices', f)).toBe(false);
    expect(mobileFeatureAllowsTab('finance', f)).toBe(true);
    expect(mobileFeatureAllowsTab('chatbot', f)).toBe(true);
    expect(mobileFeatureAllowsTab('settings', f)).toBe(false);
    expect(mobileFeatureAllowsTab('dashboard', f)).toBe(false);
  });

  it('filters SA checkbox options by business type', () => {
    const dealerOpts = mobileFeatureOptions('dealer').map(o => o.key);
    expect(dealerOpts).toContain('inventory');
    expect(dealerOpts).toContain('chatbot');
    expect(dealerOpts).not.toContain('warranty');
    expect(dealerOpts).not.toContain('rewards');

    const mfgOpts = mobileFeatureOptions('manufacturer').map(o => o.key);
    expect(mfgOpts).toContain('warranty');
  });

  it('defaults chatbot off for companion pack', () => {
    expect(defaultMobileFeatures('manufacturer').chatbot).toBe(false);
  });
});
