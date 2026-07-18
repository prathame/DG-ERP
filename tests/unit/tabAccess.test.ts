import { describe, expect, it } from 'vitest';
import { resolveTabAccess } from '../../src/lib/tabAccess';

describe('resolveTabAccess', () => {
  it('treats empty permissions object as unset (Offline Mobile DB default)', () => {
    const user = { role: 'Admin', permissions: {} };
    expect(resolveTabAccess('analytics', user)).toBe('full');
    expect(resolveTabAccess('masters', user)).toBe('full');
    expect(resolveTabAccess('invoices', user)).toBe('full');
    expect(resolveTabAccess('quotations', user)).toBe('full');
    expect(resolveTabAccess('settings', user)).toBe('full');
  });

  it('uses role defaults when permissions is null', () => {
    expect(resolveTabAccess('analytics', { role: 'Admin', permissions: null })).toBe('full');
    expect(resolveTabAccess('settings', { role: 'Manager', permissions: null })).toBe('view');
    expect(resolveTabAccess('analytics', { role: 'Vendor', permissions: null })).toBe('view');
    expect(resolveTabAccess('masters', { role: 'Vendor', permissions: null })).toBe('hidden');
  });

  it('honors explicit object map and maps dashboard ↔ analytics', () => {
    const user = { role: 'Staff', permissions: { dashboard: 'view', inventory: 'hidden' } };
    expect(resolveTabAccess('analytics', user)).toBe('view');
    expect(resolveTabAccess('inventory', user)).toBe('hidden');
    expect(resolveTabAccess('masters', user)).toBe('hidden');
  });

  it('denies when user is missing', () => {
    expect(resolveTabAccess('analytics', null)).toBe('hidden');
  });
});
