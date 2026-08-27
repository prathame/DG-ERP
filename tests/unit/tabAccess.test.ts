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

  it('Accountant with a stale permissions map still gets books from accounts', () => {
    const user = {
      role: 'Accountant',
      permissions: {
        accounts: 'view',
        dashboard: 'view',
        sales: 'view',
        settings: 'view',
      },
    };
    expect(resolveTabAccess('books', user)).toBe('view');
    expect(resolveTabAccess('book_ledgers', user)).toBe('view');
    expect(resolveTabAccess('invoices', user)).toBe('view');
  });

  it('Accountant role defaults: books and accounts write, settings hidden', () => {
    const user = { role: 'Accountant', permissions: null };
    expect(resolveTabAccess('books', user)).toBe('full');
    expect(resolveTabAccess('book_ledgers', user)).toBe('full');
    expect(resolveTabAccess('accounts', user)).toBe('full');
    expect(resolveTabAccess('finance', user)).toBe('full');
    expect(resolveTabAccess('purchases', user)).toBe('full');
    expect(resolveTabAccess('invoices', user)).toBe('view');
    expect(resolveTabAccess('inventory', user)).toBe('view');
    expect(resolveTabAccess('settings', user)).toBe('hidden');
    expect(resolveTabAccess('masters', user)).toBe('hidden');
    expect(resolveTabAccess('quotations', user)).toBe('hidden');
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
    expect(resolveTabAccess('quotations', user)).toBe('hidden');
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

  describe('unmapped nav tabs fall back to their governing permission module', () => {
    // Regression: server/routes/service-cloud.ts always stores a fully-populated permissions
    // object for SA-created seat users (normalizePermissions(null, role)), and Settings → Add
    // User does the same. Before the fix, tabs with no dedicated permission key (masters,
    // invoices, chatbot) always resolved to 'hidden' for these users regardless of role,
    // silently dropping "Manage Staff" / Invoices from the Cap service-phone nav.
    it('masters falls back to the settings permission level', () => {
      const admin = { role: 'Admin', permissions: { settings: 'full', sales: 'full' } };
      expect(resolveTabAccess('masters', admin)).toBe('full');
      const staff = { role: 'Staff', permissions: { settings: 'view', sales: 'view' } };
      expect(resolveTabAccess('masters', staff)).toBe('view');
      const restricted = { role: 'Staff', permissions: { settings: 'hidden', sales: 'view' } };
      expect(resolveTabAccess('masters', restricted)).toBe('hidden');
    });

    it('invoices falls back to the sales permission level', () => {
      const admin = { role: 'Admin', permissions: { sales: 'full', settings: 'view' } };
      expect(resolveTabAccess('invoices', admin)).toBe('full');
      const staff = { role: 'Staff', permissions: { sales: 'view', settings: 'view' } };
      expect(resolveTabAccess('invoices', staff)).toBe('view');
    });

    it('chatbot falls back to the dashboard permission level', () => {
      const admin = { role: 'Admin', permissions: { dashboard: 'full', settings: 'view' } };
      expect(resolveTabAccess('chatbot', admin)).toBe('full');
    });

    it('verification has no backend permission module — falls through to role defaults instead of denying', () => {
      const admin = { role: 'Admin', permissions: { settings: 'full', sales: 'full' } };
      expect(resolveTabAccess('verification', admin)).toBe('full');
      const staff = { role: 'Staff', permissions: { settings: 'view', sales: 'view' } };
      expect(resolveTabAccess('verification', staff)).toBe('view');
      const vendor = { role: 'Vendor', permissions: { settings: 'hidden', sales: 'hidden' } };
      expect(resolveTabAccess('verification', vendor)).toBe('hidden');
    });

    it('still hides masters/invoices when the fallback module itself is unset in a narrow explicit map', () => {
      const user = { role: 'Staff', permissions: { dashboard: 'view', inventory: 'hidden' } };
      expect(resolveTabAccess('masters', user)).toBe('hidden');
      expect(resolveTabAccess('invoices', user)).toBe('hidden');
    });

    it('SA-created service-cloud seat user (role Admin, fully-populated preset) sees every tab', () => {
      // Mirrors normalizePermissions(null, 'Admin') from server/middleware/permissions.ts.
      const allFull = Object.fromEntries(
        [
          'dashboard',
          'sales',
          'distribution',
          'inventory',
          'purchases',
          'quotations',
          'orders',
          'finance',
          'accounts',
          'warranty',
          'replacements',
          'rewards',
          'settings',
          'hospitality',
        ].map(m => [m, 'full']),
      );
      const seatUser = { role: 'Admin', businessType: 'service', permissions: allFull };
      for (const tabId of ['analytics', 'masters', 'invoices', 'quotations', 'purchases', 'finance', 'settings']) {
        expect(resolveTabAccess(tabId, seatUser)).toBe('full');
      }
    });
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
