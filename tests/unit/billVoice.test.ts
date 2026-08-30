import { describe, expect, it } from 'vitest';
import { parseBillVoice, speechLangTag, formatBillVoiceReply, formatBillVoiceUnknown } from '../../src/lib/billVoice';

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
