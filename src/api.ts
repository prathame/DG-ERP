const API_BASE = '/api';

export interface DistributionRecord {
  id: string;
  productId: string;
  productName: string;
  barcode: string;
  vendorId: string;
  vendorName: string;
  distributionDate: string;
  status: string;
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
  vendor: { name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; address?: string | null };
  warranty?: { activationDate: string; expiryDate: string; status: string } | null;
  hsnCode?: string | null;
  gstRate: number;
  company: { name: string; contactName?: string | null; phone?: string | null; address?: string | null; gstNumber?: string | null };
  vendorFinance?: { totalDistributedValue: number; totalPaid: number; balance: number } | null;
}

export interface DistributionBillData {
  challanId: string;
  distributionDate: string;
  vendor: { name: string; contactPerson?: string | null; phone?: string | null; email?: string | null; address?: string | null };
  company: { name: string; contactName?: string | null; phone?: string | null; address?: string | null };
  items: { sno: number; barcode: string; productName: string; batchNumber?: string | null; originalPrice: number; discountPercent: number; price: number; status: string }[];
  groupedItems: { sno: number; productName: string; barcodeRange: string; quantity: number; originalPrice: number; discountPercent: number; netPrice: number; lineTotal: number }[];
  totalQuantity: number;
  grossValue: number;
  totalDiscount: number;
  totalValue: number;
  payment?: { totalDistributedValue: number; totalPaid: number; balance: number };
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  products: {
    list: (search?: string) =>
      fetchApi<import('./types').Product[]>(`/products${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    getByBarcode: (barcode: string) =>
      fetchApi<import('./types').Product>(`/products/by-barcode/${encodeURIComponent(barcode)}`),
    barcodeDetails: (id: string) =>
      fetchApi<{ date: string; barcodeFirst: string; barcodeLast: string; count: number }[]>(`/products/${id}/barcode-details`),
    create: (data: Partial<Omit<import('./types').Product, 'id'>> & { name: string; rangeStart?: string; rangeEnd?: string; barcodePrefix?: string; barcodeMode?: 'prefix' | 'range' | 'auto'; quantity?: number }) =>
      fetchApi<import('./types').Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
    addStock: (id: string, data: { barcodePrefix?: string; rangeStart?: string; rangeEnd?: string; quantity: number; barcodeMode?: 'prefix' | 'range' | 'auto' }) =>
      fetchApi<import('./types').Product>(`/products/${id}/add-stock`, { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<import('./types').Product>) =>
      fetchApi<import('./types').Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/products/${id}`, { method: 'DELETE' }),
  },
  warranties: {
    list: (params?: { search?: string; status?: string; vendorId?: string; page?: number; dateRange?: string; dateFrom?: string; dateTo?: string }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.status) q.set('status', params.status);
      if (params?.vendorId) q.set('vendorId', params.vendorId);
      if (params?.page) q.set('page', String(params.page));
      if (params?.dateRange) q.set('dateRange', params.dateRange);
      if (params?.dateFrom) q.set('dateFrom', params.dateFrom);
      if (params?.dateTo) q.set('dateTo', params.dateTo);
      const query = q.toString();
      return fetchApi<{ data: import('./types').Warranty[]; total: number; page: number; totalPages: number }>(`/warranties${query ? `?${query}` : ''}`);
    },
    create: (data: { barcode: string; customerName: string; customerPhone: string }) =>
      fetchApi<import('./types').Warranty>('/warranties', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<{ customerName: string; customerPhone: string; status: string; replacedBarcode: string | null }>) =>
      fetchApi<import('./types').Warranty>(`/warranties/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/warranties/${id}`, { method: 'DELETE' }),
  },
  replacements: {
    list: (vendorId?: string) =>
      fetchApi<ReplacementRecord[]>(`/replacements${vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : ''}`),
    validateOld: (barcode: string, vendorId?: string) =>
      fetchApi<{ valid: boolean; vendorId?: string; vendorName?: string; productId?: string; productName?: string | null; customerName?: string; customerPhone?: string; customerEmail?: string; error?: string }>(`/replacements/validate-old/${encodeURIComponent(barcode)}${vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : ''}`),
    validateNew: (barcode: string, vendorId: string) =>
      fetchApi<{ valid: boolean; vendorId?: string; vendorName?: string; productId?: string; productName?: string; error?: string }>(`/replacements/validate-new/${encodeURIComponent(barcode)}?vendorId=${encodeURIComponent(vendorId)}`),
    create: (data: { oldBarcode: string; newBarcode: string; warrantyId?: string; customerName: string; customerPhone: string; replacedDate?: string; reason?: string; vendorId?: string }) =>
      fetchApi<ReplacementRecord>('/replacements', { method: 'POST', body: JSON.stringify(data) }),
  },
  transactions: {
    list: (params?: { page?: number; dateRange?: string; dateFrom?: string; dateTo?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.dateRange) q.set('dateRange', params.dateRange);
      if (params?.dateFrom) q.set('dateFrom', params.dateFrom);
      if (params?.dateTo) q.set('dateTo', params.dateTo);
      const qs = q.toString();
      return fetchApi<{ data: import('./types').Transaction[]; total: number; page: number; totalPages: number; income: number; expense: number }>(`/transactions${qs ? `?${qs}` : ''}`);
    },
    create: (data: Omit<import('./types').Transaction, 'id'>) =>
      fetchApi<import('./types').Transaction>('/transactions', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<import('./types').Transaction>) =>
      fetchApi<import('./types').Transaction>(`/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/transactions/${id}`, { method: 'DELETE' }),
  },
  redemptionSettings: {
    get: () =>
      fetchApi<{ minBalance: number; minPoints: number }>('/redemption-settings'),
    update: (data: { minBalance: number; minPoints: number }) =>
      fetchApi<{ minBalance: number; minPoints: number }>('/redemption-settings', { method: 'PUT', body: JSON.stringify(data) }),
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
    chart: () =>
      fetchApi<{ name: string; sales: number; claims: number }[]>('/dashboard/chart'),
    rewardsSummary: () =>
      fetchApi<{
        vendorSummaries: { vendorId: string; vendorName: string; productsSold: number; totalRewardPoints: number }[];
      }>('/dashboard/rewards-summary'),
    vendor: (vendorId: string) =>
      fetchApi<{
        vendor: { id: string; name: string; totalSales: number; totalRewardPoints: number };
        assignedProducts: { id: string; productName: string; barcode: string; rewardPointsValue: number }[];
        salesHistory: { id: string; productName: string; customerName: string; purchaseDate: string; rewardPointsEarned: number }[];
      }>(`/dashboard/vendor/${vendorId}`),
  },
  distribution: {
    list: (vendorId?: string) =>
      fetchApi<DistributionRecord[]>(`/distribution${vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : ''}`),
    summary: () =>
      fetchApi<{
        totalBeforeDistribution: number;
        availableInInventory: number;
        totalDistributed: number;
        vendorStats: { vendorId: string; vendorName: string; distributed: number; sold: number; replaced: number; damaged: number; availableWithVendor: number }[];
      }>('/distribution/summary'),
    create: (data: { productId: string; vendorId: string; distributionDate?: string; quantity?: number; discountPercent?: number; amountPaid?: number }) =>
      fetchApi<DistributionRecord>('/distribution', { method: 'POST', body: JSON.stringify(data) }),
    getBill: (params: { vendorId: string; productId?: string; distributionDate?: string }) => {
      const q = new URLSearchParams({ vendorId: params.vendorId });
      if (params.productId) q.set('productId', params.productId);
      if (params.distributionDate) q.set('distributionDate', params.distributionDate);
      return fetchApi<DistributionBillData>(`/distribution/bill?${q.toString()}`);
    },
  },
  sales: {
    validate: (barcode: string, vendorId?: string) =>
      fetchApi<{ valid: boolean; productId?: string; productName?: string; vendorId?: string; vendorName?: string; rewardPointsValue?: number; price?: number; error?: string }>(`/sales/validate/${encodeURIComponent(barcode)}${vendorId ? `?vendorId=${encodeURIComponent(vendorId)}` : ''}`),
    create: (data: { barcode: string; customerName: string; customerPhone: string; customerEmail?: string; purchaseDate?: string; salePrice?: number | string }) =>
      fetchApi<SaleRecord>('/sales', { method: 'POST', body: JSON.stringify(data) }),
    list: (params?: { vendorId?: string; page?: number; dateRange?: string; dateFrom?: string; dateTo?: string }) => {
      const q = new URLSearchParams();
      if (params?.vendorId) q.set('vendorId', params.vendorId);
      if (params?.page) q.set('page', String(params.page));
      if (params?.dateRange) q.set('dateRange', params.dateRange);
      if (params?.dateFrom) q.set('dateFrom', params.dateFrom);
      if (params?.dateTo) q.set('dateTo', params.dateTo);
      const qs = q.toString();
      return fetchApi<{ data: SaleRecord[]; total: number; page: number; totalPages: number }>(`/sales${qs ? `?${qs}` : ''}`);
    },
    getBill: (saleId: string) =>
      fetchApi<SaleBillData>(`/sales/${encodeURIComponent(saleId)}/bill`),
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
      fetchApi<{ customerMaster: number; vendorMaster: number; itemMaster: number; bankMaster: number }>('/masters/counts'),
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
      fetchApi<{ productName: string; productId: string; vendorName: string; vendorId: string; barcode: string; purchaseDate: string }[]>(`/customers/${id}/purchases`),
    create: (data: Omit<import('./types').Customer, 'id'>) =>
      fetchApi<import('./types').Customer>('/customers', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<import('./types').Customer>) =>
      fetchApi<import('./types').Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/customers/${id}`, { method: 'DELETE' }),
    setVendor: (id: string, vendorId: string | null) =>
      fetchApi<import('./types').Customer>(`/customers/${id}/vendor`, { method: 'PUT', body: JSON.stringify({ vendorId }) }),
  },
  mapping: {
    vendorsWithCustomers: () =>
      fetchApi<{
        vendors: { vendor: { id: string; name: string; contactPerson: string; phone: string }; customers: { id: string; name: string; phone: string; email: string }[] }[];
        directCustomers: { id: string; name: string; phone: string; email: string }[];
      }>('/mapping/vendors-with-customers'),
  },
  vendors: {
    list: (search?: string) =>
      fetchApi<import('./types').Vendor[]>(`/vendors${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    create: (data: Omit<import('./types').Vendor, 'id'>) =>
      fetchApi<import('./types').Vendor & { credentials?: { email: string; password: string } | null }>('/vendors', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<import('./types').Vendor>) =>
      fetchApi<import('./types').Vendor>(`/vendors/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/vendors/${id}`, { method: 'DELETE' }),
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
  vendorFinance: {
    summary: () =>
      fetchApi<{ vendorId: string; vendorName: string; vendorPhone: string; totalDistributedValue: number; totalPaid: number; balance: number; unitsDistributed: number; reminder: { enabled: boolean; days: number; lastSent: string | null } }[]>('/vendor-finance/summary'),
    detail: (vendorId: string) =>
      fetchApi<{
        vendor: { id: string; name: string; phone?: string; email?: string; address?: string; contactPerson?: string };
        totalDistributedValue: number; totalPaid: number; balance: number;
        payments: { id: string; amount: number; paymentDate: string; paymentMethod: string; referenceNumber?: string; notes?: string }[];
        distributions: { date: string; productName: string; unitPrice: number; quantity: number; total: number }[];
        reminder: { enabled: boolean; days: number; lastSent: string | null };
      }>(`/vendor-finance/${vendorId}`),
    recordPayment: (vendorId: string, data: { amount: number; paymentDate?: string; paymentMethod?: string; referenceNumber?: string; notes?: string }) =>
      fetchApi<{ id: string; amount: number; paymentDate: string }>(`/vendor-finance/${vendorId}/payments`, { method: 'POST', body: JSON.stringify(data) }),
    updateReminder: (vendorId: string, data: { enabled: boolean; reminderDays: number }) =>
      fetchApi<{ enabled: boolean; days: number; lastSent: string | null }>(`/vendor-finance/${vendorId}/reminder`, { method: 'PUT', body: JSON.stringify(data) }),
    remindersDue: () =>
      fetchApi<{ vendorId: string; vendorName: string; vendorPhone: string; balance: number; totalValue: number; totalPaid: number; reminderDays: number; lastSent: string | null }[]>('/vendor-finance/reminders-due'),
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
  auditLog: {
    list: (params?: { page?: number; dateRange?: string; dateFrom?: string; dateTo?: string; entityType?: string }) => {
      const q = new URLSearchParams();
      if (params?.page) q.set('page', String(params.page));
      if (params?.dateRange) q.set('dateRange', params.dateRange);
      if (params?.dateFrom) q.set('dateFrom', params.dateFrom);
      if (params?.dateTo) q.set('dateTo', params.dateTo);
      if (params?.entityType) q.set('entityType', params.entityType);
      const qs = q.toString();
      return fetchApi<{ data: { id: number; userId: string; userName: string; action: string; entityType: string; entityId: string; details: string; createdAt: string }[]; total: number; page: number; totalPages: number }>(`/audit-log${qs ? `?${qs}` : ''}`);
    },
  },
  notifications: {
    list: () => fetchApi<{ notifications: { id: string; type: string; title: string; message: string; severity: string }[]; count: number }>('/notifications'),
  },
  auth: {
    signup: (data: { email: string; password: string; name: string; phone?: string; address?: string; role?: string; companyName?: string }) =>
      fetchApi<{ id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string }>('/auth/signup', { method: 'POST', body: JSON.stringify(data) }),
    login: (email: string, password: string) =>
      fetchApi<{ id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  },
  settings: {
    getProfile: (userId: string) =>
      fetchApi<{ id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string }>(`/settings/profile?userId=${encodeURIComponent(userId)}`),
    changePassword: (userId: string, currentPassword: string, newPassword: string) =>
      fetchApi<{ ok: boolean }>('/settings/change-password', { method: 'PUT', body: JSON.stringify({ userId, currentPassword, newPassword }) }),
    updateProfile: (userId: string, data: Record<string, unknown>) =>
      fetchApi<{ id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; autoWhatsapp?: boolean }>('/settings/profile', { method: 'PUT', body: JSON.stringify({ userId, ...data }) }),
  },
  admin: {
    listUsers: (adminUserId: string) =>
      fetchApi<{ id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; permissions?: string[] | null; vendorId?: string | null }[]>(`/admin/users?adminUserId=${encodeURIComponent(adminUserId)}`),
    createUser: (adminUserId: string, data: { email: string; password: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; permissions?: string[]; vendorId?: string }) =>
      fetchApi<{ id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; permissions?: string[] | null; vendorId?: string | null }>('/admin/users', { method: 'POST', body: JSON.stringify({ adminUserId, ...data }) }),
    updateUser: (adminUserId: string, userId: string, data: { role?: string; permissions?: string[]; vendorId?: string }) =>
      fetchApi<{ id: string; email: string; name: string; phone?: string; address?: string; role?: string; companyName?: string; permissions?: string[] | null }>(`/admin/users/${userId}`, { method: 'PUT', body: JSON.stringify({ adminUserId, ...data }) }),
  },
};
