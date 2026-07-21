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
  it('includes silver_casting among named types', () => {
    expect(NAMED_BUSINESS_TYPES).toContain('silver_casting');
    expect(isNamedBusinessType('silver_casting')).toBe(true);
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
