import { getAccessLevel, type AccessLevel } from '../middleware/permissions';
import type { ToolContext } from './types';

export function assertModuleAccess(ctx: ToolContext, module: string, need: AccessLevel): string | null {
  const level = getAccessLevel(ctx.permissions, ctx.role, module);
  const rank: Record<AccessLevel, number> = { hidden: 0, view: 1, print: 2, full: 3 };
  if (rank[level] < rank[need]) {
    return `You do not have permission for ${module} (${need} required).`;
  }
  return null;
}

const FORBIDDEN_KEYS = new Set(['tenantid', 'tenant_id', 'userid', 'user_id', 'organizationid', 'organization_id']);

/** Drop model-supplied tenant/user identifiers. Server context is authoritative. */
export function sanitizeToolArgs(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (FORBIDDEN_KEYS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

export function asSearchQuery(value: unknown, max = 80): string {
  return String(value ?? '')
    .replace(/[\u0000-\u001f]/g, '')
    .trim()
    .slice(0, max);
}

export function asId(value: unknown): string {
  return String(value ?? '')
    .trim()
    .slice(0, 64);
}

export function asQty(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || n > 1_000_000) return null;
  return n;
}

export function escapeLike(s: string): string {
  return s.replace(/[%_\\]/g, '\\$&');
}
