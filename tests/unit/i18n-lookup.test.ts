/**
 * Locale key parity + lookup contract for Emergent shell / hub i18n.
 */
import { describe, it, expect } from 'vitest';
import en from '../../src/i18n/en.json';
import hi from '../../src/i18n/hi.json';
import gu from '../../src/i18n/gu.json';
import mr from '../../src/i18n/mr.json';
import { lookup, LANG_STORAGE_KEY } from '../../src/i18n/lookup';

function leafKeys(obj: unknown, prefix = ''): string[] {
  if (!obj || typeof obj !== 'object') return [];
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...leafKeys(v, p));
    else out.push(p);
  }
  return out;
}

const SHELL_KEYS = [
  'nav.more',
  'nav.analytics',
  'nav.masters',
  'nav.invoiceShort',
  'nav.quotesShort',
  'navSections.supplyChain',
  'common.syncNow',
  'common.downloadPdf',
  'dashboard.moneyOverview',
  'dashboard.outstanding',
  'masters.staff',
  'masters.prices',
  'masters.clientsRates',
  'invoices.newInvoice',
  'invoices.noInvoicesYet',
  'quotations.newQuote',
  'settings.showAccounts',
  'settings.dataManagement',
];

describe('i18n locale parity', () => {
  const enKeys = new Set(leafKeys(en));

  for (const [name, dict] of [
    ['hi', hi],
    ['gu', gu],
    ['mr', mr],
  ] as const) {
    it(`${name} has every English leaf key`, () => {
      const keys = new Set(leafKeys(dict));
      const missing = [...enKeys].filter(k => !keys.has(k));
      expect(missing).toEqual([]);
    });
  }

  it('shell / hub keys resolve in English', () => {
    for (const key of SHELL_KEYS) {
      const value = lookup(en, key);
      expect(value).not.toBe(key);
      expect(value.length).toBeGreaterThan(0);
    }
  });

  it('lookup falls back to the key when missing', () => {
    expect(lookup(en, 'nav.notARealKey')).toBe('nav.notARealKey');
  });

  it('uses stable device language storage key', () => {
    expect(LANG_STORAGE_KEY).toBe('dhandho_lang');
  });
});
