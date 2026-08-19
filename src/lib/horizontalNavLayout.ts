/** Desktop top/bottom menu groups — screenshot-style clusters, not a flat tab list. */
export const HORIZONTAL_NAV_GROUPS = [
  {
    id: 'analytics',
    labelKey: 'navSections.home',
    tabIds: ['analytics', 'masters'],
  },
  {
    id: 'operations',
    labelKey: 'navSections.operations',
    tabIds: ['invoices', 'quotations', 'purchases', 'sales', 'distribution'],
  },
  {
    id: 'finance',
    labelKey: 'navSections.financeShort',
    tabIds: ['finance', 'accounts'],
  },
  {
    id: 'inventory',
    labelKey: 'nav.inventory',
    tabIds: ['inventory', 'verification'],
  },
  {
    id: 'afterSales',
    labelKey: 'navSections.afterSales',
    tabIds: ['warranty', 'replacements', 'rewards'],
  },
  {
    id: 'hospitality',
    labelKey: 'nav.hospitality',
    tabIds: ['hosp_floor', 'hosp_waiter', 'hosp_kitchen', 'hosp_queue', 'hosp_parcels', 'hosp_menu', 'hosp_members'],
  },
] as const;

export type HorizontalNavGroupId = (typeof HORIZONTAL_NAV_GROUPS)[number]['id'];

/** Quick shortcuts shown in the floating dock when the menu is on the bottom. */
export const HORIZONTAL_DOCK_TAB_IDS = ['verification', 'accounts', 'settings'] as const;

const TAB_TO_GROUP = new Map<string, HorizontalNavGroupId>(
  HORIZONTAL_NAV_GROUPS.flatMap(g => g.tabIds.map(tabId => [tabId, g.id] as const)),
);

export function horizontalNavGroupForTab(tabId: string): HorizontalNavGroupId {
  return TAB_TO_GROUP.get(tabId) ?? 'analytics';
}

export function horizontalNavGroupTabIds(groupId: HorizontalNavGroupId): readonly string[] {
  return HORIZONTAL_NAV_GROUPS.find(g => g.id === groupId)?.tabIds ?? HORIZONTAL_NAV_GROUPS[0]!.tabIds;
}

export function visibleHorizontalNavGroups(visibleTabIds: Set<string>): (typeof HORIZONTAL_NAV_GROUPS)[number][] {
  return HORIZONTAL_NAV_GROUPS.filter(g => g.tabIds.some(id => visibleTabIds.has(id)));
}
