function getSessionSlug(): string {
  const path = window.location.pathname;
  if (path.startsWith('/admin')) return '_admin';
  const match = path.match(/^\/([a-z0-9][a-z0-9-]*)/i);
  return match ? `_${match[1].toLowerCase()}` : '';
}

function scopedKey(key: string): string {
  return `${key}${getSessionSlug()}`;
}

/**
 * Persist only what the SPA needs for auth/nav. Phone, address, and GST stay
 * off localStorage (XSS-readable) — load those via GET /api/settings/profile.
 */
function sanitizeUserForStorage(user: unknown): Record<string, unknown> {
  const u = (user && typeof user === 'object') ? user as Record<string, unknown> : {};
  const {
    phone: _phone,
    address: _address,
    gstNumber: _gst,
    gst_number: _gst2,
    ...rest
  } = u;
  return rest;
}

export const session = {
  getToken: () => localStorage.getItem(scopedKey('auth_token')),
  setToken: (token: string) => localStorage.setItem(scopedKey('auth_token'), token),
  removeToken: () => localStorage.removeItem(scopedKey('auth_token')),

  getTenantId: () => localStorage.getItem(scopedKey('tenant_id')),
  setTenantId: (id: string) => localStorage.setItem(scopedKey('tenant_id'), id),
  getSlug: () => localStorage.getItem(scopedKey('tenant_slug')),
  setSlug: (slug: string) => localStorage.setItem(scopedKey('tenant_slug'), slug),

  getUser: () => {
    const raw = localStorage.getItem(scopedKey('dhandho_user'));
    return raw ? JSON.parse(raw) : null;
  },
  setUser: (user: unknown) => {
    localStorage.setItem(scopedKey('dhandho_user'), JSON.stringify(sanitizeUserForStorage(user)));
  },

  clearAll: () => {
    session.removeToken();
    localStorage.removeItem(scopedKey('tenant_id'));
    localStorage.removeItem(scopedKey('tenant_slug'));
    localStorage.removeItem(scopedKey('dhandho_user'));
    localStorage.removeItem(scopedKey('remember_me'));
  },
};
