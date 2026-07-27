import { describe, expect, it } from 'vitest';
import {
  CUSTOM_TAB_PRESET,
  getTabPreset,
  isBusinessTypeWithCustom,
  isNamedBusinessType,
  NAMED_BUSINESS_TYPES,
  TAB_PRESETS,
} from '../../shared/tabPresets';

describe('tabPresets', () => {
  it('includes silver_casting and hotel_restaurant among named types', () => {
    expect(NAMED_BUSINESS_TYPES).toContain('silver_casting');
    expect(NAMED_BUSINESS_TYPES).toContain('hotel_restaurant');
    expect(isNamedBusinessType('silver_casting')).toBe(true);
    expect(isNamedBusinessType('hotel_restaurant')).toBe(true);
    expect(isBusinessTypeWithCustom('custom')).toBe(true);
    expect(isNamedBusinessType('custom')).toBe(false);
  });

  it('silver_casting preset exposes metal stock + counter sale, hides warranty', () => {
    const p = TAB_PRESETS.silver_casting;
    expect(p.inventory.label).toBe('Metal Stock');
    expect(p.inventory.visible).toBe(true);
    expect(p.sales.label).toBe('Counter Sale');
    expect(p.sales.visible).toBe(true);
    expect(p.finance.label).toBe('Party Payments');
    expect(p.warranty.visible).toBe(false);
    expect(p.rewards.visible).toBe(false);
    expect(p.replacements.visible).toBe(false);
  });

  it('hotel_restaurant preset enables hospitality tabs and hides supply-chain tabs', () => {
    const p = TAB_PRESETS.hotel_restaurant;
    expect(p.hosp_floor.visible).toBe(true);
    expect(p.hosp_waiter.visible).toBe(true);
    expect(p.hosp_kitchen.visible).toBe(true);
    expect(p.hosp_queue.visible).toBe(true);
    expect(p.hosp_parcels.visible).toBe(true);
    expect(p.hosp_menu.visible).toBe(true);
    expect(p.hosp_members.visible).toBe(true);
    expect(p.analytics.visible).toBe(false);
    expect(p.masters.visible).toBe(false);
    expect(p.inventory.visible).toBe(false);
    expect(p.distribution.visible).toBe(false);
    expect(p.purchases.visible).toBe(false);
    expect(p.accounts.visible).toBe(false);
    expect(p.warranty.visible).toBe(false);
    expect(p.invoices.visible).toBe(true);
    expect(p.finance.visible).toBe(true);
    expect(p.settings.visible).toBe(true);
    // other types keep hospitality tabs hidden by default
    expect(TAB_PRESETS.manufacturer.hosp_floor.visible).toBe(false);
    expect(TAB_PRESETS.manufacturer.hosp_parcels.visible).toBe(false);
  });

  it('getTabPreset falls back to manufacturer and clones', () => {
    const a = getTabPreset('unknown-type');
    const b = getTabPreset('manufacturer');
    expect(a.inventory.label).toBe(b.inventory.label);
    a.inventory.label = 'Mutated';
    expect(TAB_PRESETS.manufacturer.inventory.label).toBe('Inventory');
  });

  it('custom preset keeps all tabs visible', () => {
    expect(CUSTOM_TAB_PRESET.warranty.visible).toBe(true);
    expect(CUSTOM_TAB_PRESET.inventory.visible).toBe(true);
    expect(getTabPreset('custom').sales.visible).toBe(true);
  });
});
