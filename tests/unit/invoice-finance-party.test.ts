import { describe, it, expect } from 'vitest';
import { parsePartyKey } from '../../server/routes/invoice-finance';

describe('parsePartyKey', () => {
  it('parses vendor and customer keys', () => {
    expect(parsePartyKey('vendor:V-1')).toEqual({
      partyType: 'vendor',
      partyId: 'V-1',
      clientName: null,
      partyKey: 'vendor:V-1',
    });
    expect(parsePartyKey('customer:C-9')).toEqual({
      partyType: 'customer',
      partyId: 'C-9',
      clientName: null,
      partyKey: 'customer:C-9',
    });
  });

  it('supports URL-encoded keys', () => {
    expect(parsePartyKey(encodeURIComponent('vendor:V 1')).partyId).toBe('V 1');
  });

  it('treats plain names and name: prefix as legacy', () => {
    expect(parsePartyKey('Acme Corp')).toEqual({
      partyType: null,
      partyId: null,
      clientName: 'Acme Corp',
      partyKey: 'name:Acme Corp',
    });
    expect(parsePartyKey('name:Acme Corp').partyKey).toBe('name:Acme Corp');
  });

  it('rejects empty party id after type prefix', () => {
    expect(parsePartyKey('vendor:')).toEqual({
      partyType: null,
      partyId: null,
      clientName: '',
      partyKey: 'name:',
    });
  });
});
