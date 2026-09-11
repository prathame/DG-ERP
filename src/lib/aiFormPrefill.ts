/** Prefill from Dhandho AI chat params. Extra keys are ignored by forms that do not use them. */

export function pickPrefill(params?: Record<string, string> | null): Record<string, string> | null {
  if (!params) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(params)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return Object.keys(out).length ? out : null;
}

export function prefillCustomerName(p?: Record<string, string> | null): string {
  return (p?.customerName || p?.customer || p?.partyName || '').trim();
}

export function prefillSupplierName(p?: Record<string, string> | null): string {
  return (p?.supplierName || p?.supplier || p?.vendorName || '').trim();
}

export function prefillProductName(p?: Record<string, string> | null): string {
  return (p?.productName || p?.item || p?.itemName || '').trim();
}

export function parsePrefillQty(raw?: string): number {
  const n = Number(String(raw ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function matchByName<T extends { name: string }>(list: T[], raw?: string): T | undefined {
  const n = (raw || '').trim().toLowerCase();
  if (!n) return undefined;
  const exact = list.find(x => x.name.toLowerCase() === n);
  if (exact) return exact;
  const contains = list.find(x => {
    const name = x.name.toLowerCase();
    return name.includes(n) || n.includes(name);
  });
  if (contains) return contains;
  const tokens = n.split(/[^a-z0-9]+/i).filter(t => t.length > 2);
  if (!tokens.length) return undefined;
  return list.find(x => tokens.every(t => x.name.toLowerCase().includes(t)));
}
