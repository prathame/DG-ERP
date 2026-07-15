import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';

export type AccessLevel = 'hidden' | 'view' | 'print' | 'full';

const ALL_MODULES = [
  'dashboard', 'sales', 'distribution', 'inventory', 'purchases', 'quotations',
  'orders', 'finance', 'accounts', 'warranty', 'replacements', 'rewards', 'settings',
] as const;

const ROLE_PRESETS: Record<string, Record<string, AccessLevel>> = {
  Admin: Object.fromEntries(ALL_MODULES.map((m) => [m, 'full'])),
  'Super Admin': Object.fromEntries(ALL_MODULES.map((m) => [m, 'full'])),
  Manager: Object.fromEntries(ALL_MODULES.map((m) => [m, m === 'settings' ? 'view' : 'full'])),
  Staff: Object.fromEntries(ALL_MODULES.map((m) => [m, 'view'])),
  Warehouse: {
    dashboard: 'view', sales: 'hidden', distribution: 'print', inventory: 'view',
    purchases: 'hidden', quotations: 'hidden', orders: 'hidden', finance: 'hidden',
    accounts: 'hidden', warranty: 'hidden', replacements: 'hidden', rewards: 'hidden', settings: 'hidden',
  },
  Vendor: {
    dashboard: 'view', sales: 'hidden', distribution: 'view', inventory: 'hidden',
    purchases: 'hidden', quotations: 'hidden', orders: 'hidden', finance: 'view',
    accounts: 'hidden', warranty: 'hidden', replacements: 'hidden', rewards: 'hidden', settings: 'hidden',
  },
};

const RANK: Record<AccessLevel, number> = { hidden: 0, view: 1, print: 2, full: 3 };

/** Prefix → module. First match wins. Unmapped paths are not gated. */
const PATH_MODULE: [string, string][] = [
  ['/vendor-finance', 'finance'],
  ['/invoice-finance', 'finance'],
  ['/accounts', 'accounts'],
  ['/reports', 'accounts'],
  ['/gst', 'accounts'],
  ['/gstr', 'accounts'],
  ['/gstr2b', 'accounts'],
  ['/gstr3b', 'accounts'],
  ['/payroll', 'accounts'],
  ['/staff', 'accounts'],
  ['/expenses', 'accounts'],
  ['/banks', 'accounts'],
  ['/dashboard', 'dashboard'],
  ['/analytics', 'dashboard'],
  ['/sales', 'sales'],
  ['/distribution', 'distribution'],
  ['/products', 'inventory'],
  ['/categories', 'inventory'],
  ['/purchases', 'purchases'],
  ['/suppliers', 'purchases'],
  ['/supplier-finance', 'purchases'],
  ['/quotations', 'quotations'],
  ['/orders', 'orders'],
  ['/warranties', 'warranty'],
  ['/replacements', 'replacements'],
  ['/rewards', 'rewards'],
  ['/reward-rules', 'rewards'],
  ['/redemption-settings', 'rewards'],
  ['/admin', 'settings'],
  ['/backup', 'settings'],
  ['/masters', 'settings'],
  ['/settings/bill', 'settings'],
  ['/chatbot', 'dashboard'],
  ['/price-lists', 'inventory'],
  ['/invoices', 'sales'],
  ['/customers', 'sales'],
  ['/mapping', 'sales'],
  ['/vendors', 'distribution'],
  ['/search', 'dashboard'],
];

export function normalizePermissions(perms: unknown, role?: string): Record<string, AccessLevel> {
  if (perms && typeof perms === 'object' && !Array.isArray(perms)) {
    return perms as Record<string, AccessLevel>;
  }
  if (Array.isArray(perms)) {
    return Object.fromEntries(
      ALL_MODULES.map((m) => [m, (perms as string[]).includes(m) ? 'full' : 'hidden'])
    );
  }
  return ROLE_PRESETS[role || 'Staff'] || ROLE_PRESETS.Staff;
}

export function getAccessLevel(
  permissions: Record<string, AccessLevel> | null | undefined,
  role: string | undefined,
  module: string,
): AccessLevel {
  if (role && ['Admin', 'Super Admin', 'super_admin'].includes(role)) return 'full';
  const perms = permissions && Object.keys(permissions).length
    ? permissions
    : (ROLE_PRESETS[role || ''] || ROLE_PRESETS.Staff);
  const level = perms[module];
  if (level === 'full' || level === 'print' || level === 'view' || level === 'hidden') return level;
  // Missing key: fall back to role preset, then hidden
  const fallback = (ROLE_PRESETS[role || ''] || {})[module];
  if (fallback) return fallback;
  return 'hidden';
}

export function moduleForPath(apiPath: string): string | null {
  const p = apiPath.startsWith('/') ? apiPath : `/${apiPath}`;
  for (const [prefix, mod] of PATH_MODULE) {
    if (p === prefix || p.startsWith(prefix + '/') || p.startsWith(prefix + '?')) return mod;
  }
  return null;
}

/** Global gate: enforce module permissions after auth. */
export function enforceModulePermissions(req: AuthRequest, res: Response, next: NextFunction) {
  const user = req.user;
  if (!user?.userId) return next(); // public / platform paths already handled

  const mod = moduleForPath(req.path);
  if (!mod) return next();

  const perms = (user as AuthRequest['user'] & { permissions?: Record<string, AccessLevel> })?.permissions;
  const level = getAccessLevel(perms, user.role, mod);
  const need: AccessLevel = req.method === 'GET' || req.method === 'HEAD' ? 'view' : 'full';
  if (RANK[level] < RANK[need]) {
    return res.status(403).json({
      error: `Access denied for module "${mod}" (need ${need}, have ${level}).`,
    });
  }
  next();
}
