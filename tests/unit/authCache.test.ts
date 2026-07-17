import { describe, it, expect, beforeEach } from 'vitest';
import { getCachedAuth, setCachedAuth, invalidateAuthCache, clearAuthCache } from '../../server/utils/authCache';

describe('authCache', () => {
  beforeEach(() => clearAuthCache());

  const row = {
    password_changed_at: null,
    role: 'Admin',
    vendor_id: null,
    permissions: { analytics: 'full' },
    status: 'active',
    subscription_ends_at: null,
    trial_ends_at: null,
  };

  it('stores and retrieves by user/tenant/iat', () => {
    expect(getCachedAuth('u1', 't1', 100)).toBeNull();
    setCachedAuth('u1', 't1', 100, row);
    expect(getCachedAuth('u1', 't1', 100)?.role).toBe('Admin');
    expect(getCachedAuth('u1', 't1', 101)).toBeNull();
  });

  it('invalidates all iats for a user+tenant', () => {
    setCachedAuth('u1', 't1', 100, row);
    setCachedAuth('u1', 't1', 200, row);
    invalidateAuthCache('u1', 't1');
    expect(getCachedAuth('u1', 't1', 100)).toBeNull();
    expect(getCachedAuth('u1', 't1', 200)).toBeNull();
  });
});
