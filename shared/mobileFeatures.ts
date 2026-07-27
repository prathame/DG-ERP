/**
 * Cloud Cap Online tab grants (non-service).
 * Stored on tenants.mobile_features JSONB; Cap filters bottom nav / More / routes.
 * Service Cap keeps Emergent phone IA and uses tab_config instead.
 *
 * Legacy companion keys (stock/sales/…) are still accepted and mapped on read.
 */

import { getTabPreset, type TabConfig } from './tabPresets';

/** Cap-gatable tabs (settings always available on Cap; not stored here). */
export type MobileFeatureKey =
  | 'analytics'
  | 'masters'
  | 'inventory'
  | 'distribution'
  | 'sales'
  | 'purchases'
  | 'verification'
  | 'quotations'
  | 'invoices'
  | 'finance'
  | 'accounts'
  | 'warranty'
  | 'replacements'
  | 'rewards'
  | 'chatbot';

export type MobileFeatures = Record<MobileFeatureKey, boolean>;

export const MOBILE_FEATURE_KEYS: MobileFeatureKey[] = [
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
  'chatbot',
];

/** Fallback labels when preset has no entry. */
export const MOBILE_FEATURE_LABELS: Record<MobileFeatureKey, string> = {
  analytics: 'Analytics',
  masters: 'Masters',
  inventory: 'Inventory / stock',
  distribution: 'Distribution / dispatch',
  sales: 'Sales entry',
  purchases: 'Purchases / expenses',
  verification: 'Search / verify',
  quotations: 'Quotes & orders',
  invoices: 'Invoices',
  finance: 'Finance / collections',
  accounts: 'Accounts / reports',
  warranty: 'Warranty',
  replacements: 'Replacements',
  rewards: 'Rewards',
  chatbot: 'Chatbot',
};

/** Legacy Cap companion pack keys → tab grants. */
const LEGACY_KEYS = ['stock', 'sales', 'quotations', 'collections', 'reports', 'chatbot'] as const;

function isLegacyMobileFeatures(obj: Record<string, unknown>): boolean {
  const hasLegacy = LEGACY_KEYS.some(k => typeof obj[k] === 'boolean');
  const hasTabKey = MOBILE_FEATURE_KEYS.some(
    k => typeof obj[k] === 'boolean' && k !== 'sales' && k !== 'quotations' && k !== 'chatbot',
  );
  // Prefer tab shape when inventory/analytics/etc. present; otherwise treat as legacy if stock/collections/reports set.
  if (typeof obj.inventory === 'boolean' || typeof obj.analytics === 'boolean' || typeof obj.finance === 'boolean') {
    return false;
  }
  return hasLegacy && !hasTabKey;
}

function fromLegacy(obj: Record<string, unknown>, defaults: MobileFeatures): MobileFeatures {
  const stock = typeof obj.stock === 'boolean' ? obj.stock : defaults.inventory;
  const sales = typeof obj.sales === 'boolean' ? obj.sales : defaults.sales;
  const quotations = typeof obj.quotations === 'boolean' ? obj.quotations : defaults.quotations;
  const collections = typeof obj.collections === 'boolean' ? obj.collections : defaults.finance;
  const reports = typeof obj.reports === 'boolean' ? obj.reports : defaults.analytics;
  const chatbot = typeof obj.chatbot === 'boolean' ? obj.chatbot : defaults.chatbot;

  return {
    ...defaults,
    inventory: stock,
    sales,
    invoices: sales,
    quotations,
    finance: collections,
    analytics: reports,
    accounts: reports,
    // Masters was previously implied by any write feature
    masters: sales || quotations || collections || defaults.masters,
    chatbot,
  };
}

function emptyFeatures(value: boolean): MobileFeatures {
  return Object.fromEntries(MOBILE_FEATURE_KEYS.map(k => [k, value])) as MobileFeatures;
}

/**
 * Defaults for Cap Online from business-type tab preset:
 * - preset-visible tabs on (except chatbot, always off until SA enables)
 * - silver_casting: quotations off (companion precedent)
 */
export function defaultMobileFeatures(businessType?: string | null): MobileFeatures {
  const preset: TabConfig = getTabPreset(businessType);
  const out = emptyFeatures(false);
  for (const key of MOBILE_FEATURE_KEYS) {
    if (key === 'chatbot') {
      out.chatbot = false;
      continue;
    }
    out[key] = preset[key]?.visible !== false;
  }
  if (businessType === 'silver_casting') {
    out.quotations = false;
  }
  return out;
}

export function normalizeMobileFeatures(raw: unknown, businessType?: string | null): MobileFeatures {
  const defaults = defaultMobileFeatures(businessType);
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;

  if (isLegacyMobileFeatures(obj)) {
    return fromLegacy(obj, defaults);
  }

  const out = { ...defaults };
  for (const key of MOBILE_FEATURE_KEYS) {
    if (typeof obj[key] === 'boolean') out[key] = obj[key];
  }
  // Hotel Cap: never grant Masters — hospitality Menu + Settings Users cover that IA.
  // Clears stale mobile_features.masters:true from older grants.
  if (businessType === 'hotel_restaurant') {
    out.masters = false;
  }
  return out;
}

/** Tabs SA should offer for this business type (preset-relevant + chatbot). */
export function mobileFeatureOptions(businessType?: string | null): { key: MobileFeatureKey; label: string }[] {
  const preset = getTabPreset(businessType);
  const options: { key: MobileFeatureKey; label: string }[] = [];
  for (const key of MOBILE_FEATURE_KEYS) {
    // Offer tabs that the business type uses (visible in desktop preset), plus chatbot.
    // Custom / unknown: show everything.
    const relevant = businessType === 'custom' || !businessType || key === 'chatbot' || preset[key]?.visible !== false;
    if (!relevant) continue;
    options.push({
      key,
      label: preset[key]?.label || MOBILE_FEATURE_LABELS[key],
    });
  }
  return options;
}

/** Map grants → Cap app tab ids. Settings always allowed by App shell. */
export function mobileFeatureAllowsTab(tabId: string, features: MobileFeatures): boolean {
  if (tabId === 'settings') return false; // App.tsx allows settings separately
  // Hospitality tabs: gated by role + tenant tab_config, not Cap mobile_features.
  if (tabId.startsWith('hosp_')) return true;
  if (tabId === 'dashboard') return features.analytics;
  if ((MOBILE_FEATURE_KEYS as readonly string[]).includes(tabId)) {
    return features[tabId as MobileFeatureKey];
  }
  return false;
}
