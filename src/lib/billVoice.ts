/** Parse a spoken sale/purchase line into catalog matches. Does not post anything. */

export type BillVoiceLang = 'en' | 'hi' | 'gu' | 'mr';

export type BillVoiceCatalogItem = { id: string; name: string; packSize?: number };

export type BillVoiceLine = {
  productId: string;
  productName: string;
  qty: number;
  packs: number;
};

export type BillVoiceResult = {
  partyId: string | null;
  partyName: string | null;
  lines: BillVoiceLine[];
};

const EN_NUM: Record<string, number> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

/** Hindi / Gujarati / Marathi counts. Only used when UI lang is not English. */
const INDIC_NUM: Record<string, number> = {
  ek: 1,
  do: 2,
  teen: 3,
  char: 4,
  paanch: 5,
  panch: 5,
  chhe: 6,
  saat: 7,
  aath: 8,
  nau: 9,
  das: 10,
  be: 2,
  tran: 3,
  nav: 9,
  don: 2,
  tin: 3,
};

const FILLER = new Set([
  'sale',
  'sales',
  'purchase',
  'purchases',
  'invoice',
  'bill',
  'new',
  'create',
  'make',
  'add',
  'record',
  'to',
  'from',
  'for',
  'of',
  'the',
  'a',
  'an',
  'and',
  'plus',
  'with',
  'please',
  'customer',
  'vendor',
  'supplier',
  'party',
  'client',
  'ko',
  'se',
  'ka',
  'ki',
  'ke',
  'ne',
  'nu',
  'na',
  'par',
  'mate',
  'thi',
  'aur',
  'ane',
  'ani',
  'bag',
  'bags',
  'packet',
  'packets',
  'bottle',
  'bottles',
  'box',
  'boxes',
  'kg',
  'kilo',
  'nos',
  'piece',
  'pieces',
  'pcs',
  'unit',
  'units',
  'pack',
  'packs',
  'loose',
]);

export function speechLangTag(lang: BillVoiceLang): string {
  if (lang === 'hi') return 'hi-IN';
  if (lang === 'gu') return 'gu-IN';
  if (lang === 'mr') return 'mr-IN';
  return 'en-IN';
}

export function normalizeVoiceText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSpokenNumber(token: string, lang: BillVoiceLang): number | null {
  if (/^\d+(\.\d+)?$/.test(token)) {
    const n = Number(token);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  if (EN_NUM[token] != null) return EN_NUM[token] > 0 ? EN_NUM[token] : null;
  if (lang !== 'en' && INDIC_NUM[token] != null) return INDIC_NUM[token];
  return null;
}

function longestNameMatch<T extends BillVoiceCatalogItem>(haystack: string, items: T[]): T | null {
  let best: T | null = null;
  let bestLen = 0;
  for (const item of items) {
    const n = normalizeVoiceText(item.name);
    if (n.length < 3) continue;
    if (haystack.includes(n) && n.length > bestLen) {
      best = item;
      bestLen = n.length;
    }
  }
  return best;
}

function qtyBefore(haystack: string, matchAt: number, lang: BillVoiceLang): number {
  const before = haystack.slice(0, matchAt).trim().split(/\s+/).filter(Boolean);
  for (let i = before.length - 1; i >= 0; i--) {
    const q = parseSpokenNumber(before[i], lang);
    if (q != null && q >= 1) return Math.floor(q);
    if (FILLER.has(before[i])) continue;
    break;
  }
  return 1;
}

function wordIndex(haystack: string, tok: string): number {
  const at = ` ${haystack} `.indexOf(` ${tok} `);
  return at < 0 ? -1 : at;
}

function findProductHits(
  haystack: string,
  products: BillVoiceCatalogItem[],
): Array<{
  product: BillVoiceCatalogItem;
  at: number;
  used: string;
}> {
  const hits: Array<{ product: BillVoiceCatalogItem; at: number; used: string }> = [];
  const occupied: Array<[number, number]> = [];
  const take = (product: BillVoiceCatalogItem, used: string, at: number) => {
    if (at < 0) return false;
    if (occupied.some(([s, e]) => at < e && at + used.length > s)) return false;
    occupied.push([at, at + used.length]);
    hits.push({ product, at, used });
    return true;
  };

  const sorted = [...products].sort((a, b) => normalizeVoiceText(b.name).length - normalizeVoiceText(a.name).length);
  for (const product of sorted) {
    const n = normalizeVoiceText(product.name);
    if (n.length < 3) continue;
    take(product, n, haystack.indexOf(n));
  }
  if (hits.length) return hits.sort((a, b) => a.at - b.at);

  const tokenOwner = new Map<string, BillVoiceCatalogItem>();
  const ambiguous = new Set<string>();
  for (const product of products) {
    for (const tok of normalizeVoiceText(product.name)
      .split(' ')
      .filter(t => t.length >= 4)) {
      if (ambiguous.has(tok)) continue;
      const prev = tokenOwner.get(tok);
      if (prev && prev.id !== product.id) {
        ambiguous.add(tok);
        tokenOwner.delete(tok);
        continue;
      }
      tokenOwner.set(tok, product);
    }
  }
  for (const [tok, product] of [...tokenOwner.entries()].sort((a, b) => b[0].length - a[0].length)) {
    take(product, tok, wordIndex(haystack, tok));
  }
  return hits.sort((a, b) => a.at - b.at);
}

export function parseBillVoice(
  transcript: string,
  catalog: { parties: BillVoiceCatalogItem[]; products: BillVoiceCatalogItem[] },
  lang: BillVoiceLang = 'en',
): BillVoiceResult {
  const hay = normalizeVoiceText(transcript);
  if (!hay) return { partyId: null, partyName: null, lines: [] };

  const party = longestNameMatch(hay, catalog.parties);
  const afterParty = party ? hay.replace(normalizeVoiceText(party.name), ' ').replace(/\s+/g, ' ').trim() : hay;
  const hits = findProductHits(afterParty, catalog.products);
  const lines: BillVoiceLine[] = hits.map(h => {
    const product = h.product;
    const spoken = qtyBefore(afterParty, h.at, lang);
    const ps = product.packSize && product.packSize > 1 ? product.packSize : 1;
    const packs = ps > 1 ? spoken : 0;
    const qty = ps > 1 ? spoken * ps : spoken;
    return { productId: product.id, productName: product.name, qty, packs };
  });

  return {
    partyId: party?.id ?? null,
    partyName: party?.name ?? null,
    lines,
  };
}
