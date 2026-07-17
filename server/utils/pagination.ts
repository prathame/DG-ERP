/** Shared list pagination helpers for Express route handlers. */

export interface PageParams {
  page: number;
  limit: number;
  offset: number;
}

/**
 * Parse `page` / `limit` query params with safe defaults and a hard ceiling.
 * Default limit is high enough for typical SME tenants while capping DoS risk.
 */
export function parsePagination(
  query: Record<string, unknown>,
  opts: { defaultLimit?: number; maxLimit?: number } = {},
): PageParams {
  const defaultLimit = opts.defaultLimit ?? 500;
  const maxLimit = opts.maxLimit ?? 1000;
  const pageRaw = parseInt(String(query.page ?? '1'), 10);
  const limitRaw = parseInt(String(query.limit ?? String(defaultLimit)), 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const limit = Math.min(maxLimit, Math.max(1, Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : defaultLimit));
  return { page, limit, offset: (page - 1) * limit };
}

/** Reject oversized bulk import arrays early. */
export function assertBulkSize(items: unknown, max = 500): string | null {
  if (!Array.isArray(items)) return 'Expected an array';
  if (items.length === 0) return 'Provide at least one item';
  if (items.length > max) return `Too many items (max ${max})`;
  return null;
}
