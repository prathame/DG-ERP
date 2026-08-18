import { describe, expect, it } from 'vitest';
import { isHowToChatQuery, matchChatbotHelp } from '../../shared/chatbotHelp';

describe('chatbotHelp', () => {
  it('does not steal live data phrases', () => {
    expect(matchChatbotHelp('sales today')).toBeNull();
    expect(matchChatbotHelp('low stock')).toBeNull();
    expect(matchChatbotHelp('pending payments')).toBeNull();
    expect(matchChatbotHelp('help')).toBeNull();
  });

  it('answers sale units and invoice how-to', () => {
    const units = matchChatbotHelp('how to set sale units');
    expect(units).toMatch(/Bill Customization/);
    expect(units).toMatch(/Sale Units/);

    const inv = matchChatbotHelp('how to create invoice');
    expect(inv).toMatch(/Invoices/);
  });

  it('treats help with as how-to', () => {
    expect(isHowToChatQuery('help with gst')).toBe(true);
    const gst = matchChatbotHelp('help with gst');
    expect(gst).toMatch(/GST/);
  });
});
