/** Single source of truth for business-type tab presets (cloud + on-prem + SA UI). */

export type TabConfigEntry = { label: string; visible: boolean };
export type TabConfig = Record<string, TabConfigEntry>;

export const NAMED_BUSINESS_TYPES = [
  'manufacturer',
  'dealer',
  'retail',
  'service',
  'silver_casting',
  'hotel_restaurant',
] as const;

export type NamedBusinessType = (typeof NAMED_BUSINESS_TYPES)[number];

export const BUSINESS_TYPES_WITH_CUSTOM = [...NAMED_BUSINESS_TYPES, 'custom'] as const;

const baseAllVisible = (overrides: Partial<TabConfig> = {}): TabConfig => ({
  analytics: { label: 'Analytics', visible: true },
  masters: { label: 'Masters', visible: true },
  inventory: { label: 'Inventory', visible: true },
  distribution: { label: 'Dispatch', visible: true },
  sales: { label: 'Warranty Registration', visible: true },
  purchases: { label: 'Purchases', visible: true },
  verification: { label: 'Search / Verify', visible: true },
  quotations: { label: 'Quotes & Orders', visible: true },
  invoices: { label: 'Invoices', visible: true },
  finance: { label: 'Vendor Payments', visible: true },
  accounts: { label: 'Accounts', visible: true },
  warranty: { label: 'Warranty', visible: true },
  replacements: { label: 'Replacements', visible: true },
  rewards: { label: 'Rewards', visible: true },
  chatbot: { label: 'Chatbot', visible: true },
  settings: { label: 'Settings', visible: true },
  // Hospitality tabs — off by default; hotel_restaurant preset enables them
  hosp_floor: { label: 'Floor', visible: false },
  hosp_waiter: { label: 'Waiter Orders', visible: false },
  hosp_kitchen: { label: 'Kitchen', visible: false },
  hosp_queue: { label: 'Entry Queue', visible: false },
  hosp_menu: { label: 'Menu & Tables', visible: false },
  hosp_parcels: { label: 'Parcels', visible: false },
  hosp_members: { label: 'Members', visible: false },
  ...overrides,
});

export const TAB_PRESETS: Record<NamedBusinessType, TabConfig> = {
  manufacturer: baseAllVisible(),
  dealer: baseAllVisible({
    distribution: { label: 'Sales', visible: true },
    sales: { label: 'Sales Entry', visible: false },
    finance: { label: 'Dealer Payments', visible: true },
    warranty: { label: 'Warranty', visible: false },
    replacements: { label: 'Replacements', visible: false },
    rewards: { label: 'Rewards', visible: false },
  }),
  retail: baseAllVisible({
    inventory: { label: 'Stock', visible: true },
    distribution: { label: 'Purchase', visible: true },
    sales: { label: 'Sales Entry', visible: false },
    finance: { label: 'Supplier Payments', visible: true },
    warranty: { label: 'Warranty', visible: false },
    replacements: { label: 'Replacements', visible: false },
    rewards: { label: 'Rewards', visible: false },
  }),
  service: baseAllVisible({
    inventory: { label: 'Inventory', visible: false },
    distribution: { label: 'Distribution', visible: false },
    sales: { label: 'Sales Entry', visible: false },
    purchases: { label: 'Expenses', visible: true },
    verification: { label: 'Search / Verify', visible: false },
    finance: { label: 'Invoice Finance', visible: true },
    warranty: { label: 'Warranty', visible: false },
    replacements: { label: 'Replacements', visible: false },
    rewards: { label: 'Rewards', visible: false },
  }),
  silver_casting: baseAllVisible({
    inventory: { label: 'Metal Stock', visible: true },
    distribution: { label: 'Sales', visible: true },
    sales: { label: 'Counter Sale', visible: true },
    finance: { label: 'Party Payments', visible: true },
    warranty: { label: 'Warranty', visible: false },
    replacements: { label: 'Replacements', visible: false },
    rewards: { label: 'Rewards', visible: false },
  }),
  hotel_restaurant: baseAllVisible({
    analytics: { label: 'Analytics', visible: true },
    masters: { label: 'Masters', visible: false },
    inventory: { label: 'Inventory', visible: false },
    distribution: { label: 'Distribution', visible: false },
    sales: { label: 'Sales Entry', visible: false },
    purchases: { label: 'Expenses', visible: false },
    verification: { label: 'Search / Verify', visible: false },
    quotations: { label: 'Party Quotes', visible: true },
    accounts: { label: 'Accounts', visible: true },
    chatbot: { label: 'Chatbot', visible: false },
    finance: { label: 'Invoice Finance', visible: true },
    warranty: { label: 'Warranty', visible: false },
    replacements: { label: 'Replacements', visible: false },
    rewards: { label: 'Rewards', visible: false },
    hosp_floor: { label: 'Floor', visible: true },
    hosp_waiter: { label: 'Waiter Orders', visible: true },
    hosp_kitchen: { label: 'Kitchen', visible: true },
    hosp_queue: { label: 'Entry Queue', visible: true },
    hosp_parcels: { label: 'Parcels', visible: true },
    hosp_menu: { label: 'Menu', visible: true },
    hosp_members: { label: 'Members', visible: true },
  }),
};

