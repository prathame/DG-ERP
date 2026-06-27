function getSessionSlug(): string {
  const path = window.location.pathname;
  if (path.startsWith('/admin')) return '_admin';
  const match = path.match(/^\/([a-z0-9][a-z0-9-]*)/i);
  return match ? `_${match[1].toLowerCase()}` : '';
}

function scopedKey(key: string): string {
  return `${key}${getSessionSlug()}`;
}

export const session = {
  getToken: () => localStorage.getItem(scopedKey('auth_token')),
  setToken: (token: string) => localStorage.setItem(scopedKey('auth_token'), token),
  removeToken: () => localStorage.removeItem(scopedKey('auth_token')),

  getTenantId: () => localStorage.getItem(scopedKey('tenant_id')),
  setTenantId: (id: string) => localStorage.setItem(scopedKey('tenant_id'), id),
  removeTenantId: () => localStorage.removeItem(scopedKey('tenant_id')),

  getSlug: () => localStorage.getItem(scopedKey('tenant_slug')),
  setSlug: (slug: string) => localStorage.setItem(scopedKey('tenant_slug'), slug),
  removeSlug: () => localStorage.removeItem(scopedKey('tenant_slug')),

  getUser: () => {
    const raw = localStorage.getItem(scopedKey('dg_erp_user'));
    return raw ? JSON.parse(raw) : null;
  },
  setUser: (user: unknown) => localStorage.setItem(scopedKey('dg_erp_user'), JSON.stringify(user)),
  removeUser: () => localStorage.removeItem(scopedKey('dg_erp_user')),

  clearAll: () => {
    session.removeToken();
    session.removeTenantId();
    session.removeSlug();
    session.removeUser();
    localStorage.removeItem(scopedKey('remember_me'));
  },
};
