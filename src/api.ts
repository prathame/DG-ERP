import { session } from './lib/session';
import { resolveApiUrl } from './platforms/shared';
import { clientLogger, ensureCorrelationId } from './lib/logger';

export interface DistributionRecord {
  id: string;
  batchId?: string;
  productId: string;
  productName: string;
  barcode: string;
  vendorId: string;
  vendorName: string;
  distributionDate: string;
  status: string;
  discountPercent?: number;
  netPrice?: number | null;
  gstApplied?: boolean;
  billedPrice?: number | null;
}

export interface DistributionBatch {
  batchId: string;
  vendorId: string;
  vendorName: string;
  distributionDate: string;
  productNames: string[];
  total: number;
  sold: number;
  replaced: number;
  damaged: number;
  availableWithVendor: number;
  billValue: number;
  discountPercent: number;
  gstApplied: boolean;
  amountPaid: number;
  balanceRemaining: number;
  ewbNumber?: string | null;
  irn?: string | null;
  irnQr?: string | null;
  dispatchStatus?: string;
}

export interface DistributionBatchItem {
  productId: string;
  productName: string;
  quantity: number;
  minQuantity: number;
  sold: number;
  replaced: number;
  damaged: number;
  discountPercent: number;
  withGst: boolean;
  availableStock: number;
}

export interface DistributionBatchDetail extends DistributionBatch {
  canDelete: boolean;
  items: DistributionBatchItem[];
}

export interface SaleRecord {
  id: string;
  barcode: string;
  productId: string;
  productName: string;
  vendorId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  purchaseDate: string;
  rewardPointsEarned: number;
  salePrice?: number | null;
}

export interface ReplacementRecord {
  id: string;
  oldBarcode: string;
  newBarcode: string;
  warrantyId?: string | null;
  productId?: string | null;
  productName?: string | null;
  vendorId?: string | null;
  vendorName?: string | null;
  customerName: string;
  customerPhone: string;
  replacedDate: string;
  reason?: string | null;
  createdAt?: string;
}

export interface RewardRule {
  id: string;
  productsSoldThreshold: number;
  rewardPoints: number;
  description?: string | null;
}

export interface SaleBillData {
  id: string;
  barcode: string;
  productName: string;
  productDescription?: string | null;
  batchNumber?: string | null;
  productPrice: number;
  salePrice: number;
  warrantyMonths: number;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  purchaseDate: string;
  rewardPointsEarned: number;
  vendor: {
    name: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
  };
  warranty?: { activationDate: string; expiryDate: string; status: string } | null;
  hsnCode?: string | null;
  gstRate: number;
  company: {
    name: string;
    contactName?: string | null;
    phone?: string | null;
    address?: string | null;
    gstNumber?: string | null;
  };
  vendorFinance?: { totalDistributedValue: number; totalPaid: number; balance: number } | null;
}

export interface DistributionBillData {
  challanId: string;
  batchId?: string | null;
  distributionDate: string;
  vendor: {
    name: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    address?: string | null;
    gstNumber?: string | null;
  };
  company: {
    name: string;
    contactName?: string | null;
    phone?: string | null;
    address?: string | null;
    gstNumber?: string | null;
  };
  gstRate: number;
  ewbNumber?: string | null;
  irn?: string | null;
  irnQr?: string | null;
  irnAckNo?: string | null;
  irnAckDt?: string | null;
  items: {
    sno: number;
    barcode: string;
    productName: string;
    batchNumber?: string | null;
    originalPrice: number;
    discountPercent: number;
    price: number;
    status: string;
  }[];
  groupedItems: {
    sno: number;
    productName: string;
    barcodeRange: string;
    quantity: number;
    originalPrice: number;
    discountPercent: number;
    netPrice: number;
    lineTotal: number;
  }[];
  totalQuantity: number;
  savedGstUnits: number;
  grossValue: number;
  totalDiscount: number;
  totalValue: number;
  totalBilled?: number;
  payment?: { totalDistributedValue: number; totalPaid: number; balance: number };
}

const getCache = new Map<string, { data: unknown; ts: number }>();
const GET_CACHE_TTL = 3000; // M6 fix: 3s (was 15s) — reduces stale UI after mutations

export function invalidateCache(prefix?: string) {
  if (!prefix) {
    getCache.clear();
    return;
  }
  for (const key of getCache.keys()) {
    if (key.includes(prefix)) getCache.delete(key);
  }
}