/** Custom: all tabs visible — Super Admin configures manually after create */
export const CUSTOM_TAB_PRESET: TabConfig = baseAllVisible({
  distribution: { label: 'Distribution', visible: true },
  sales: { label: 'Sales Entry', visible: true },
  finance: { label: 'Finance', visible: true },
});

function cloneTabConfig(src: TabConfig): TabConfig {
  return Object.fromEntries(
    Object.entries(src).map(([key, value]) => [key, { label: value.label, visible: value.visible }]),
  );
}

export function getTabPreset(businessType?: string | null): TabConfig {
  if (businessType === 'custom') return cloneTabConfig(CUSTOM_TAB_PRESET);
  if (businessType && businessType in TAB_PRESETS) {
    return cloneTabConfig(TAB_PRESETS[businessType as NamedBusinessType]);
  }
  return cloneTabConfig(TAB_PRESETS.manufacturer);
}

/** Ordered keys for Super Admin / on-prem tab toggle UIs (same surface for all verticals). */
export function tabToggleKeys(businessType?: string | null): string[] {
  return Object.keys(getTabPreset(businessType));
}

/**
 * Old hotel_restaurant preset (#172) hid quotations as "Quotes & Orders".
 * #181 renamed to Party Quotes + visible. Fingerprint SA-off as Party Quotes / custom label.
 */
const STALE_HOTEL_QUOTATION_LABELS = new Set(['Quotes & Orders', 'Quotations']);

/** True when stored hotel quotations still match the pre–Party Quotes default hide. */
export function isStaleHotelQuotationsOff(stored: { label?: string; visible?: boolean } | null | undefined): boolean {
  if (!stored || typeof stored !== 'object') return false;
  if (stored.visible !== false) return false;
  const label = typeof stored.label === 'string' ? stored.label.trim() : '';
  // Empty label + false: treat as stale incomplete hide (old saves), not SA Party Quotes off
  if (!label) return true;
  return STALE_HOTEL_QUOTATION_LABELS.has(label);
}

/**
 * Fill keys missing from a stored tenant tab_config from the business-type preset.
 * Stored values win when present (incl. explicit visible:false), except hotel quotations
 * that still match the old #172 hide fingerprint — those migrate to Party Quotes on.
 * SA toggle of Party Quotes off (label "Party Quotes" or custom) is preserved.
 */
export function fillMissingTabPresetKeys(
  stored: TabConfig | Record<string, { label?: string; visible?: boolean }> | null | undefined,
  businessType?: string | null,
): TabConfig {
  const preset = getTabPreset(businessType);
  if (!stored || typeof stored !== 'object') return preset;
  const out: TabConfig = {};
  for (const [key, value] of Object.entries(stored)) {
    if (!value || typeof value !== 'object') continue;
    out[key] = {
      label: typeof value.label === 'string' && value.label ? value.label : (preset[key]?.label ?? key),
      visible: value.visible !== false,
    };
  }
  for (const [key, value] of Object.entries(preset)) {
    if (!(key in out)) out[key] = { label: value.label, visible: value.visible };
  }
  if (businessType === 'hotel_restaurant') {
    const rawQ =
      stored.quotations && typeof stored.quotations === 'object'
        ? (stored.quotations as { label?: string; visible?: boolean })
        : null;
    if (!rawQ || isStaleHotelQuotationsOff(rawQ)) {
      out.quotations = { label: 'Party Quotes', visible: true };
    } else if (
      out.quotations &&
      out.quotations.visible !== false &&
      STALE_HOTEL_QUOTATION_LABELS.has(out.quotations.label)
    ) {
      out.quotations = { ...out.quotations, label: 'Party Quotes' };
    }
  }
  return out;
}

export function isNamedBusinessType(value: unknown): value is NamedBusinessType {
  return typeof value === 'string' && (NAMED_BUSINESS_TYPES as readonly string[]).includes(value);
}

export function isBusinessTypeWithCustom(value: unknown): boolean {
  return typeof value === 'string' && (BUSINESS_TYPES_WITH_CUSTOM as readonly string[]).includes(value);
}
