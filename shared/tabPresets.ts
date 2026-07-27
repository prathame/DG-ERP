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
    analytics: { label: 'Analytics', visible: false },
    masters: { label: 'Masters', visible: false },
    inventory: { label: 'Inventory', visible: false },
    distribution: { label: 'Distribution', visible: false },
    sales: { label: 'Sales Entry', visible: false },
    purchases: { label: 'Expenses', visible: false },
    verification: { label: 'Search / Verify', visible: false },
    quotations: { label: 'Quotes & Orders', visible: false },
    accounts: { label: 'Accounts', visible: false },
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

export function isNamedBusinessType(value: unknown): value is NamedBusinessType {
  return typeof value === 'string' && (NAMED_BUSINESS_TYPES as readonly string[]).includes(value);
}

export function isBusinessTypeWithCustom(value: unknown): boolean {
  return typeof value === 'string' && (BUSINESS_TYPES_WITH_CUSTOM as readonly string[]).includes(value);
}
