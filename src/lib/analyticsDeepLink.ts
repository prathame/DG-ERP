import type { Tab } from '../types';

const STORAGE_KEY = 'dhandho.analyticsDeepLink';

export type AnalyticsDeepLink =
  | { kind: 'financeParty'; partyKey: string }
  | { kind: 'vendorFinance'; vendorId: string }
  | { kind: 'invoice'; invoiceId: string };

/** Stash a one-shot deep-link for the next tab mount. */
export function stashAnalyticsDeepLink(link: AnalyticsDeepLink): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(link));
  } catch {
    /* private mode */
  }
}

/** Read and clear a pending Analytics deep-link. */
export function consumeAnalyticsDeepLink(): AnalyticsDeepLink | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(STORAGE_KEY);
    const parsed = JSON.parse(raw) as AnalyticsDeepLink;
    if (!parsed || typeof parsed !== 'object' || !('kind' in parsed)) return null;
    if (parsed.kind === 'financeParty' && typeof parsed.partyKey === 'string' && parsed.partyKey) return parsed;
    if (parsed.kind === 'vendorFinance' && typeof parsed.vendorId === 'string' && parsed.vendorId) return parsed;
    if (parsed.kind === 'invoice' && typeof parsed.invoiceId === 'string' && parsed.invoiceId) return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Map a recent-activity / calendar row type to the best destination tab. */
export function tabForActivityType(type: string): Tab {
  switch (type) {
    case 'invoice':
      return 'invoices';
    case 'payment':
      return 'finance';
    case 'expense':
      return 'purchases';
    case 'sale':
      return 'sales';
    case 'distribution':
      return 'distribution';
    default:
      return 'finance';
  }
}
