/** Topic ids for Settings → How to use. Copy lives in i18n (en / hi / gu / mr). */

export const SHOP_GUIDE_IDS = [
  'shop-start',
  'shop-masters',
  'shop-stock',
  'shop-sale',
  'shop-invoice',
  'shop-quote',
  'shop-dispatch',
  'shop-bills',
  'shop-backup',
] as const;

export const ACCOUNTANT_GUIDE_IDS = [
  'acc-books',
  'acc-receipt',
  'acc-payment',
  'acc-sales-purchase',
  'acc-reports',
  'acc-outstanding',
  'acc-lock',
  'acc-notes',
] as const;

export type UserGuideTopic = {
  id: string;
  title: string;
  steps: string[];
};

type TopicPack = { title?: string; steps?: unknown };

export function resolveGuideTopics(
  pack: Record<string, TopicPack> | undefined,
  ids: readonly string[],
): UserGuideTopic[] {
  if (!pack) return [];
  const out: UserGuideTopic[] = [];
  for (const id of ids) {
    const item = pack[id];
    const steps = Array.isArray(item?.steps)
      ? item.steps.filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
      : [];
    const title = typeof item?.title === 'string' ? item.title.trim() : '';
    if (!title || steps.length === 0) continue;
    out.push({ id, title, steps });
  }
  return out;
}

/** Show a topic if any listed tab is on. Empty list = always (then other flags apply). */
const SHOP_TOPIC_TABS: Record<string, string[]> = {
  'shop-start': ['sales', 'distribution', 'invoices'],
  'shop-masters': ['masters'],
  'shop-stock': ['inventory'],
  'shop-sale': ['sales', 'distribution'],
  'shop-invoice': ['invoices'],
  'shop-quote': ['quotations'],
  'shop-dispatch': ['distribution'],
  'shop-bills': ['invoices', 'quotations', 'distribution'],
};

type AccGate = { tabs?: string[]; books?: boolean };

const ACCOUNTANT_TOPIC_GATES: Record<string, AccGate> = {
  'acc-books': { books: true },
  'acc-receipt': { books: true },
  'acc-payment': { books: true },
  'acc-sales-purchase': { books: true },
  'acc-lock': { books: true },
  'acc-reports': { tabs: ['accounts'], books: true },
  'acc-outstanding': { tabs: ['accounts', 'finance'] },
  'acc-notes': { tabs: ['accounts'] },
};

export function isGuideTopicOn(
  id: string,
  opts: { tabOn: (tabId: string) => boolean; booksOn: boolean; isAdmin: boolean },
): boolean {
  if (id === 'shop-backup') return opts.isAdmin;
  const shopTabs = SHOP_TOPIC_TABS[id];
  if (shopTabs) return shopTabs.some(opts.tabOn);
  const acc = ACCOUNTANT_TOPIC_GATES[id];
  if (!acc) return true;
  if (acc.books && opts.booksOn) return true;
  if (acc.tabs?.some(opts.tabOn)) return true;
  return false;
}

export function filterGuideTopics(
  topics: UserGuideTopic[],
  opts: { tabOn: (tabId: string) => boolean; booksOn: boolean; isAdmin: boolean },
): UserGuideTopic[] {
  return topics.filter(t => isGuideTopicOn(t.id, opts));
}
