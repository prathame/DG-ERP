/**
 * Cloud Cap companion feature pack (non-service Online phone).
 * Service tenants keep Emergent phone IA — this pack is for manufacturer/silver/etc.
 */

export type MobileFeatureKey = 'stock' | 'sales' | 'quotations' | 'collections' | 'reports';

export type MobileFeatures = Record<MobileFeatureKey, boolean>;

export const MOBILE_FEATURE_LABELS: Record<MobileFeatureKey, string> = {
  stock: 'Stock / scan',
  sales: 'Simple sale / invoice',
  quotations: 'Quotations',
  collections: 'Collections / payments',
  reports: 'Light reports',
};

export const MOBILE_FEATURE_KEYS = Object.keys(MOBILE_FEATURE_LABELS) as MobileFeatureKey[];

/** Default companion pack when SA enables mobile for a non-service cloud tenant. */
export function defaultMobileFeatures(businessType?: string | null): MobileFeatures {
  const base: MobileFeatures = {
    stock: true,
    sales: true,
    quotations: true,
    collections: true,
    reports: true,
  };
  if (businessType === 'silver_casting') {
    // Weigh / metal intake stays desktop — companion is stock + sales + collections
    return { ...base, quotations: false };
  }
  return base;
}

export function normalizeMobileFeatures(raw: unknown, businessType?: string | null): MobileFeatures {
  const defaults = defaultMobileFeatures(businessType);
  if (!raw || typeof raw !== 'object') return defaults;
  const obj = raw as Record<string, unknown>;
  const out = { ...defaults };
  for (const key of MOBILE_FEATURE_KEYS) {
    if (typeof obj[key] === 'boolean') out[key] = obj[key];
  }
  return out;
}

/** Map companion features → primary app tab ids for Cap Online nav filtering. */
export function mobileFeatureAllowsTab(tabId: string, features: MobileFeatures): boolean {
  switch (tabId) {
    case 'inventory':
      return features.stock;
    case 'sales':
    case 'invoices':
      return features.sales;
    case 'quotations':
      return features.quotations;
    case 'finance':
      return features.collections;
    case 'analytics':
    case 'accounts':
      return features.reports;
    case 'masters':
      // Light masters (customers) useful with sales — allow if any write feature on
      return features.sales || features.quotations || features.collections;
    case 'settings':
      return false;
    default:
      return false;
  }
}
