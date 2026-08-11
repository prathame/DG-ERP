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
  // Books / Miracle — off by default; mfr / dealer / service enable the Books hub (+ import panel)
  // Sidebar shows a single Books entry; book_* remain for SA toggles / deep links / BooksView panels
  books: { label: 'Books', visible: false },
  book_ledgers: { label: 'Ledgers', visible: false },
  book_vouchers: { label: 'Vouchers', visible: false },
  book_products: { label: 'Book Products', visible: false },
  book_import: { label: 'Data import', visible: false },
  ...overrides,
});

export const TAB_PRESETS: Record<NamedBusinessType, TabConfig> = {
  /** Die / job-work / manufacturing — Miracle CMP import available for onboarding */
  manufacturer: baseAllVisible({
    books: { label: 'Books', visible: true },
    book_ledgers: { label: 'Ledgers', visible: true },
    book_vouchers: { label: 'Vouchers', visible: true },
    book_products: { label: 'Book Products', visible: true },
    book_import: { label: 'Data import', visible: true },
  }),
  dealer: baseAllVisible({
    distribution: { label: 'Sales', visible: true },
    sales: { label: 'Sales Entry', visible: false },
    finance: { label: 'Dealer Payments', visible: true },
    warranty: { label: 'Warranty', visible: false },
    replacements: { label: 'Replacements', visible: false },
    rewards: { label: 'Rewards', visible: false },
    books: { label: 'Books', visible: true },
    book_ledgers: { label: 'Ledgers', visible: true },
    book_vouchers: { label: 'Vouchers', visible: true },
    book_products: { label: 'Book Products', visible: true },
    book_import: { label: 'Data import', visible: true },
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
  /** Service / consulting — Miracle CMP → clients, invoices & payments; Books hub for COA/vouchers */
  service: baseAllVisible({
    /** Sidebar: Clients hub (Directory + Collections); finance tab id kept for deep links / SA */
    masters: { label: 'Clients', visible: true },
    inventory: { label: 'Inventory', visible: false },
    distribution: { label: 'Distribution', visible: false },
    sales: { label: 'Sales Entry', visible: false },
    purchases: { label: 'Expenses', visible: true },
    verification: { label: 'Search / Verify', visible: false },
    finance: { label: 'Collections', visible: true },
    warranty: { label: 'Warranty', visible: false },
    replacements: { label: 'Replacements', visible: false },
    rewards: { label: 'Rewards', visible: false },
    books: { label: 'Books', visible: true },
    book_ledgers: { label: 'Ledgers', visible: true },
    book_vouchers: { label: 'Vouchers', visible: true },
    book_products: { label: 'Book Products', visible: true },
    book_import: { label: 'Data import', visible: true },
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
 * Books desk + Miracle CMP import — one SA / Settings toggle controls the whole family.
 * Child tab ids stay in tab_config for deep links / BooksView panels.
 */
export const MIRACLE_BOOKS_TAB_IDS = [
  'books',
  'book_ledgers',
  'book_vouchers',
  'book_products',
  'book_import',
] as const;

export type MiracleBooksTabId = (typeof MIRACLE_BOOKS_TAB_IDS)[number];

export function isMiracleBooksTabId(tabId: string): boolean {
  return (MIRACLE_BOOKS_TAB_IDS as readonly string[]).includes(tabId);
}

/** SA / on-prem toggle list: collapse Miracle family to a single `books` row. */
export function tabToggleKeysForSa(businessType?: string | null): string[] {
  return tabToggleKeys(businessType).filter(id => !isMiracleBooksTabId(id) || id === 'books');
}

/** True when any Miracle/Books tab is Super-Admin ON (after fillMissingTabPresetKeys). */
export function isMiracleBooksFamilyVisible(tabConfig: TabConfig): boolean {
  return MIRACLE_BOOKS_TAB_IDS.some(id => {
    const entry = tabConfig[id];
    return entry != null && entry.visible !== false;
  });
}

/** Turn Books + Data import (+ panel deep-link tabs) on or off together. */
export function setMiracleBooksFamilyVisible(tabConfig: TabConfig, visible: boolean, preset?: TabConfig): TabConfig {
  const base = preset || tabConfig;
  const next: TabConfig = { ...tabConfig };
  for (const id of MIRACLE_BOOKS_TAB_IDS) {
    const cur = next[id] ?? base[id] ?? { label: id, visible: true };
    next[id] = { label: cur.label || base[id]?.label || id, visible };
  }
  return next;
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

/**
 * Tab ids excluded from the per-device Settings show/hide nav toggle:
 * `settings` must always stay reachable (it's the only way back to this toggle),
 * and `chatbot` is a floating widget, not a nav tab.
 */
const NON_TOGGLEABLE_TAB_IDS: ReadonlySet<string> = new Set(['settings', 'chatbot']);

export function isToggleableTabId(tabId: string): boolean {
  return !NON_TOGGLEABLE_TAB_IDS.has(tabId);
}

/**
 * Tabs eligible for a Settings show/hide toggle for this tenant: toggleable ids that
 * Super Admin has turned ON. SA-off tabs are excluded entirely (no toggle, no nav) —
 * pass a `tabConfig` already filled via `fillMissingTabPresetKeys` so missing keys
 * fall back to the business-type preset instead of looking SA-disabled.
 * Miracle/Books family collapses to a single `books` toggle.
 */
export function getToggleableNavTabs(tabConfig: TabConfig): { id: string; label: string }[] {
  const miracleOn = isMiracleBooksFamilyVisible(tabConfig);
  return Object.entries(tabConfig)
    .filter(([id, cfg]) => {
      if (!isToggleableTabId(id)) return false;
      if (isMiracleBooksTabId(id)) return id === 'books' && miracleOn;
      return cfg.visible !== false;
    })
    .map(([id, cfg]) => ({
      id,
      label: id === 'books' ? cfg.label || 'Books' : cfg.label,
    }));
}

/**
 * Single source of truth for "is this nav tab visible for the current user right now?" —
 * mirrors the app shell's `tv()`. Super Admin OFF always wins; otherwise a toggleable tab
 * defers to the per-device Settings preference (`userPrefVisible`), and non-toggleable tabs
 * (settings, chatbot) are always shown once Super Admin allows them.
 */
export function isTabVisibleForUser(tabId: string, tabConfig: TabConfig, userPrefVisible: boolean): boolean {
  if (tabConfig[tabId]?.visible === false) return false;
  if (isToggleableTabId(tabId)) return userPrefVisible;
  return true;
}

/**
 * User-permission checkbox module id → tab_config key that gates its relevance for a tenant.
 * Most module ids match a tab_config key 1:1; `dashboard` is the permission-side name for the
 * `analytics` tab (see `resolveTabAccess`'s dashboard/analytics fallback in `src/lib/tabAccess.ts`).
 */
export const PERMISSION_MODULE_TAB_KEY: Record<string, string> = {
  dashboard: 'analytics',
  sales: 'sales',
  distribution: 'distribution',
  inventory: 'inventory',
  purchases: 'purchases',
  quotations: 'quotations',
  finance: 'finance',
  accounts: 'accounts',
  warranty: 'warranty',
  replacements: 'replacements',
  rewards: 'rewards',
  settings: 'settings',
};

/**
 * True when a user-permission module should be offered in Settings → Users / SA permission
 * checkboxes for this tenant: the business-type preset uses it AND Super Admin hasn't turned
 * off the matching tab via tab_config. Pass `tabConfig` pre-filled via `fillMissingTabPresetKeys`
 * so missing SA overrides fall back to the business-type preset instead of looking disabled.
 */
export function isPermissionModuleRelevant(
  moduleId: string,
  tabConfig: Record<string, { visible?: boolean }>,
): boolean {
  const tabKey = PERMISSION_MODULE_TAB_KEY[moduleId] ?? moduleId;
  return tabConfig[tabKey]?.visible !== false;
}

export function isNamedBusinessType(value: unknown): value is NamedBusinessType {
  return typeof value === 'string' && (NAMED_BUSINESS_TYPES as readonly string[]).includes(value);
}

export function isBusinessTypeWithCustom(value: unknown): boolean {
  return typeof value === 'string' && (BUSINESS_TYPES_WITH_CUSTOM as readonly string[]).includes(value);
}
