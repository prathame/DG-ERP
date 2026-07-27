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

  it('treats empty permissions array as unset', () => {
    expect(resolveTabAccess('analytics', { role: 'Admin', permissions: [] })).toBe('full');
    expect(resolveTabAccess('masters', { role: 'Admin', permissions: [] })).toBe('full');
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

  it('maps hospitality module permission onto hosp_* tabs', () => {
    const user = { role: 'Staff', permissions: { hospitality: 'full', inventory: 'view' } };
    expect(resolveTabAccess('hosp_floor', user)).toBe('full');
    expect(resolveTabAccess('hosp_waiter', user)).toBe('full');
    expect(resolveTabAccess('hosp_kitchen', user)).toBe('full');
    expect(resolveTabAccess('hosp_queue', user)).toBe('full');
    expect(resolveTabAccess('hosp_menu', user)).toBe('full');
    expect(resolveTabAccess('hosp_parcels', user)).toBe('full');
    expect(resolveTabAccess('hosp_members', user)).toBe('hidden');
    expect(resolveTabAccess('inventory', user)).toBe('view');
    expect(resolveTabAccess('masters', user)).toBe('hidden');
  });

  it('legacy permission arrays treat hospitality as full for hosp_* tabs', () => {
    const user = { role: 'Staff', permissions: ['hospitality', 'dashboard'] };
    expect(resolveTabAccess('hosp_floor', user)).toBe('full');
    expect(resolveTabAccess('hosp_members', user)).toBe('hidden');
    expect(resolveTabAccess('analytics', user)).toBe('full');
    expect(resolveTabAccess('inventory', user)).toBe('hidden');
  });

  it('Staff role defaults grant full hospitality tabs when permissions unset', () => {
    expect(resolveTabAccess('hosp_kitchen', { role: 'Staff', permissions: null })).toBe('full');
    expect(resolveTabAccess('hosp_members', { role: 'Staff', permissions: null })).toBe('hidden');
    expect(resolveTabAccess('inventory', { role: 'Staff', permissions: null })).toBe('view');
  });

  it('Waiter sees only Waiter Orders + Entry Queue', () => {
    const user = { role: 'Waiter', permissions: { hospitality: 'full' } };
    expect(resolveTabAccess('hosp_waiter', user)).toBe('full');
    expect(resolveTabAccess('hosp_queue', user)).toBe('full');
    expect(resolveTabAccess('hosp_kitchen', user)).toBe('hidden');
    expect(resolveTabAccess('hosp_floor', user)).toBe('hidden');
    expect(resolveTabAccess('hosp_menu', user)).toBe('hidden');
    expect(resolveTabAccess('hosp_members', user)).toBe('hidden');
    expect(resolveTabAccess('settings', user)).toBe('hidden');
    expect(resolveTabAccess('invoices', user)).toBe('hidden');
  });

  it('Host sees only Entry Queue', () => {
    const user = { role: 'Host', permissions: null };
    expect(resolveTabAccess('hosp_queue', user)).toBe('full');
    expect(resolveTabAccess('hosp_waiter', user)).toBe('hidden');
    expect(resolveTabAccess('hosp_kitchen', user)).toBe('hidden');
    expect(resolveTabAccess('finance', user)).toBe('hidden');
    expect(resolveTabAccess('settings', user)).toBe('hidden');
  });

  it('Kitchen sees only Kitchen tab', () => {
    const user = { role: 'Kitchen', permissions: { hospitality: 'full', inventory: 'view' } };
    expect(resolveTabAccess('hosp_kitchen', user)).toBe('full');
    expect(resolveTabAccess('hosp_waiter', user)).toBe('hidden');
    expect(resolveTabAccess('hosp_queue', user)).toBe('hidden');
    expect(resolveTabAccess('inventory', user)).toBe('hidden');
    expect(resolveTabAccess('settings', user)).toBe('hidden');
  });

  it('Admin with hospitality permission still sees all hosp_* tabs including Members', () => {
    const user = { role: 'Admin', permissions: { hospitality: 'full', settings: 'full' } };
    expect(resolveTabAccess('hosp_floor', user)).toBe('full');
    expect(resolveTabAccess('hosp_menu', user)).toBe('full');
    expect(resolveTabAccess('hosp_members', user)).toBe('full');
    expect(resolveTabAccess('settings', user)).toBe('full');
  });

  it('hotel_restaurant: Settings is Admin-only (Manager/Staff cannot open even with settings:view)', () => {
    expect(
      resolveTabAccess('settings', {
        role: 'Admin',
        businessType: 'hotel_restaurant',
        permissions: null,
      }),
    ).toBe('full');
    expect(
      resolveTabAccess('settings', {
        role: 'Manager',
        businessType: 'hotel_restaurant',
        permissions: { settings: 'view', hospitality: 'full' },
      }),
    ).toBe('hidden');
    expect(
      resolveTabAccess('settings', {
        role: 'Staff',
        businessType: 'hotel_restaurant',
        permissions: { settings: 'view' },
      }),
    ).toBe('hidden');
    // Other business types keep Manager settings:view
    expect(resolveTabAccess('settings', { role: 'Manager', businessType: 'manufacturer', permissions: null })).toBe(
      'view',
    );
  });
});