export async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const token = session.getToken();
  const tenantId = session.getTenantId();
  const method = options?.method?.toUpperCase() || 'GET';

  // Cache GET requests for 3s to prevent duplicate calls on tab switch
  if (method === 'GET') {
    const cacheKey = `${tenantId}:${path}`;
    const cached = getCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < GET_CACHE_TTL) return cached.data as T;
  }

  // Invalidate in-memory GET cache on mutations
  if (method !== 'GET') {
    const segment = path.split('/')[1] || '';
    invalidateCache(segment);
  }

  const authHeaders: Record<string, string> = {};
  if (token) authHeaders['Authorization'] = `Bearer ${token}`;
  if (tenantId) authHeaders['X-Tenant-ID'] = tenantId;
  const correlationId = ensureCorrelationId();
  authHeaders['X-Correlation-ID'] = correlationId;

  // App paths are like `/products` — always resolve via `/api/...`
  const requestUrl = resolveApiUrl(`/api${path.startsWith('/') ? path : `/${path}`}`);
  const started = Date.now();

  // Retry network blips only (TypeError). Never retry on 4xx/5xx.
  // GETs: up to 3 attempts (safe). Mutations: 1 retry only — reduces duplicate
  // create risk if the server saved but the response never reached the client.
  const isSafeRetry = method === 'GET' || method === 'HEAD';
  const MAX_RETRIES = isSafeRetry ? 3 : 2; // mutations: initial + 1 retry
  const RETRY_DELAY_MS = isSafeRetry ? [800, 1600, 3000] : [800];
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(requestUrl, {
        ...options,
        headers: { 'Content-Type': 'application/json', ...authHeaders, ...options?.headers },
      });

      // Server responded (even 4xx/5xx) — don't retry, fall through to handle below
      return await handleResponse<T>(res, path, method, tenantId, correlationId, started);
    } catch (err) {
      // Only retry on network failures (TypeError: Failed to fetch)
      if (!(err instanceof TypeError)) throw err;
      lastError = err;
      clientLogger.warn('API network retry', {
        path,
        method,
        attempt: attempt + 1,
        maxRetries: MAX_RETRIES,
        correlationId,
        error: err instanceof Error ? err.message : String(err),
      });
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, RETRY_DELAY_MS[attempt] ?? 800));
      }
    }
  }
  clientLogger.exception('API network failure', lastError, {
    path,
    method,
    correlationId,
    durationMs: Date.now() - started,
  });

  throw new Error('Connection lost. Please check your internet and try again.');
}

async function handleResponse<T>(
  res: Response,
  path: string,
  method: string,
  tenantId: string | null,
  correlationId: string,
  started: number,
): Promise<T> {
  const serverCorrelation = res.headers.get('X-Correlation-ID') || correlationId;
  const durationMs = Date.now() - started;

  if (res.status === 401) {
    const isAuthEndpoint =
      path.startsWith('/auth/login') ||
      path.startsWith('/auth/signup') ||
      path.startsWith('/auth/reset') ||
      path.startsWith('/auth/forgot') ||
      path.startsWith('/super-admin/login');
    if (!isAuthEndpoint && session.getToken()) {
      clientLogger.warn('Session expired — redirecting to login', {
        path,
        method,
        statusCode: 401,
        correlationId: serverCorrelation,
        durationMs,
      });
      const slug = session.getSlug();
      const pathSlug = window.location.pathname.match(/^\/([a-z0-9][a-z0-9-]*)/i)?.[1];
      session.clearAll();
      const redirectSlug = slug || pathSlug;
      window.location.href = redirectSlug ? `/${redirectSlug}` : '/';
      return new Promise(() => {}) as T;
    }
  }
  if (res.status === 403) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string }).error || 'Access denied';
    if (msg.includes('suspended') || msg.includes('deleted')) {
      clientLogger.warn('Account suspended/deleted — redirecting', {
        path,
        statusCode: 403,
        correlationId: serverCorrelation,
      });
      const slug = session.getSlug();
      session.clearAll();
      alert(msg);
      window.location.href = slug ? `/${slug}` : '/';
      return new Promise(() => {}) as T;
    }
    clientLogger.warn('API forbidden', { path, method, statusCode: 403, correlationId: serverCorrelation, durationMs });
    throw new Error(msg);
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const msg = (err as { error?: string }).error || res.statusText;
    const level = res.status >= 500 ? 'error' : 'warn';
    clientLogger[level]('API request failed', {
      path,
      method,
      statusCode: res.status,
      correlationId: serverCorrelation,
      durationMs,
      error: msg,
    });
    throw new Error(msg);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (method === 'GET') {
    const cacheKey = `${tenantId}:${path}`;
    getCache.set(cacheKey, { data, ts: Date.now() });
  }
  return data;
}

