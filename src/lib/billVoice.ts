/** Parse a spoken sale/purchase line into catalog matches. Does not post anything. */

export type BillVoiceLang = 'en' | 'hi' | 'gu' | 'mr';

export type BillVoiceCatalogItem = { id: string; name: string; packSize?: number };

export type BillVoiceLine = {
  productId: string;
  productName: string;
  qty: number;
  packs: number;
  spoken: number;
  qtyHeard: boolean;
};

export type BillVoiceResult = {
  partyId: string | null;
  partyName: string | null;
  lines: BillVoiceLine[];
  unknownParty: string | null;
  unknownProduct: string | null;
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
  let tied = false;
  for (const item of items) {
    const n = normalizeVoiceText(item.name);
    if (n.length < 4) continue;
    const hit = n.includes(' ') ? haystack.includes(n) : wordIndex(haystack, n) >= 0;
    if (!hit) continue;
    if (n.length > bestLen) {
      best = item;
      bestLen = n.length;
      tied = false;
    } else if (n.length === bestLen && best && best.id !== item.id) {
      tied = true;
    }
  }
  return tied ? null : best;
}

function qtyBefore(haystack: string, matchAt: number, lang: BillVoiceLang): { qty: number; heard: boolean } {
  const before = haystack.slice(0, matchAt).trim().split(/\s+/).filter(Boolean);
  for (let i = before.length - 1; i >= 0; i--) {
    const q = parseSpokenNumber(before[i], lang);
    if (q != null && q >= 1) return { qty: Math.floor(q), heard: true };
    if (FILLER.has(before[i])) continue;
    break;
  }
  return { qty: 1, heard: false };
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
    if (n.length < 4) continue;
    const at = n.includes(' ') ? haystack.indexOf(n) : wordIndex(haystack, n);
    take(product, n, at);
  }
  if (hits.length) return hits.sort((a, b) => a.at - b.at);

  const tokenOwner = new Map<string, BillVoiceCatalogItem>();
  const ambiguous = new Set<string>();
  for (const product of products) {
    for (const tok of normalizeVoiceText(product.name)
      .split(' ')
      .filter(t => t.length >= 5 && !FILLER.has(t))) {
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

function leftoverSpokenName(haystack: string, lang: BillVoiceLang): string {
  const strip = new Set([
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
    'hello',
    'hi',
    'hey',
    'there',
    'thanks',
    'ok',
    'okay',
  ]);
  const tokens = haystack.split(/\s+/).filter(t => {
    if (!t || t.length < 4) return false;
    if (strip.has(t)) return false;
    if (parseSpokenNumber(t, lang) != null) return false;
    return true;
  });
  return tokens.join(' ');
}

export function parseBillVoice(
  transcript: string,
  catalog: { parties: BillVoiceCatalogItem[]; products: BillVoiceCatalogItem[] },
  lang: BillVoiceLang = 'en',
): BillVoiceResult {
  const empty: BillVoiceResult = {
    partyId: null,
    partyName: null,
    lines: [],
    unknownParty: null,
    unknownProduct: null,
  };
  const hay = normalizeVoiceText(transcript);
  if (!hay) return empty;

  const party = longestNameMatch(hay, catalog.parties);
  const afterParty = party ? hay.replace(normalizeVoiceText(party.name), ' ').replace(/\s+/g, ' ').trim() : hay;
  const hits = findProductHits(afterParty, catalog.products);
  const lines: BillVoiceLine[] = hits.map(h => {
    const product = h.product;
    const spoken = qtyBefore(afterParty, h.at, lang);
    const ps = product.packSize && product.packSize > 1 ? product.packSize : 1;
    const packs = ps > 1 ? spoken.qty : 0;
    const qty = ps > 1 ? spoken.qty * ps : spoken.qty;
    return {
      productId: product.id,
      productName: product.name,
      qty,
      packs,
      spoken: spoken.qty,
      qtyHeard: spoken.heard,
    };
  });

  let rest = hay;
  if (party) rest = rest.replace(normalizeVoiceText(party.name), ' ');
  for (const h of hits) rest = rest.replace(h.used, ' ');
  rest = rest.replace(/\s+/g, ' ').trim();

  let unknownParty: string | null = null;
  let unknownProduct: string | null = null;
  if (!party && hits.length) {
    const n = leftoverSpokenName(rest, lang);
    unknownParty = n ? titleCaseWords(n) : null;
  } else if (party && !hits.length) {
    const n = leftoverSpokenName(rest, lang);
    unknownProduct = n ? titleCaseWords(n) : null;
  } else if (!party && !hits.length) {
    const tokens = hay.split(/\s+/).filter(Boolean);
    let qtyAt = -1;
    for (let i = 0; i < tokens.length; i++) {
      if (parseSpokenNumber(tokens[i], lang) != null) qtyAt = i;
    }
    if (qtyAt >= 0) {
      const before = leftoverSpokenName(tokens.slice(0, qtyAt).join(' '), lang);
      const after = leftoverSpokenName(tokens.slice(qtyAt + 1).join(' '), lang);
      unknownParty = before ? titleCaseWords(before) : null;
      unknownProduct = after ? titleCaseWords(after) : null;
    } else {
      const n = leftoverSpokenName(rest, lang);
      unknownParty = n ? titleCaseWords(n) : null;
    }
  }

  return {
    partyId: party?.id ?? null,
    partyName: party?.name ?? null,
    lines,
    unknownParty,
    unknownProduct,
  };
}

const CHECK_FORM: Record<BillVoiceLang, string> = {
  en: 'Check the form.',
  hi: 'फॉर्म चेक करें।',
  gu: 'ફોર્મ ચેક કરો.',
  mr: 'फॉर्म तपासा.',
};

const UNKNOWN: Record<BillVoiceLang, string> = {
  en: 'I did not catch a matching customer or product. Nothing was filled. Please type it.',
  hi: 'मिलता ग्राहक या प्रोडक्ट नहीं सुना। कुछ भरा नहीं। कृपया टाइप करें।',
  gu: 'મેળ ખાતો ગ્રાહક કે પ્રોડક્ટ નથી સંભળાયો. કંઈ ભર્યું નથી. કૃપા કરીને ટાઈપ કરો.',
  mr: 'जुळणारा ग्राहक किंवा उत्पादन ऐकू आले नाही. काही भरले नाही. कृपया टाइप करा.',
};

const NO_PRODUCT: Record<BillVoiceLang, string> = {
  en: 'No matching product.',
  hi: 'मिलता प्रोडक्ट नहीं।',
  gu: 'મેળ ખાતું પ્રોડક્ટ નથી.',
  mr: 'जुळणारे उत्पादन नाही.',
};

const QTY_UNKNOWN: Record<BillVoiceLang, string> = {
  en: 'quantity not heard',
  hi: 'मात्रा नहीं सुनी',
  gu: 'જથ્થો સંભળાયો નથી',
  mr: 'प्रमाण ऐकू आले नाही',
};

/** Short spoken recap of what was filled. Says so when a part was not matched. Never invents names. */
export function formatBillVoiceUnknown(lang: BillVoiceLang = 'en'): string {
  return UNKNOWN[lang];
}

export function formatBillVoiceReply(fill: BillVoiceResult, lang: BillVoiceLang = 'en'): string {
  if (!fill.partyName && fill.lines.length === 0) return formatBillVoiceUnknown(lang);
  if (fill.partyName && fill.lines.length === 0) {
    return `${fill.partyName}. ${NO_PRODUCT[lang]} ${CHECK_FORM[lang]}`;
  }
  const items = fill.lines.map(line =>
    line.qtyHeard ? `${line.spoken} ${line.productName}` : `${line.productName}, ${QTY_UNKNOWN[lang]}`,
  );
  const head = fill.partyName ? `${fill.partyName}, ${items.join(', ')}` : items.join(', ');
  return `${head}. ${CHECK_FORM[lang]}`;
}

export function formatBillVoiceAskCustomer(name: string, lang: BillVoiceLang = 'en'): string {
  if (lang === 'hi') return `${name} नहीं मिला। क्या यह ग्राहक जोड़ना है?`;
  if (lang === 'gu') return `${name} મળ્યો નથી. આ ગ્રાહક ઉમેરવો છે?`;
  if (lang === 'mr') return `${name} सापडला नाही. हा ग्राहक जोडायचा का?`;
  return `${name} not found. Would you like to add this customer?`;
}

export function formatBillVoiceAskProduct(name: string, lang: BillVoiceLang = 'en'): string {
  if (lang === 'hi') return `${name} नहीं मिला। क्या यह प्रोडक्ट जोड़ना है?`;
  if (lang === 'gu') return `${name} મળ્યું નથી. આ પ્રોડક્ટ ઉમેરવું છે?`;
  if (lang === 'mr') return `${name} सापडले नाही. हे उत्पादन जोडायचे का?`;
  return `${name} not found. Would you like to add this product?`;
}

function titleCaseWords(s: string): string {
  return s
    .split(' ')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const SEARCH_FILLER = new Set([
  'search',
  'find',
  'show',
  'open',
  'please',
  'invoice',
  'invoices',
  'inventory',
  'stock',
  'vendor',
  'vendors',
  'customer',
  'payment',
  'payments',
  'history',
  'look',
  'looking',
  'for',
  'the',
  'a',
  'an',
  'hello',
  'hi',
  'hey',
  'there',
  'thanks',
  'ok',
  'okay',
]);

/** Strip “search invoice …” so the remaining words go in the search box. */
export function voiceSearchQuery(transcript: string): string {
  const q = normalizeVoiceText(transcript)
    .split(' ')
    .filter(t => t && !SEARCH_FILLER.has(t))
    .join(' ')
    .trim();
  return q.length >= 3 ? q : '';
}

const SEARCHING: Record<BillVoiceLang, (q: string) => string> = {
  en: q => `Searching ${q}.`,
  hi: q => `${q} ढूंढ रहे हैं।`,
  gu: q => `${q} શોધી રહ્યા છીએ.`,
  mr: q => `${q} शोधत आहे.`,
};

const SEARCH_UNKNOWN: Record<BillVoiceLang, string> = {
  en: 'I did not catch what to search. Please type it.',
  hi: 'क्या ढूँढना है नहीं सुना। कृपया टाइप करें।',
  gu: 'શું શોધવું તે સંભળાયું નથી. કૃપા કરીને ટાઈપ કરો.',
  mr: 'काय शोधायचे ते ऐकू आले नाही. कृपया टाइप करा.',
};

export function formatVoiceSearchReply(query: string, lang: BillVoiceLang = 'en'): string {
  const q = query.trim();
  if (!q) return SEARCH_UNKNOWN[lang];
  return SEARCHING[lang](q);
}

const CUSTOMER_FILLER = new Set([
  'new',
  'add',
  'customer',
  'client',
  'party',
  'phone',
  'mobile',
  'number',
  'naam',
  'please',
  'the',
  'a',
  'hello',
  'hi',
  'hey',
  'there',
  'thanks',
  'thank',
  'you',
  'ok',
  'okay',
]);

const CUSTOMER_UNKNOWN: Record<BillVoiceLang, string> = {
  en: 'I did not catch a customer name or phone. Nothing was filled. Please type it.',
  hi: 'ग्राहक नाम या फोन नहीं सुना। कुछ भरा नहीं। कृपया टाइप करें।',
  gu: 'ગ્રાહક નામ કે ફોન સંભળાયો નથી. કંઈ ભર્યું નથી. કૃપા કરીને ટાઈપ કરો.',
  mr: 'ग्राहक नाव किंवा फोन ऐकू आला नाही. काही भरले नाही. कृपया टाइप करा.',
};

export function parseVoiceCustomer(transcript: string): { name: string; phone: string } {
  const digits = String(transcript || '').replace(/\D/g, '');
  let phone = '';
  if (digits.length >= 10) {
    phone = digits.startsWith('91') && digits.length >= 12 ? digits.slice(-10) : digits.slice(-10);
  }
  const rawName = normalizeVoiceText(transcript)
    .replace(/\+?91/g, ' ')
    .replace(/\d+/g, ' ')
    .split(' ')
    .filter(t => t && !CUSTOMER_FILLER.has(t))
    .join(' ')
    .trim();
  const name = rawName.length >= 3 ? titleCaseWords(rawName) : '';
  return { name, phone };
}

export function formatVoiceCustomerReply(fill: { name: string; phone: string }, lang: BillVoiceLang = 'en'): string {
  const parts = [fill.name, fill.phone].filter(Boolean);
  if (!parts.length) return CUSTOMER_UNKNOWN[lang];
  return `${parts.join(', ')}. ${CHECK_FORM[lang]}`;
}

export type VoiceBankFill = {
  name: string;
  accountNumber: string;
  bankName: string;
  branch: string;
  ifscCode: string;
};

const KNOWN_BANKS: Array<[string, string]> = [
  ['state bank of india', 'State Bank of India'],
  ['state bank', 'State Bank of India'],
  ['bank of baroda', 'Bank of Baroda'],
  ['punjab national', 'Punjab National Bank'],
  ['union bank', 'Union Bank of India'],
  ['yes bank', 'Yes Bank'],
  ['hdfc', 'HDFC Bank'],
  ['icici', 'ICICI Bank'],
  ['axis', 'Axis Bank'],
  ['kotak', 'Kotak Mahindra Bank'],
  ['pnb', 'Punjab National Bank'],
  ['sbi', 'State Bank of India'],
  ['canara', 'Canara Bank'],
  ['baroda', 'Bank of Baroda'],
];

const BANK_FILLER = new Set([
  'add',
  'bank',
  'details',
  'account',
  'number',
  'ifsc',
  'code',
  'branch',
  'new',
  'please',
  'the',
  'a',
  'an',
  'hello',
  'hi',
  'hey',
  'there',
  'thanks',
  'ok',
  'okay',
]);

export function parseVoiceBank(transcript: string): VoiceBankFill {
  const raw = String(transcript || '');
  const compact = raw.replace(/\s+/g, '');
  const ifscM = compact.match(/[A-Za-z]{4}0[A-Za-z0-9]{6}/);
  const ifscCode = ifscM ? ifscM[0].toUpperCase() : '';

  const digitRuns = raw.match(/\d{9,18}/g) || [];
  const accountNumber = digitRuns.find(d => !ifscCode.includes(d)) || '';

  const hay = normalizeVoiceText(raw);
  let bankName = '';
  for (const [match, name] of KNOWN_BANKS) {
    if (hay.includes(match)) {
      bankName = name;
      break;
    }
  }

  let branch = '';
  const branchM = hay.match(/\bbranch\s+(.+)$/);
  if (branchM) branch = branchM[1].trim();

  let rest = hay;
  for (const [match] of KNOWN_BANKS) rest = rest.replace(match, ' ');
  rest = rest.replace(/\bbranch\b.*$/, ' ');
  rest = rest.replace(/\d+/g, ' ');
  const leftover = rest
    .split(' ')
    .filter(t => t && !BANK_FILLER.has(t) && t.length > 1)
    .join(' ')
    .trim();
  const name = leftover.length >= 4 ? titleCaseWords(leftover) : '';
  const branchTitle = branch ? titleCaseWords(branch) : '';

  return {
    name,
    accountNumber,
    bankName,
    branch: branchTitle,
    ifscCode,
  };
}

const BANK_UNKNOWN: Record<BillVoiceLang, string> = {
  en: 'I did not catch bank details. Nothing was filled. Please type it.',
  hi: 'बैंक डिटेल नहीं सुनी। कुछ भरा नहीं। कृपया टाइप करें।',
  gu: 'બેન્ક વિગત સંભળાઈ નથી. કંઈ ભર્યું નથી. કૃપા કરીને ટાઈપ કરો.',
  mr: 'बँक तपशील ऐकू आला नाही. काही भरले नाही. कृपया टाइप करा.',
};

export function formatVoiceBankReply(fill: VoiceBankFill, lang: BillVoiceLang = 'en'): string {
  const parts = [fill.name, fill.bankName, fill.accountNumber, fill.ifscCode, fill.branch].filter(Boolean);
  if (!parts.length) return BANK_UNKNOWN[lang];
  return `${parts.join(', ')}. ${CHECK_FORM[lang]}`;
}

const GUIDE_SKIP_WORDS = new Set([
  'skip',
  'none',
  'later',
  'pass',
  'no',
  'not',
  'now',
  'nahi',
  'nahin',
  'nathi',
  'chhodo',
  'nako',
  'soda',
]);

export function isVoiceGuideSkip(transcript: string): boolean {
  const tokens = normalizeVoiceText(transcript).split(' ').filter(Boolean);
  if (!tokens.length) return false;
  return tokens.every(t => GUIDE_SKIP_WORDS.has(t));
}

/** TTS says 9876543210 as "98 crore…". Space digits so it reads one by one. */
export function speakableVoiceValue(value: string): string {
  const compact = String(value || '').replace(/\s+/g, '');
  if (!compact) return value;
  if (/^\d+(\.\d+)?$/.test(compact) && compact.replace('.', '').length >= 6) {
    return compact.split('').join(' ');
  }
  if (/^[A-Za-z]{4}0[A-Za-z0-9]{6}$/.test(compact)) {
    return compact.split('').join(' ');
  }
  if (compact.includes('@')) {
    return compact.replace('@', ' at ').replace(/\./g, ' dot ');
  }
  return value;
}

export function formatVoiceFieldReply(label: string, value: string, lang: BillVoiceLang = 'en'): string {
  const spoken = speakableVoiceValue(value);
  if (lang === 'hi') return `${label}: ${spoken}।`;
  if (lang === 'gu') return `${label}: ${spoken}.`;
  if (lang === 'mr') return `${label}: ${spoken}.`;
  return `${label}: ${spoken}.`;
}

export function parseVoiceEmail(transcript: string): string {
  let s = String(transcript || '')
    .trim()
    .toLowerCase();
  if (!s) return '';
  s = s.replace(/\bat[\s-]*the[\s-]*rate(?:\s+of)?\b/gi, '@');
  s = s.replace(/\bat[\s-]*the[\s-]*rat\b/gi, '@');
  s = s.replace(/\bat[\s-]*rate\b/gi, '@');
  s = s.replace(/\battherate\b/gi, '@');
  s = s.replace(/\bdot\b/gi, '.');
  s = s.replace(/\b(full\s*stop|fullstop)\b/gi, '.');
  s = s.replace(/\b(under\s*score|underscore)\b/gi, '_');
  s = s.replace(/\b(dash|hyphen)\b/gi, '-');
  s = s.replace(/\s+/g, '');
  if (!s.includes('@') && /gmail|yahoo|hotmail|outlook|rediffmail/.test(s)) {
    s = s.replace(/(gmail|yahoo|hotmail|outlook|rediffmail)/, '@$1');
  }
  s = s.replace(/(gmail|yahoo|hotmail|outlook|rediffmail)$/i, '$1.com');
  s = s.replace(
    /([^@]+)@(\d+)(gmail|yahoo|hotmail|outlook|rediffmail)\.com$/i,
    (_, local, digits, domain) => `${local}${digits}@${domain}.com`,
  );
  return s;
}

export function parseVoiceDigits(transcript: string): string {
  const m = String(transcript || '')
    .replace(/,/g, '')
    .match(/\d+(?:\.\d+)?/);
  return m ? m[0] : '';
}

export function parseVoiceGuideName(transcript: string): string {
  return parseVoiceCustomer(transcript).name;
}

export function parseVoiceGuidePhone(transcript: string): string {
  return parseVoiceCustomer(transcript).phone;
}

export function parseVoiceGuideBank(transcript: string): string {
  return parseVoiceBank(transcript).bankName;
}

export function parseVoiceGuideAccount(transcript: string): string {
  return parseVoiceBank(transcript).accountNumber;
}

export function parseVoiceGuideIfsc(transcript: string): string {
  return parseVoiceBank(transcript).ifscCode;
}

const SALARY_FILLER = new Set([
  'given',
  'gave',
  'give',
  'giving',
  'salary',
  'salaries',
  'paid',
  'pay',
  'payment',
  'to',
  'for',
  'of',
  'the',
  'a',
  'an',
  'rupees',
  'rupee',
  'rs',
  'inr',
  'staff',
  'employee',
  'please',
  'record',
  'add',
  'ne',
  'ko',
  'ki',
  'ka',
  'ke',
  'pagar',
  'vetan',
]);

export type SalaryVoiceHit = {
  staffId: string | null;
  staffName: string | null;
  spokenName: string | null;
  amount: number | null;
};

function matchStaffBySpokenName<T extends { id: string; name: string }>(haystack: string, staff: T[]): T | null {
  const hay = normalizeVoiceText(haystack);
  if (!hay) return null;
  let best: T | null = null;
  let bestLen = 0;
  for (const s of staff) {
    const n = normalizeVoiceText(s.name);
    if (!n) continue;
    const first = n.split(' ')[0] || '';
    const spokenFirst = hay.split(' ')[0] || '';
    const hit = hay.includes(n) || n.includes(hay) || (first.length >= 4 && first === spokenFirst);
    if (!hit) continue;
    if (n.length > bestLen) {
      best = s;
      bestLen = n.length;
    }
  }
  return best;
}

/** “given salary to Shailesh 1500” → staff + amount. Does not post. */
export function parseSalaryVoice(transcript: string, staff: { id: string; name: string }[]): SalaryVoiceHit {
  const raw = String(transcript || '');
  const nums = raw.replace(/,/g, '').match(/\d+(?:\.\d+)?/g);
  const last = nums?.length ? Number(nums[nums.length - 1]) : NaN;
  const amount = Number.isFinite(last) && last > 0 ? last : null;
  let hay = normalizeVoiceText(raw.replace(/,/g, ' '));
  if (amount != null) hay = hay.replace(new RegExp(`\\b${Math.floor(amount)}\\b`), ' ');
  const spokenName =
    hay
      .split(' ')
      .filter(t => t && !SALARY_FILLER.has(t) && !/^\d/.test(t))
      .join(' ')
      .trim() || null;
  const hit = spokenName ? matchStaffBySpokenName(spokenName, staff) : null;
  return {
    staffId: hit?.id || null,
    staffName: hit?.name || null,
    spokenName,
    amount,
  };
}

export function formatSalaryVoicePresent(name: string, amount: number, lang: BillVoiceLang = 'en'): string {
  const n = name.trim();
  const a = amount.toLocaleString('en-IN');
  if (lang === 'hi') return `${n} मौजूद हैं। क्या ${a} रुपये सैलरी देनी है?`;
  if (lang === 'gu') return `${n} હાજર છે. ${a} રૂપિયા પગાર આપવો છે?`;
  if (lang === 'mr') return `${n} हजर आहेत. ${a} रुपये पगार द्यायचा का?`;
  return `${n} is present. Are you sure you want to give salary of ${a}?`;
}

export function formatSalaryVoiceAbsent(name: string, lang: BillVoiceLang = 'en'): string {
  const n = name.trim() || 'Staff';
  if (lang === 'hi') return `${n} मौजूद नहीं हैं।`;
  if (lang === 'gu') return `${n} હાજર નથી.`;
  if (lang === 'mr') return `${n} हजर नाहीत.`;
  return `${n} is not present.`;
}
