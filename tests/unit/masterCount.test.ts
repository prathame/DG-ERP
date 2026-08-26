import { describe, expect, it } from 'vitest';
import { asMasterCount, openMasterCta } from '../../src/lib/masterCount';

describe('masterCount', () => {
  it('asMasterCount turns postgres COUNT strings into numbers', () => {
    expect(asMasterCount(0)).toBe(0);
    expect(asMasterCount(7)).toBe(7);
    expect(asMasterCount('7')).toBe(7);
    expect(asMasterCount('')).toBe(0);
    expect(asMasterCount(undefined)).toBe(0);
    expect(asMasterCount(null)).toBe(0);
  });

  it('openMasterCta matches the card or tab name', () => {
    expect(openMasterCta('Customers')).toBe('Open Customers');
    expect(openMasterCta('Purchases')).toBe('Open Purchases');
    expect(openMasterCta('Stock')).toBe('Open Stock');
    expect(openMasterCta('Vendors')).toBe('Open Vendors');
    expect(openMasterCta('  ')).toBe('Open');
  });
});
