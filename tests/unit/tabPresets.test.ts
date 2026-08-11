import { describe, expect, it } from 'vitest';
import {
  CUSTOM_TAB_PRESET,
  fillMissingTabPresetKeys,
  getTabPreset,
  getToggleableNavTabs,
  isBusinessTypeWithCustom,
  isMiracleBooksFamilyVisible,
  isMiracleBooksTabId,
  isNamedBusinessType,
  isPermissionModuleRelevant,
  isStaleHotelQuotationsOff,
  isTabVisibleForUser,
  isToggleableTabId,
  MIRACLE_BOOKS_TAB_IDS,
  NAMED_BUSINESS_TYPES,
  PERMISSION_MODULE_TAB_KEY,
  setMiracleBooksFamilyVisible,
  TAB_PRESETS,
  tabToggleKeys,
  tabToggleKeysForSa,
} from '../../shared/tabPresets';

describe('tabPresets', () => {
  it('includes silver_casting and hotel_restaurant among named types', () => {
    expect(NAMED_BUSINESS_TYPES).toContain('silver_casting');
    expect(NAMED_BUSINESS_TYPES).toContain('hotel_restaurant');
    expect(NAMED_BUSINESS_TYPES).not.toContain('accounting');
    expect(isNamedBusinessType('silver_casting')).toBe(true);
    expect(isNamedBusinessType('hotel_restaurant')).toBe(true);
    expect(isNamedBusinessType('accounting')).toBe(false);
    expect(isBusinessTypeWithCustom('custom')).toBe(true);
    expect(isNamedBusinessType('custom')).toBe(false);
  });

  it('manufacturer exposes Miracle import alongside ops tabs', () => {
    const p = TAB_PRESETS.manufacturer;
    expect(p.masters.visible).toBe(true);
    expect(p.invoices.visible).toBe(true);
    expect(p.book_import.visible).toBe(true);
    expect(p.books.visible).toBe(true);
  });

  it('service exposes Books hub + Miracle import with clients/invoices/finance (no stock chain)', () => {
    const p = TAB_PRESETS.service;
    expect(p.book_import.visible).toBe(true);
    expect(p.books.visible).toBe(true);
    expect(p.book_ledgers.visible).toBe(true);
    expect(p.masters.visible).toBe(true);
    expect(p.masters.label).toBe('Clients');
    expect(p.invoices.visible).toBe(true);
    expect(p.finance.visible).toBe(true);
    expect(p.finance.label).toBe('Collections');
    expect(p.inventory.visible).toBe(false);
    expect(p.distribution.visible).toBe(false);
    expect(p.warranty.visible).toBe(false);
  });

  it('dealer exposes full Books hub for Miracle onboarding', () => {
    const p = TAB_PRESETS.dealer;
    expect(p.books.visible).toBe(true);
    expect(p.book_import.visible).toBe(true);
    expect(p.book_vouchers.visible).toBe(true);
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
    expect(p.books.visible).toBe(true);
    expect(p.book_import.visible).toBe(true);
  });

  it('retail and hotel_restaurant expose Books hub under Accounts', () => {
    expect(TAB_PRESETS.retail.books.visible).toBe(true);
    expect(TAB_PRESETS.retail.book_import.visible).toBe(true);
    expect(TAB_PRESETS.hotel_restaurant.books.visible).toBe(true);
    expect(TAB_PRESETS.hotel_restaurant.book_import.visible).toBe(true);
    expect(CUSTOM_TAB_PRESET.books.visible).toBe(true);
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
    expect(p.analytics.visible).toBe(true);
    expect(p.masters.visible).toBe(false);
    expect(p.inventory.visible).toBe(false);
    expect(p.distribution.visible).toBe(false);
    expect(p.purchases.visible).toBe(false);
    expect(p.accounts.visible).toBe(true);
    expect(p.quotations.visible).toBe(true);
    expect(p.quotations.label).toBe('Party Quotes');
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

  it('fillMissingTabPresetKeys restores hosp_menu / accounts for old hotel tab_config', () => {
    const stale = {
      analytics: { label: 'Analytics', visible: true },
      masters: { label: 'Masters', visible: false },
      finance: { label: 'Invoice Finance', visible: true },
      // hosp_menu / accounts intentionally absent (pre-hospitality save)
    };
    const merged = fillMissingTabPresetKeys(stale, 'hotel_restaurant');
    expect(merged.hosp_menu.visible).toBe(true);
    expect(merged.hosp_menu.label).toBe('Menu');
    expect(merged.hosp_floor.visible).toBe(true);
    expect(merged.accounts.visible).toBe(true);
    expect(merged.masters.visible).toBe(false); // stored wins
    // manufacturer unchanged when missing keys filled from mfg preset
    const mfg = fillMissingTabPresetKeys({ analytics: { label: 'A', visible: true } }, 'manufacturer');
    expect(mfg.hosp_menu.visible).toBe(false);
  });

  it('migrates stale hotel Quotes & Orders off → Party Quotes on; keeps SA Party Quotes off', () => {
    expect(isStaleHotelQuotationsOff({ label: 'Quotes & Orders', visible: false })).toBe(true);
    expect(isStaleHotelQuotationsOff({ label: 'Party Quotes', visible: false })).toBe(false);

    const fromOldPreset = fillMissingTabPresetKeys(
      {
        masters: { label: 'Masters', visible: false },
        quotations: { label: 'Quotes & Orders', visible: false },
      },
      'hotel_restaurant',
    );
    expect(fromOldPreset.quotations.visible).toBe(true);
    expect(fromOldPreset.quotations.label).toBe('Party Quotes');
    expect(fromOldPreset.masters.visible).toBe(false);

    const saOff = fillMissingTabPresetKeys(
      {
        quotations: { label: 'Party Quotes', visible: false },
        hosp_floor: { label: 'Floor', visible: true },
      },
      'hotel_restaurant',
    );
    expect(saOff.quotations.visible).toBe(false);
    expect(saOff.quotations.label).toBe('Party Quotes');
  });

  it('tabToggleKeys includes hospitality + quotations for hotel_restaurant', () => {
    const keys = tabToggleKeys('hotel_restaurant');
    expect(keys).toContain('quotations');
    expect(keys).toContain('analytics');
    expect(keys).toContain('accounts');
    expect(keys).toContain('hosp_floor');
    expect(keys).toContain('hosp_waiter');
    expect(keys).toContain('hosp_kitchen');
    expect(keys).toContain('hosp_queue');
    expect(keys).toContain('hosp_parcels');
    expect(keys).toContain('hosp_menu');
    expect(keys).toContain('hosp_members');
    expect(keys).toContain('masters');
  });

  it('SA toggle list collapses Miracle/Books into one books row', () => {
    const sa = tabToggleKeysForSa('service');
    expect(sa).toContain('books');
    expect(sa).not.toContain('book_import');
    expect(sa).not.toContain('book_ledgers');
    expect(sa).not.toContain('book_vouchers');
    expect(sa).not.toContain('book_products');
    expect(tabToggleKeys('service')).toContain('book_import');
  });

  it('setMiracleBooksFamilyVisible flips the whole Miracle family', () => {
    const on = setMiracleBooksFamilyVisible(getTabPreset('retail'), true);
    expect(isMiracleBooksFamilyVisible(on)).toBe(true);
    for (const id of MIRACLE_BOOKS_TAB_IDS) expect(on[id].visible).toBe(true);

    const off = setMiracleBooksFamilyVisible(on, false);
    expect(isMiracleBooksFamilyVisible(off)).toBe(false);
    for (const id of MIRACLE_BOOKS_TAB_IDS) expect(off[id].visible).toBe(false);
    expect(isMiracleBooksTabId('book_import')).toBe(true);
    expect(isMiracleBooksTabId('finance')).toBe(false);
  });

  describe('isToggleableTabId', () => {
    it('excludes settings and chatbot from the per-device Settings toggle', () => {
      expect(isToggleableTabId('settings')).toBe(false);
      expect(isToggleableTabId('chatbot')).toBe(false);
    });

    it('includes every other nav tab id, for every business type', () => {
      for (const id of [
        'analytics',
        'masters',
        'inventory',
        'distribution',
        'sales',
        'purchases',
        'verification',
        'quotations',
        'invoices',
        'finance',
        'accounts',
        'warranty',
        'replacements',
        'rewards',
        'hosp_floor',
        'hosp_waiter',
        'hosp_kitchen',
        'hosp_queue',
        'hosp_menu',
        'hosp_parcels',
        'hosp_members',
      ]) {
        expect(isToggleableTabId(id)).toBe(true);
      }
    });
  });

  describe('getToggleableNavTabs (Settings toggle list — SA on/off gating)', () => {
    it('SA-on tabs get a toggle; SA-off tabs get no toggle, for every named business type', () => {
      for (const businessType of NAMED_BUSINESS_TYPES) {
        const preset = getTabPreset(businessType);
        const toggles = getToggleableNavTabs(preset);
        const toggleIds = new Set(toggles.map(t => t.id));
        const miracleOn = isMiracleBooksFamilyVisible(preset);
        for (const [id, cfg] of Object.entries(preset)) {
          if (!isToggleableTabId(id)) {
            expect(toggleIds.has(id)).toBe(false);
            continue;
          }
          if (isMiracleBooksTabId(id)) {
            // Family collapses to a single `books` Settings toggle
            expect(toggleIds.has(id)).toBe(id === 'books' && miracleOn);
            continue;
          }
          expect(toggleIds.has(id)).toBe(cfg.visible !== false);
        }
      }
    });

    it('Miracle family appears once as books in Settings toggles', () => {
      const toggles = getToggleableNavTabs(getTabPreset('service'));
      const ids = toggles.map(t => t.id);
      expect(ids).toContain('books');
      expect(ids).not.toContain('book_import');
      expect(ids).not.toContain('book_ledgers');
      expect(toggles.find(t => t.id === 'books')?.label).toBe('Ledgers & vouchers');
    });

    it('never lists settings or chatbot even though they default visible', () => {
      const toggles = getToggleableNavTabs(getTabPreset('manufacturer'));
      expect(toggles.some(t => t.id === 'settings')).toBe(false);
      expect(toggles.some(t => t.id === 'chatbot')).toBe(false);
    });

    it('reacts live when Super Admin flips a tab off — no stale toggle left behind', () => {
      const on = fillMissingTabPresetKeys({ finance: { label: 'Finance', visible: true } }, 'manufacturer');
      expect(getToggleableNavTabs(on).some(t => t.id === 'finance')).toBe(true);

      const off = fillMissingTabPresetKeys({ finance: { label: 'Finance', visible: false } }, 'manufacturer');
      expect(getToggleableNavTabs(off).some(t => t.id === 'finance')).toBe(false);
    });

    it('hotel_restaurant: hospitality tabs get toggles, hidden supply-chain tabs do not', () => {
      const toggles = getToggleableNavTabs(getTabPreset('hotel_restaurant'));
      const toggleIds = new Set(toggles.map(t => t.id));
      expect(toggleIds.has('hosp_floor')).toBe(true);
      expect(toggleIds.has('hosp_waiter')).toBe(true);
      expect(toggleIds.has('accounts')).toBe(true);
      // SA-off for hotel_restaurant — must not appear
      expect(toggleIds.has('masters')).toBe(false);
      expect(toggleIds.has('inventory')).toBe(false);
      expect(toggleIds.has('distribution')).toBe(false);
    });

    it('uses the Super Admin-set label so the toggle matches the nav item exactly', () => {
      const toggles = getToggleableNavTabs(getTabPreset('dealer'));
      const distribution = toggles.find(t => t.id === 'distribution');
      expect(distribution?.label).toBe('Sales');
    });
  });

  describe('isPermissionModuleRelevant (Settings → Users permission checkbox gating)', () => {
    it('dashboard maps to the analytics tab, not a literal "dashboard" key', () => {
      expect(PERMISSION_MODULE_TAB_KEY.dashboard).toBe('analytics');
    });

    it('service tenant: hides Warranty / Rewards / Replacements / Inventory / Distribution modules', () => {
      const cfg = getTabPreset('service');
      expect(isPermissionModuleRelevant('warranty', cfg)).toBe(false);
      expect(isPermissionModuleRelevant('rewards', cfg)).toBe(false);
      expect(isPermissionModuleRelevant('replacements', cfg)).toBe(false);
      expect(isPermissionModuleRelevant('inventory', cfg)).toBe(false);
      expect(isPermissionModuleRelevant('distribution', cfg)).toBe(false);
      // still relevant for service
      expect(isPermissionModuleRelevant('dashboard', cfg)).toBe(true);
      expect(isPermissionModuleRelevant('purchases', cfg)).toBe(true);
      expect(isPermissionModuleRelevant('finance', cfg)).toBe(true);
      expect(isPermissionModuleRelevant('settings', cfg)).toBe(true);
    });

    it('manufacturer tenant: every module is relevant by default', () => {
      const cfg = getTabPreset('manufacturer');
      for (const id of Object.keys(PERMISSION_MODULE_TAB_KEY)) {
        expect(isPermissionModuleRelevant(id, cfg)).toBe(true);
      }
    });

    it('respects a Super Admin override on top of the business-type preset', () => {
      const cfg = fillMissingTabPresetKeys({ finance: { label: 'Finance', visible: false } }, 'manufacturer');
      expect(isPermissionModuleRelevant('finance', cfg)).toBe(false);
      // untouched keys keep the manufacturer default (visible)
      expect(isPermissionModuleRelevant('accounts', cfg)).toBe(true);
    });
  });

  describe('isTabVisibleForUser (App shell tv() policy)', () => {
    const config = fillMissingTabPresetKeys(
      { finance: { label: 'Finance', visible: true }, masters: { label: 'Masters', visible: false } },
      'manufacturer',
    );

    it('Super Admin OFF always hides the tab, regardless of the device pref', () => {
      expect(isTabVisibleForUser('masters', config, true)).toBe(false);
      expect(isTabVisibleForUser('masters', config, false)).toBe(false);
    });

    it('Super Admin ON + toggleable tab defers to the device pref', () => {
      expect(isTabVisibleForUser('finance', config, true)).toBe(true);
      expect(isTabVisibleForUser('finance', config, false)).toBe(false);
    });

    it('non-toggleable tabs (settings) ignore the device pref once Super Admin allows them', () => {
      expect(isTabVisibleForUser('settings', config, false)).toBe(true);
    });
  });
});
