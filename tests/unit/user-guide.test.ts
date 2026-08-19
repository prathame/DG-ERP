import { describe, expect, it } from 'vitest';
import en from '../../src/i18n/en.json';
import hi from '../../src/i18n/hi.json';
import gu from '../../src/i18n/gu.json';
import mr from '../../src/i18n/mr.json';
import {
  ACCOUNTANT_GUIDE_IDS,
  SHOP_GUIDE_IDS,
  filterGuideTopics,
  isGuideTopicOn,
  resolveGuideTopics,
} from '../../src/features/settings/userGuideContent';
import { matchChatbotHelp } from '../../shared/chatbotHelp';

describe('in-app user guide', () => {
  it('resolves shop and accountant topics from English copy', () => {
    const shop = resolveGuideTopics(en.userGuide.shop, SHOP_GUIDE_IDS);
    const acc = resolveGuideTopics(en.userGuide.accountant, ACCOUNTANT_GUIDE_IDS);
    expect(shop.length).toBe(SHOP_GUIDE_IDS.length);
    expect(acc.length).toBe(ACCOUNTANT_GUIDE_IDS.length);
    expect(shop.some(t => t.id === 'shop-invoice')).toBe(true);
    expect(acc.some(t => t.id === 'acc-receipt')).toBe(true);
  });

  it('has the same topic ids in Hindi, Gujarati, and Marathi', () => {
    for (const loc of [hi, gu, mr]) {
      expect(resolveGuideTopics(loc.userGuide.shop, SHOP_GUIDE_IDS).length).toBe(SHOP_GUIDE_IDS.length);
      expect(resolveGuideTopics(loc.userGuide.accountant, ACCOUNTANT_GUIDE_IDS).length).toBe(
        ACCOUNTANT_GUIDE_IDS.length,
      );
    }
    expect(hi.userGuide.shop['shop-start']!.title).not.toBe(en.userGuide.shop['shop-start']!.title);
  });

  it('hides topics for Super Admin / device tab toggles', () => {
    const none = () => false;
    const only = (id: string) => ['invoices', 'masters'].includes(id);
    expect(isGuideTopicOn('shop-stock', { tabOn: none, booksOn: false, isAdmin: true })).toBe(false);
    expect(isGuideTopicOn('shop-invoice', { tabOn: only, booksOn: false, isAdmin: false })).toBe(true);
    expect(isGuideTopicOn('shop-dispatch', { tabOn: only, booksOn: false, isAdmin: true })).toBe(false);
    expect(isGuideTopicOn('acc-receipt', { tabOn: none, booksOn: false, isAdmin: true })).toBe(false);
    expect(isGuideTopicOn('acc-receipt', { tabOn: none, booksOn: true, isAdmin: true })).toBe(true);
    expect(isGuideTopicOn('shop-backup', { tabOn: none, booksOn: true, isAdmin: false })).toBe(false);
    expect(isGuideTopicOn('shop-backup', { tabOn: none, booksOn: true, isAdmin: true })).toBe(true);
  });

  it('filters a topic list to matching toggles', () => {
    const topics = resolveGuideTopics(en.userGuide.shop, SHOP_GUIDE_IDS);
    const onlyInvoice = filterGuideTopics(topics, {
      tabOn: id => id === 'invoices',
      booksOn: false,
      isAdmin: false,
    });
    expect(onlyInvoice.map(t => t.id)).toEqual(['shop-start', 'shop-invoice', 'shop-bills']);
  });

  it('chatbot points how-to-use at Settings', () => {
    const reply = matchChatbotHelp('how to use the app');
    expect(reply).toMatch(/Settings/);
    expect(reply).toMatch(/How to use/);
  });
});
