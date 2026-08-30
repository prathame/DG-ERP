import { describe, expect, it } from 'vitest';
import {
  parseBillVoice,
  speechLangTag,
  formatBillVoiceReply,
  formatBillVoiceUnknown,
  parseVoiceCustomer,
  formatVoiceCustomerReply,
  parseVoiceBank,
  formatVoiceBankReply,
  voiceSearchQuery,
  formatVoiceSearchReply,
  formatBillVoiceAskCustomer,
  formatBillVoiceAskProduct,
  parseVoiceGuideName,
  parseVoiceGuidePhone,
  parseVoiceDigits,
  formatVoiceFieldReply,
  isVoiceGuideSkip,
} from '../../src/lib/billVoice';

const parties = [
  { id: 'V1', name: 'Anand Agro' },
  { id: 'V2', name: 'Walk-in' },
];
const products = [
  { id: 'P1', name: 'Wheat Seed', packSize: 1 },
  { id: 'P2', name: 'Cotton Spray', packSize: 12 },
  { id: 'P3', name: 'Bajra' },
];

describe('parseBillVoice', () => {
  it('fills customer and qty from an English sale line', () => {
    const r = parseBillVoice('sale to Anand Agro 2 wheat seed', { parties, products });
    expect(r.partyId).toBe('V1');
    expect(r.lines).toEqual([expect.objectContaining({ productId: 'P1', qty: 2, packs: 0 })]);
  });

  it('matches a short spoken product token when the catalog name is longer', () => {
    const r = parseBillVoice('Anand Agro two bajra', { parties, products });
    expect(r.partyId).toBe('V1');
    expect(r.lines[0]?.productId).toBe('P3');
    expect(r.lines[0]?.qty).toBe(2);
  });

  it('treats spoken qty as packs when the product is boxed', () => {
    const r = parseBillVoice('purchase from Anand Agro 3 cotton spray', { parties, products });
    expect(r.partyId).toBe('V1');
    expect(r.lines[0]).toEqual(expect.objectContaining({ productId: 'P2', packs: 3, qty: 36, spoken: 3 }));
  });

  it('speaks back the filled customer and spoken qty', () => {
    const r = parseBillVoice('sale to Anand Agro 2 wheat seed', { parties, products });
    expect(formatBillVoiceReply(r, 'en')).toBe('Anand Agro, 2 Wheat Seed. Check the form.');
  });

  it('reads Hindi counts when UI lang is Hindi', () => {
    const r = parseBillVoice('Anand Agro teen bajra', { parties, products }, 'hi');
    expect(r.lines[0]?.qty).toBe(3);
  });

  it('does not treat Hindi "do" as 2 in English', () => {
    const r = parseBillVoice('sale to Anand Agro do bajra', { parties, products }, 'en');
    expect(r.lines[0]?.qty).toBe(1);
    expect(r.lines[0]?.qtyHeard).toBe(false);
    expect(formatBillVoiceReply(r, 'en')).toContain('quantity not heard');
  });

  it('returns empty when nothing in the catalog matches', () => {
    const r = parseBillVoice('hello there', { parties, products });
    expect(r.partyId).toBeNull();
    expect(r.lines).toEqual([]);
    expect(formatBillVoiceUnknown('en')).toContain('Nothing was filled');
    expect(formatBillVoiceReply(r, 'en')).toBe(formatBillVoiceUnknown('en'));
  });

  it('does not guess a product from a short leftover word like seed', () => {
    const r = parseBillVoice('Anand Agro 2 seed', { parties, products });
    expect(r.partyId).toBe('V1');
    expect(r.lines).toEqual([]);
    expect(formatBillVoiceReply(r, 'en')).toContain('No matching product');
  });

  it('does not treat an unmatched name as a customer', () => {
    const r = parseBillVoice('sale to Unknown Party 2 wheat seed', { parties, products });
    expect(r.partyId).toBeNull();
    expect(r.lines[0]?.productId).toBe('P1');
    expect(r.unknownParty).toBe('Unknown Party');
  });

  it('offers an unmatched leftover as a product to add', () => {
    const r = parseBillVoice('Anand Agro 2 urea', { parties, products });
    expect(r.partyId).toBe('V1');
    expect(r.lines).toEqual([]);
    expect(r.unknownProduct).toBe('Urea');
  });

  it('does not treat greeting speech as a name to add', () => {
    const r = parseBillVoice('hello there', { parties, products });
    expect(r.unknownParty).toBeNull();
    expect(r.unknownProduct).toBeNull();
  });

  it('asks whether to add a missing customer or product', () => {
    expect(formatBillVoiceAskCustomer('Ramesh', 'en')).toContain('add this customer');
    expect(formatBillVoiceAskProduct('Urea', 'en')).toContain('add this product');
  });

  it('says quantity was not heard instead of inventing a count', () => {
    const r = parseBillVoice('Anand Agro bajra', { parties, products });
    expect(r.lines[0]?.qtyHeard).toBe(false);
    expect(formatBillVoiceReply(r, 'en')).toContain('quantity not heard');
  });

  it('maps UI lang to an Indic speech tag', () => {
    expect(speechLangTag('gu')).toBe('gu-IN');
    expect(speechLangTag('en')).toBe('en-IN');
  });
});