export const api = {
  products: {
    list: (search?: string) =>
      fetchApi<import('./types').Product[]>(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    lowStockCount: (threshold = 10) =>
      fetchApi<{ count: number; threshold: number }>(`/products/low-stock-count?threshold=${threshold}`),
    getByBarcode: (barcode: string) =>
      fetchApi<import('./types').Product>(`/products/by-barcode/${encodeURIComponent(barcode)}`),
    barcodeDetails: (id: string) =>
      fetchApi<{ date: string; barcodeFirst: string; barcodeLast: string; count: number }[]>(
        `/products/${id}/barcode-details`,
      ),
    getBarcodes: (id: string) =>
      fetchApi<{
        product: { id: string; name: string; price: number };
        barcodes: { barcode: string; status: string }[];
      }>(`/products/${id}/barcodes`),
    verify: (barcode: string) => fetchApi<Record<string, unknown>>(`/products/verify/${encodeURIComponent(barcode)}`),
    create: (
      data: Partial<Omit<import('./types').Product, 'id'>> & {
        name: string;
        rangeStart?: string;
        rangeEnd?: string;
        barcodePrefix?: string;
        barcodeMode?: 'prefix' | 'range' | 'auto';
        quantity?: number;
        barcodePerBox?: boolean;
        priceIncludesGst?: boolean;
      },
    ) => fetchApi<import('./types').Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
    addStock: (
      id: string,
      data: {
        barcodePrefix?: string;
        rangeStart?: string;
        rangeEnd?: string;
        quantity: number;
        barcodeMode?: 'prefix' | 'range' | 'auto';
        barcodePerBox?: boolean;
        packSize?: number;
      },
    ) =>
      fetchApi<import('./types').Product>(`/products/${id}/add-stock`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<import('./types').Product>) =>
      fetchApi<import('./types').Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/products/${id}`, { method: 'DELETE' }),
  },
  warranties: {
    list: (params?: {
      search?: string;
      status?: string;
      vendorId?: string;
      page?: number;
      dateRange?: string;
      dateFrom?: string;
      dateTo?: string;
    }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.status) q.set('status', params.status);
      if (params?.vendorId) q.set('vendorId', params.vendorId);
      if (params?.page) q.set('page', String(params.page));
      if (params?.dateRange) q.set('dateRange', params.dateRange);
      if (params?.dateFrom) q.set('dateFrom', params.dateFrom);
      if (params?.dateTo) q.set('dateTo', params.dateTo);
      const query = q.toString();
      return fetchApi<{ data: import('./types').Warranty[]; total: number; page: number; totalPages: number }>(
        `/warranties${query ? `?${query}` : ''}`,
      );
    },
    create: (data: { barcode: string; customerName: string; customerPhone: string }) =>
      fetchApi<import('./types').Warranty>('/warranties', { method: 'POST', body: JSON.stringify(data) }),
    update: (
      id: string,
      data: Partial<{ customerName: string; customerPhone: string; status: string; replacedBarcode: string | null }>,
    ) => fetchApi<import('./types').Warranty>(`/warranties/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/warranties/${id}`, { method: 'DELETE' }),
  },
  replacements: {
    list: (vendorId?: string) =>
      fetchApi<ReplacementRecord[]>(`/replacements${vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : ''}`),
    validateOld: (barcode: string, vendorId?: string) =>
      fetchApi<{
        valid: boolean;
        vendorId?: string;
        vendorName?: string;
        productId?: string;
        productName?: string | null;
        customerName?: string;
        customerPhone?: string;
        customerEmail?: string;
        error?: string;
      }>(
        `/replacements/validate-old/${encodeURIComponent(barcode)}${vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : ''}`,
      ),
    validateNew: (barcode: string, vendorId: string) =>
      fetchApi<{
        valid: boolean;
        vendorId?: string;
        vendorName?: string;
        productId?: string;
        productName?: string;
        error?: string;
      }>(`/replacements/validate-new/${encodeURIComponent(barcode)}?vendorId=${encodeURIComponent(vendorId)}`),
    create: (data: {
      oldBarcode: string;
      newBarcode: string;
      warrantyId?: string;
      customerName: string;
      customerPhone: string;
      replacedDate?: string;
      reason?: string;
      vendorId?: string;
    }) => fetchApi<ReplacementRecord>('/replacements', { method: 'POST', body: JSON.stringify(data) }),
  },
  redemptionSettings: {
    get: () => fetchApi<{ minBalance: number; minPoints: number }>('/redemption-settings'),
    update: (data: { minBalance: number; minPoints: number }) =>
      fetchApi<{ minBalance: number; minPoints: number }>('/redemption-settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
  },
  rewards: {
    list: (type?: string, vendorId?: string) => {
      const q = new URLSearchParams();
      if (type && type !== 'All') q.set('type', type);
      if (vendorId) q.set('vendorId', vendorId);
      const query = q.toString();
      return fetchApi<import('./types').RewardPoint[]>(`/rewards${query ? `?${query}` : ''}`);
    },
    balance: () => fetchApi<{ balance: number }>('/rewards/balance'),
    create: (data: Omit<import('./types').RewardPoint, 'id' | 'date'> & { date?: string; vendorId?: string }) =>
      fetchApi<import('./types').RewardPoint>('/rewards', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<import('./types').RewardPoint>) =>
      fetchApi<import('./types').RewardPoint>(`/rewards/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/rewards/${id}`, { method: 'DELETE' }),
  },
  dashboard: {
    stats: () =>
      fetchApi<{
        totalRevenue: number;
        activeWarranties: number;
        pendingClaims: number;
        rewardPointsIssued: number;
        totalProducts?: number;
        productsDistributed?: number;
        productsSold?: number;
        vendorRewardPoints?: number;
        availableInInventory?: number;
        totalBeforeDistribution?: number;
      }>('/dashboard/stats'),
    rewardsSummary: () =>
      fetchApi<{
        vendorSummaries: { vendorId: string; vendorName: string; productsSold: number; totalRewardPoints: number }[];
      }>('/dashboard/rewards-summary'),
    recentActivity: () =>
      fetchApi<{ type: string; id: string; label: string; amount: number; date: string }[]>(
        '/analytics/recent-activity',
      ),
    overview: (from?: string, to?: string) => {
      // M6 fix: use GET with query params instead of experimental QUERY method
      const qp = new URLSearchParams();
      if (from) qp.set('from', from);
      if (to) qp.set('to', to);
      const qs = qp.toString();
      return fetchApi<{
        money: {
          collections: number;
          revenue: number;
          distribution: number;
          expenses: number;
          outstanding: number;
          invoiceOutstanding: number;
        };
        recentActivity: { type: string; id: string; label: string; amount: number; date: string }[];
        topVendors: { vendorId: string; vendorName: string; balance: number }[];
        counts: {
          customerMaster: number;
          vendorMaster: number;
          itemMaster: number;
          bankMaster: number;
          staffCount: number;
        };
      }>(`/analytics/overview${qs ? '?' + qs : ''}`, { method: 'GET' });
    },
    vendor: (vendorId: string) =>
      fetchApi<{
        vendor: { id: string; name: string; totalSales: number; totalRewardPoints: number };
        assignedProducts: { id: string; productName: string; barcode: string; rewardPointsValue: number }[];
        salesHistory: {
          id: string;
          productName: string;
          customerName: string;
          purchaseDate: string;
          rewardPointsEarned: number;
        }[];
      }>(`/dashboard/vendor/${vendorId}`),
  },
  distribution: {
    list: (vendorId?: string, batchId?: string) => {
      const q = new URLSearchParams();
      if (vendorId) q.set('vendorId', vendorId);
      if (batchId) q.set('batchId', batchId);
      const qs = q.toString();
      return fetchApi<DistributionRecord[]>(`/distribution${qs ? `?${qs}` : ''}`);
    },
    batches: (vendorId?: string) =>
      fetchApi<DistributionBatch[]>(
        `/distribution/batches${vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : ''}`,
      ),
    summary: () =>
      fetchApi<{
        totalBeforeDistribution: number;
        availableInInventory: number;
        totalDistributed: number;
        vendorStats: {
          vendorId: string;
          vendorName: string;
          distributed: number;
          sold: number;
          replaced: number;
          damaged: number;
          availableWithVendor: number;
        }[];
      }>('/distribution/summary'),
    createBatch: (data: {
      vendorId: string;
      distributionDate?: string;
      amountPaid?: number;
      gstRate?: number;
      items: {
        productId: string;
        quantity: number;
        discountPercent?: number;
        withGst?: boolean;
        customPrice?: number;
      }[];
    }) => fetchApi<DistributionBatch>('/distribution/batch', { method: 'POST', body: JSON.stringify(data) }),
    create: (data: {
      productId: string;
      vendorId: string;
      distributionDate?: string;
      quantity?: number;
      discountPercent?: number;
      amountPaid?: number;
      withGst?: boolean;
      gstRate?: number;
      batchId?: string;
    }) => fetchApi<DistributionRecord>('/distribution', { method: 'POST', body: JSON.stringify(data) }),
    updateBatch: (
      batchId: string,
      data: {
        distributionDate?: string;
        gstRate?: number;
        items?: { productId: string; quantity: number; discountPercent?: number; withGst?: boolean }[];
      },
    ) =>
      fetchApi<DistributionBatch & { deleted?: boolean }>(`/distribution/batch/${encodeURIComponent(batchId)}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    getBatch: (batchId: string) =>
      fetchApi<DistributionBatchDetail>(`/distribution/batch/${encodeURIComponent(batchId)}`),
    deleteBatch: (batchId: string) =>
      fetchApi<{ ok: boolean; batchId: string; unitsReturned: number }>(
        `/distribution/batch/${encodeURIComponent(batchId)}`,
        { method: 'DELETE' },
      ),
    applyBilling: (data: {
      vendorId?: string;
      batchId?: string;
      gstUnits: number;
      nonGstUnits: number;
      gstRate: number;
    }) => fetchApi<{ ok: boolean }>('/distribution/apply-billing', { method: 'PUT', body: JSON.stringify(data) }),
    getBill: (params: { vendorId?: string; batchId?: string; productId?: string; distributionDate?: string }) => {
      const q = new URLSearchParams();
      if (params.vendorId) q.set('vendorId', params.vendorId);
      if (params.batchId) q.set('batchId', params.batchId);
      if (params.productId) q.set('productId', params.productId);
      if (params.distributionDate) q.set('distributionDate', params.distributionDate);
      return fetchApi<DistributionBillData>(`/distribution/bill?${q.toString()}`);
    },
  },
  sales: {
    validate: (barcode: string, vendorId?: string) =>
      fetchApi<{
        valid: boolean;
        productId?: string;
        productName?: string;
        vendorId?: string;
        vendorName?: string;
        rewardPointsValue?: number;
        price?: number;
        error?: string;
      }>(
        `/sales/validate/${encodeURIComponent(barcode)}${vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : ''}`,
      ),
    create: (data: {
      barcode: string;
      customerName: string;
      customerPhone: string;
      customerEmail?: string;
      purchaseDate?: string;
      salePrice?: number | string;
    }) => fetchApi<SaleRecord>('/sales', { method: 'POST', body: JSON.stringify(data) }),
    list: (params?: { vendorId?: string; page?: number; dateRange?: string; dateFrom?: string; dateTo?: string }) => {
      const q = new URLSearchParams();
      if (params?.vendorId) q.set('vendorId', params.vendorId);
      if (params?.page) q.set('page', String(params.page));
      if (params?.dateRange) q.set('dateRange', params.dateRange);
      if (params?.dateFrom) q.set('dateFrom', params.dateFrom);
      if (params?.dateTo) q.set('dateTo', params.dateTo);
      const qs = q.toString();
      return fetchApi<{ data: SaleRecord[]; total: number; page: number; totalPages: number }>(
        `/sales${qs ? `?${qs}` : ''}`,
      );
    },
    getBill: (saleId: string) => fetchApi<SaleBillData>(`/sales/${encodeURIComponent(saleId)}/bill`),
  },
  rewardRules: {
    list: () => fetchApi<RewardRule[]>('/reward-rules'),
    create: (data: { productsSoldThreshold: number; rewardPoints: number; description?: string }) =>
      fetchApi<RewardRule>('/reward-rules', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<RewardRule>) =>
      fetchApi<RewardRule>(`/reward-rules/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/reward-rules/${id}`, { method: 'DELETE' }),
  },
  masters: {
    counts: () =>
      fetchApi<{ customerMaster: number; vendorMaster: number; itemMaster: number; bankMaster: number }>(
        '/masters/counts',
      ),
  },
  customers: {
    list: (search?: string, vendorId?: string) => {
      const q = new URLSearchParams();
      if (search) q.set('search', search);
      if (vendorId) q.set('vendorId', vendorId);
      const query = q.toString();
      return fetchApi<import('./types').Customer[]>(`/customers${query ? `?${query}` : ''}`);
    },
    purchases: (id: string) =>
      fetchApi<
        {
          productName: string;
          productId: string;
          vendorName: string;
          vendorId: string;
          barcode: string;
          purchaseDate: string;
        }[]
      >(`/customers/${id}/purchases`),
    create: (data: Omit<import('./types').Customer, 'id'>) =>
      fetchApi<import('./types').Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<import('./types').Customer>) =>
      fetchApi<import('./types').Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/customers/${id}`, { method: 'DELETE' }),
    setVendor: (id: string, vendorId: string | null) =>
      fetchApi<import('./types').Customer>(`/customers/${id}/vendor`, {
        method: 'PUT',
        body: JSON.stringify({ vendorId }),
      }),
  },
  mapping: {
    vendorsWithCustomers: () =>
      fetchApi<{
        vendors: {
          vendor: { id: string; name: string; contactPerson: string; phone: string };
          customers: { id: string; name: string; phone: string; email: string }[];
        }[];
        directCustomers: { id: string; name: string; phone: string; email: string }[];
      }>('/mapping/vendors-with-customers'),
  },
  vendors: {
    list: (search?: string) =>
      fetchApi<import('./types').Vendor[]>(`/vendors${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    create: (data: Omit<import('./types').Vendor, 'id'>) =>
      fetchApi<import('./types').Vendor & { credentials?: { email: string; password: string } | null }>('/vendors', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<import('./types').Vendor>) =>
      fetchApi<import('./types').Vendor>(`/vendors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/vendors/${id}`, { method: 'DELETE' }),
    bulk: (vendors: { name: string; contactPerson?: string; phone?: string; email?: string; address?: string }[]) =>
      fetchApi<{
        success: number;
        errors: string[];
        credentials: { name: string; email: string; password: string; url: string }[];
      }>('/vendors/bulk', { method: 'POST', body: JSON.stringify({ vendors }) }),
  },
  banks: {
    list: (search?: string) =>
      fetchApi<import('./types').Bank[]>(`/banks${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    create: (data: Omit<import('./types').Bank, 'id'>) =>
      fetchApi<import('./types').Bank>('/banks', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<import('./types').Bank>) =>
      fetchApi<import('./types').Bank>(`/banks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/banks/${id}`, { method: 'DELETE' }),
  },
  invoiceFinance: {
    summary: () =>
      fetchApi<
        {
          partyKey: string;
          partyType: 'vendor' | 'customer' | null;
          partyId: string | null;
          clientName: string;
          clientPhone: string | null;
          invoiceCount: number;
          totalInvoiced: number;
          totalPaid: number;
          balance: number;
        }[]
      >('/invoice-finance/summary'),
    /** partyKey: vendor:ID | customer:ID | name:DisplayName (or plain name for legacy) */
    client: (partyKey: string) =>
      fetchApi<{
        partyKey: string;
        partyType: 'vendor' | 'customer' | null;
        partyId: string | null;
        clientName: string;
        clientPhone: string | null;
        customerGstin?: string | null;
        customerAddress?: string | null;
        totalInvoiced: number;
        totalPaid: number;
        balance: number;
        invoices: {
          id: string;
          invoiceNumber: string;
          invoiceDate: string;
          dueDate?: string;
          grandTotal: number;
          paid: number;
          balance: number;
          status: string;
          notes?: string;
        }[];
        payments: {
          id: string;
          invoiceId: string;
          invoiceNumber: string;
          amount: number;
          paymentDate: string;
          paymentMethod: string;
          referenceNumber?: string;
          notes?: string;
        }[];
      }>(`/invoice-finance/client/${encodeURIComponent(partyKey)}`),
    recordPayment: (data: {
      invoiceId: string;
      amount: number;
      paymentDate: string;
      paymentMethod: string;
      referenceNumber?: string;
      notes?: string;
    }) => fetchApi<{ id: string }>('/invoice-finance/payments', { method: 'POST', body: JSON.stringify(data) }),
    deletePayment: (id: string) => fetchApi<void>(`/invoice-finance/payments/${id}`, { method: 'DELETE' }),
  },
  vendorFinance: {
    summary: () =>
      fetchApi<
        {
          vendorId: string;
          vendorName: string;
          vendorPhone: string;
          totalDistributedValue: number;
          totalPaid: number;
          balance: number;
          unitsDistributed: number;
          reminder: { enabled: boolean; days: number; lastSent: string | null };
        }[]
      >('/vendor-finance/summary'),
    detail: (vendorId: string) =>
      fetchApi<{
        vendor: { id: string; name: string; phone?: string; email?: string; address?: string; contactPerson?: string };
        totalDistributedValue: number;
        totalPaid: number;
        balance: number;
        payments: {
          id: string;
          amount: number;
          paymentDate: string;
          paymentMethod: string;
          referenceNumber?: string;
          notes?: string;
        }[];
        distributions: { date: string; productName: string; unitPrice: number; quantity: number; total: number }[];
        reminder: { enabled: boolean; days: number; lastSent: string | null };
      }>(`/vendor-finance/${vendorId}`),
    recordPayment: (
      vendorId: string,
      data: {
        amount: number;
        paymentDate?: string;
        paymentMethod?: string;
        referenceNumber?: string;
        notes?: string;
        batchId?: string;
      },
    ) =>
      fetchApi<{ id: string; amount: number; paymentDate: string }>(`/vendor-finance/${vendorId}/payments`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    updateReminder: (vendorId: string, data: { enabled: boolean; reminderDays: number }) =>
      fetchApi<{ enabled: boolean; days: number; lastSent: string | null }>(`/vendor-finance/${vendorId}/reminder`, {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    remindersDue: () =>
      fetchApi<
        {
          vendorId: string;
          vendorName: string;
          vendorPhone: string;
          balance: number;
          totalValue: number;
          totalPaid: number;
          reminderDays: number;
          lastSent: string | null;
        }[]
      >('/vendor-finance/reminders-due'),
    markReminderSent: (vendorId: string) =>
      fetchApi<{ ok: boolean }>(`/vendor-finance/${vendorId}/reminder-sent`, { method: 'POST' }),
  },
  search: {
    global: (q: string) =>
      fetchApi<{
        products: { id: string; name: string; price: number; stock: number; type: 'product' }[];
        customers: { id: string; name: string; phone: string; email: string; type: 'customer' }[];
        vendors: { id: string; name: string; contact: string; phone: string; type: 'vendor' }[];
        barcodes: { barcode: string; productName: string; productId: string; status: string; type: 'barcode' }[];
      }>(`/search?q=${encodeURIComponent(q)}`),
  },
  chatbot: {
    send: (message: string) =>
      fetchApi<{ text: string }>('/chatbot', { method: 'POST', body: JSON.stringify({ message }) }),
    quickActions: () =>
      fetchApi<string[]>('/chatbot/quick-actions').then(r => (r as unknown as { actions: string[] }).actions),
  },
  auditLog: {
    list: (params?: { page?: number; dateRange?: string; dateFrom?: string; dateTo?: string; entityType?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.dateRange) q.set('dateRange', params.dateRange);
      if (params?.dateFrom) q.set('dateFrom', params.dateFrom);
      if (params?.dateTo) q.set('dateTo', params.dateTo);
      if (params?.entityType) q.set('entityType', params.entityType);
      const qs = q.toString();
      return fetchApi<{
        data: {
          id: number;
          userId: string;
          userName: string;
          action: string;
          entityType: string;
          entityId: string;
          details: string;
          createdAt: string;
        }[];
        total: number;
        page: number;
        totalPages: number;
      }>(`/audit-log${qs ? `?${qs}` : ''}`);
    },
  },
  gst: {
    getSettings: () => fetchApi<{ mode: string; gstin: string; username: string; clientId: string }>('/gst/settings'),
    saveSettings: (d: {
      mode?: string;
      gstin?: string;
      username?: string;
      password?: string;
      clientId?: string;
      clientSecret?: string;
    }) => fetchApi<{ ok: boolean }>('/gst/settings', { method: 'PUT', body: JSON.stringify(d) }),
    generateIrn: (batchId: string) =>
      fetchApi<{
        ok: boolean;
        irn: string;
        ackNo: string;
        ackDt: string;
        qrCode: string;
        signedQrCode?: string;
        mode: string;
      }>('/gst/irn/generate', { method: 'POST', body: JSON.stringify({ batchId }) }),
    generateEwb: (data: {
      batchId: string;
      vehicleNo: string;
      distance: number;
      transportMode?: string;
      transporterName?: string;
      transporterId?: string;
    }) =>
      fetchApi<{ ok: boolean; ewbNo: string; ewbDt: string; ewbValidTill: string; mode: string }>('/gst/ewb/generate', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    cancelIrn: (irn: string, reason: number, remark?: string) =>
      fetchApi<{ ok: boolean }>('/gst/irn/cancel', { method: 'POST', body: JSON.stringify({ irn, reason, remark }) }),
  },
  auth: {
    signup: (data: {
      email: string;
      password: string;
      name: string;
      phone?: string;
      address?: string;
      role?: string;
      companyName?: string;
    }) =>
      fetchApi<{
        token: string;
        tenantId: string;
        user: {
          id: string;
          email: string;
          name: string;
          phone?: string;
          address?: string;
          role?: string;
          companyName?: string;
        };
      }>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    login: (email: string, password: string, slug?: string) =>
      fetchApi<{
        token: string;
        tenantId: string;
        tenantSlug?: string;
        id: string;
        email: string;
        name: string;
        phone?: string;
        address?: string;
        role?: string;
        companyName?: string;
        permissions?: Record<string, string> | string[] | null;
        vendorId?: string | null;
        autoWhatsapp?: boolean;
        defaultGstRate?: number;
        gstNumber?: string | null;
        warrantyEnabled?: boolean;
        replacementEnabled?: boolean;
        rewardsEnabled?: boolean;
        financeEnabled?: boolean;
        chatbotEnabled?: boolean;
        billCustomizationEnabled?: boolean;
        multiLanguageEnabled?: boolean;
        vendorPortalEnabled?: boolean;
      }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password, ...(slug ? { slug } : {}) }) }),
    forgotPassword: (email: string) =>
      fetchApi<{ ok: boolean; message: string; token?: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    resetPassword: (token: string, newPassword: string) =>
      fetchApi<{ ok: boolean; message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      }),
  },
  tenantBySlug: (slug: string) =>
    fetchApi<{
      tenantId: string;
      companyName: string;
      slug: string;
      logoBase64: string | null;
      primaryColor: string;
      tagline: string | null;
    }>(`/tenant/by-slug/${encodeURIComponent(slug)}`),
  backup: {
    settings: () =>
      fetchApi<{
        enabled: boolean;
        frequency: string;
        intervalDays: number;
        lastBackupAt: string | null;
        email: string | null;
      }>('/backup/settings'),
    updateSettings: (data: { enabled: boolean; frequency: string; intervalDays?: number; email?: string }) =>
      fetchApi<{ ok: boolean; enabled: boolean; frequency: string; intervalDays: number; email: string | null }>(
        '/backup/settings',
        { method: 'PUT', body: JSON.stringify(data) },
      ),
  },
  expenses: {
    list: (filters?: { category?: string; from?: string; to?: string }) => {
      const q = new URLSearchParams();
      if (filters?.category) q.set('category', filters.category);
      if (filters?.from) q.set('from', filters.from);
      if (filters?.to) q.set('to', filters.to);
      return fetchApi<
        {
          id: string;
          category: string;
          description?: string;
          amount: number;
          expenseDate: string;
          paymentMethod: string;
          referenceNumber?: string;
          notes?: string;
        }[]
      >(`/expenses?${q}`);
    },
    summary: (year?: number) =>
      fetchApi<{
        year: number;
        grandTotal: number;
        byCategory: { category: string; total: number; count: number }[];
        byMonth: { month: string; total: number }[];
      }>(`/expenses/summary?year=${year || new Date().getFullYear()}`),
    create: (data: {
      category: string;
      description?: string;
      amount: number;
      expenseDate?: string;
      paymentMethod?: string;
      referenceNumber?: string;
      notes?: string;
    }) =>
      fetchApi<{ id: string; category: string; amount: number }>('/expenses', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    delete: (id: string) => fetchApi<{ ok: boolean }>(`/expenses/${id}`, { method: 'DELETE' }),
  },
  staff: {
    list: (search?: string) =>
      fetchApi<
        {
          id: string;
          name: string;
          phone?: string;
          role?: string;
          address?: string;
          salary: number;
          joiningDate?: string;
          status: string;
          totalPaid: number;
          totalAdvance: number;
          totalRepaid: number;
          advanceBalance: number;
          paymentCount: number;
          lastPayment?: string;
        }[]
      >(`/staff${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    create: (data: {
      name: string;
      phone?: string;
      role?: string;
      address?: string;
      salary?: number;
      joiningDate?: string;
    }) => fetchApi<{ id: string; name: string }>('/staff', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Record<string, unknown>) =>
      fetchApi<{ ok: boolean }>(`/staff/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<{ ok: boolean }>(`/staff/${id}`, { method: 'DELETE' }),
  },
  payroll: {
    staff: (search?: string) =>
      fetchApi<{ name: string; totalPaid: number; paymentCount: number; lastPayment: string; firstPayment: string }[]>(
        `/payroll/staff${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
    list: (filters?: { month?: string; year?: number; staffName?: string }) => {
      const q = new URLSearchParams();
      if (filters?.month) q.set('month', filters.month);
      if (filters?.year) q.set('year', String(filters.year));
      if (filters?.staffName) q.set('staffName', filters.staffName);
      return fetchApi<
        {
          id: string;
          staffName: string;
          amount: number;
          paymentDate: string;
          paymentMethod: string;
          referenceNumber?: string;
          notes?: string;
          month: string;
          year: number;
        }[]
      >(`/payroll?${q}`);
    },
    summary: (year?: number) =>
      fetchApi<{
        year: number;
        grandTotal: number;
        advanceOutstanding: number;
        byStaff: { name: string; total: number; payments: number }[];
        byMonth: { month: string; total: number; payments: number }[];
      }>(`/payroll/summary?year=${year || new Date().getFullYear()}`),
    create: (data: {
      staffName: string;
      amount: number;
      paymentDate?: string;
      paymentType?: string;
      paymentMethod?: string;
      referenceNumber?: string;
      notes?: string;
    }) =>
      fetchApi<{ id: string; staffName: string; amount: number; paymentDate: string; paymentType: string }>(
        '/payroll',
        { method: 'POST', body: JSON.stringify(data) },
      ),
    delete: (id: string) => fetchApi<{ ok: boolean }>(`/payroll/${id}`, { method: 'DELETE' }),
  },
  settings: {
    getProfile: (userId: string) =>
      fetchApi<{
        id: string;
        email: string;
        name: string;
        phone?: string;
        address?: string;
        role?: string;
        companyName?: string;
        permissions?: Record<string, string> | string[] | null;
        vendorId?: string | null;
        gstNumber?: string | null;
        defaultGstRate?: number;
      }>(`/settings/profile?userId=${encodeURIComponent(userId)}`),
    changePassword: (userId: string, currentPassword: string, newPassword: string) =>
      fetchApi<{ ok: boolean }>('/settings/change-password', {
        method: 'PUT',
        body: JSON.stringify({ userId, currentPassword, newPassword }),
      }),
    updateProfile: (userId: string, data: Record<string, unknown>) =>
      fetchApi<{
        id: string;
        email: string;
        name: string;
        phone?: string;
        address?: string;
        role?: string;
        companyName?: string;
        autoWhatsapp?: boolean;
      }>('/settings/profile', { method: 'PUT', body: JSON.stringify({ userId, ...data }) }),
    deleteAccount: (password: string) =>
      fetchApi<{ ok: boolean; message: string }>('/auth/me', { method: 'DELETE', body: JSON.stringify({ password }) }),
    getBillSettings: () => fetchApi<import('./types').BillSettings>('/settings/bill'),
    updateBillSettings: (data: Partial<import('./types').BillSettings>) =>
      fetchApi<import('./types').BillSettings>('/settings/bill', { method: 'PUT', body: JSON.stringify(data) }),
  },
  admin: {
    listUsers: (adminUserId: string) =>
      fetchApi<
        {
          id: string;
          email: string;
          name: string;
          phone?: string;
          address?: string;
          role?: string;
          companyName?: string;
          permissions?: string[] | null;
          vendorId?: string | null;
        }[]
      >(`/admin/users?adminUserId=${encodeURIComponent(adminUserId)}`),
    createUser: (
      adminUserId: string,
      data: {
        email: string;
        password: string;
        name: string;
        phone?: string;
        address?: string;
        role?: string;
        companyName?: string;
        permissions?: string[];
        vendorId?: string;
      },
    ) =>
      fetchApi<{
        id: string;
        email: string;
        name: string;
        phone?: string;
        address?: string;
        role?: string;
        companyName?: string;
        permissions?: string[] | null;
        vendorId?: string | null;
      }>('/admin/users', { method: 'POST', body: JSON.stringify({ adminUserId, ...data }) }),
    updateUser: (
      adminUserId: string,
      userId: string,
      data: { role?: string; permissions?: Record<string, string> | string[]; vendorId?: string },
    ) =>
      fetchApi<{
        id: string;
        email: string;
        name: string;
        phone?: string;
        address?: string;
        role?: string;
        companyName?: string;
        permissions?: Record<string, string> | null;
      }>(`/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify({ adminUserId, ...data }) }),
    deleteUser: (userId: string) =>
      fetchApi<{ ok: boolean; message: string }>(`/admin/users/${userId}`, { method: 'DELETE' }),
  },
};
