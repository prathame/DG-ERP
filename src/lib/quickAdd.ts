import type { Tab } from '../types';

export type CreateLaunch = 'invoice' | 'quote' | 'challan' | 'purchase' | 'product';

export const CREATE_LAUNCH_TABS: Record<CreateLaunch, Tab> = {
  invoice: 'invoices',
  quote: 'quotations',
  challan: 'distribution',
  purchase: 'purchases',
  product: 'inventory',
};

export const CREATE_LAUNCH_ORDER: CreateLaunch[] = ['invoice', 'quote', 'challan', 'purchase', 'product'];

/** Tabs the user can create on (visible + write access). */
export function visibleCreateLaunches(canCreate: (tab: Tab) => boolean): CreateLaunch[] {
  return CREATE_LAUNCH_ORDER.filter(id => canCreate(CREATE_LAUNCH_TABS[id]));
}
