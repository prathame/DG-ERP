import { describe, expect, it } from 'vitest';
import {
  horizontalNavGroupForTab,
  horizontalNavGroupTabIds,
  visibleHorizontalNavGroups,
} from '../../src/lib/horizontalNavLayout';

describe('horizontal nav layout', () => {
  it('maps tabs to groups', () => {
    expect(horizontalNavGroupForTab('analytics')).toBe('analytics');
    expect(horizontalNavGroupForTab('invoices')).toBe('operations');
    expect(horizontalNavGroupForTab('finance')).toBe('finance');
    expect(horizontalNavGroupForTab('inventory')).toBe('inventory');
    expect(horizontalNavGroupForTab('warranty')).toBe('afterSales');
    expect(horizontalNavGroupForTab('unknown')).toBe('analytics');
  });

  it('lists tabs per group', () => {
    expect(horizontalNavGroupTabIds('finance')).toEqual(['finance', 'accounts']);
  });

  it('hides empty groups', () => {
    const groups = visibleHorizontalNavGroups(new Set(['analytics', 'finance']));
    expect(groups.map(g => g.id)).toEqual(['analytics', 'finance']);
  });
});
