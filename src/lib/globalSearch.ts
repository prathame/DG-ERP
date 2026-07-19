import type { Tab } from '../types';

/** Response shape from `GET /api/search` / `api.search.global`. */
export type GlobalSearchResults = {
  products: { id: string; name: string; price: number; stock: number; type?: 'product' }[];
  customers: { id: string; name: string; phone: string; email: string; type?: 'customer' }[];
  vendors: { id: string; name: string; contact: string; phone: string; type?: 'vendor' }[];
  barcodes: { barcode: string; productName: string; productId: string; status: string; type?: 'barcode' }[];
  challans?: { batchId: string; vendorName: string; date: string; units: number; type?: 'challan' }[];
  staff?: { name: string; totalPaid: number; payments: number; lastPayment: string; type?: 'staff' }[];
};

export type GlobalSearchEntityKind = 'product' | 'customer' | 'vendor' | 'barcode' | 'challan' | 'staff';

/** Masters hub targets reachable from global search. */
export type GlobalSearchMaster = 'customer' | 'vendor' | 'item' | 'priceList' | 'staff';

/** Destination when picking a global-search hit (never verify). */
export type GlobalSearchNavigate = {
  tab: Tab;
  master?: GlobalSearchMaster;
  vendorId?: string;
  staffName?: string;
};

export function emptyGlobalSearchResults(): GlobalSearchResults {
  return { products: [], customers: [], vendors: [], barcodes: [], challans: [], staff: [] };
}

export function globalSearchHasHits(r: GlobalSearchResults | null | undefined): boolean {
  if (!r) return false;
  return (
    r.products.length > 0 ||
    r.customers.length > 0 ||
    r.vendors.length > 0 ||
    r.barcodes.length > 0 ||
    (r.challans?.length ?? 0) > 0 ||
    (r.staff?.length ?? 0) > 0
  );
}

/** Map a search hit to a tab (and optional Masters deep-link). No verify path. */
export function navigateForGlobalSearchHit(
  kind: GlobalSearchEntityKind,
  hit: { id?: string; name?: string; productId?: string },
  opts?: {
    inventoryVisible?: boolean;
    distributionVisible?: boolean;
    /** @deprecated use servicePhoneUx */
    serviceMobile?: boolean;
    servicePhoneUx?: boolean;
  },
): GlobalSearchNavigate {
  const inventoryVisible = opts?.inventoryVisible !== false;
  const distributionVisible = opts?.distributionVisible !== false;
  const serviceMobile = !!(opts?.servicePhoneUx ?? opts?.serviceMobile);

  switch (kind) {
    case 'product':
      if (serviceMobile) return { tab: 'masters', master: 'priceList' };
      return inventoryVisible ? { tab: 'inventory' } : { tab: 'masters', master: 'item' };
    case 'barcode':
      if (serviceMobile) return { tab: 'masters', master: 'priceList' };
      return inventoryVisible ? { tab: 'inventory' } : { tab: 'masters', master: 'item' };
    case 'customer':
      return { tab: 'masters', master: 'customer' };
    case 'vendor':
      return { tab: 'masters', master: 'vendor', vendorId: hit.id };
    case 'challan':
      return distributionVisible ? { tab: 'distribution' } : { tab: 'masters' };
    case 'staff':
      return { tab: 'masters', master: 'staff', staffName: hit.name };
    default:
      return { tab: 'masters' };
  }
}
