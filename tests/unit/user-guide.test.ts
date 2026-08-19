import { describe, expect, it } from 'vitest';
import { ACCOUNTANT_GUIDE_TOPICS, SHOP_GUIDE_TOPICS } from '../../src/features/settings/userGuideContent';
import { matchChatbotHelp } from '../../shared/chatbotHelp';

describe('in-app user guide', () => {
  it('has shop and accountant topics', () => {
    expect(SHOP_GUIDE_TOPICS.length).toBeGreaterThan(4);
    expect(ACCOUNTANT_GUIDE_TOPICS.length).toBeGreaterThan(4);
    expect(SHOP_GUIDE_TOPICS.some(t => t.id === 'shop-invoice')).toBe(true);
    expect(ACCOUNTANT_GUIDE_TOPICS.some(t => t.id === 'acc-receipt')).toBe(true);
  });

  it('chatbot points how-to-use at Settings', () => {
    const reply = matchChatbotHelp('how to use the app');
    expect(reply).toMatch(/Settings/);
    expect(reply).toMatch(/How to use/);
  });
});