describe('parseVoiceCustomer', () => {
  it('fills name and a 10-digit phone', () => {
    expect(parseVoiceCustomer('add customer Anand Agro 9876543210')).toEqual({
      name: 'Anand Agro',
      phone: '9876543210',
    });
  });

  it('does not treat greeting speech as a customer name', () => {
    expect(parseVoiceCustomer('hello there')).toEqual({ name: '', phone: '' });
    expect(formatVoiceCustomerReply({ name: '', phone: '' }, 'en')).toContain('Nothing was filled');
  });

  it('does not invent a phone from fewer than 10 digits', () => {
    const r = parseVoiceCustomer('Anand Agro 12345');
    expect(r.phone).toBe('');
    expect(r.name).toBe('Anand Agro');
  });
});

describe('parseVoiceBank', () => {
  it('fills a known bank, account number, and IFSC', () => {
    const r = parseVoiceBank('add HDFC 123456789012 SBIN0001234');
    expect(r.bankName).toBe('HDFC Bank');
    expect(r.accountNumber).toBe('123456789012');
    expect(r.ifscCode).toBe('SBIN0001234');
    expect(r.name).toBe('');
  });

  it('does not copy the bank name onto the account holder', () => {
    const r = parseVoiceBank('add HDFC 123456789012');
    expect(r.bankName).toBe('HDFC Bank');
    expect(r.name).toBe('');
  });

  it('fills account holder when a leftover name is spoken', () => {
    const r = parseVoiceBank('add Patel HDFC 123456789012');
    expect(r.name).toBe('Patel');
    expect(r.bankName).toBe('HDFC Bank');
  });

  it('returns empty when nothing bank-like was heard', () => {
    expect(parseVoiceBank('hello there')).toEqual({
      name: '',
      accountNumber: '',
      bankName: '',
      branch: '',
      ifscCode: '',
    });
    expect(formatVoiceBankReply(parseVoiceBank('hello there'), 'en')).toContain('Nothing was filled');
  });
});

describe('voiceSearchQuery', () => {
  it('strips search filler and keeps the query', () => {
    expect(voiceSearchQuery('search invoice Anand')).toBe('anand');
  });

  it('does not search greeting speech', () => {
    expect(voiceSearchQuery('hello there')).toBe('');
    expect(formatVoiceSearchReply('', 'en')).toContain('Please type it');
  });
});

describe('voice field fill', () => {
  it('parses a spoken name or phone and ignores greetings', () => {
    expect(parseVoiceGuideName('Anand Agro')).toBe('Anand Agro');
    expect(parseVoiceGuideName('hello there')).toBe('');
    expect(parseVoiceGuidePhone('9876543210')).toBe('9876543210');
    expect(parseVoiceGuidePhone('hello')).toBe('');
  });

  it('does not treat a real name as skip', () => {
    expect(isVoiceGuideSkip('skip')).toBe(true);
    expect(isVoiceGuideSkip('Anand Agro')).toBe(false);
  });

  it('speaks back the filled field', () => {
    expect(formatVoiceFieldReply('Name', 'Anand Agro', 'en')).toBe('Name: Anand Agro.');
    expect(formatVoiceFieldReply('નામ', 'Anand Agro', 'gu')).toContain('Anand Agro');
  });

  it('pulls digits for credit fields', () => {
    expect(parseVoiceDigits('thirty 30 days')).toBe('30');
    expect(parseVoiceDigits('hello')).toBe('');
  });
});
