const API_BASE = '/api';

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
    list: () => fetchApi<import('./types').Product[]>('/products'),
    create: (data: Omit<import('./types').Product, 'id'>) =>
      fetchApi<import('./types').Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: Partial<import('./types').Product>) =>
      fetchApi<import('./types').Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => fetchApi<void>(`/products/${id}`, { method: 'DELETE' }),
  },
  warranties: {
    list: (params?: { search?: string; status?: string }) => {
      const q = new URLSearchParams();
      if (params?.search) q.set('search', params.search);
      if (params?.status) q.set('status', params.status);
      const query = q.toString();
      return fetchApi<import('./types').Warranty[]>(`/warranties${query ? `?${query}` : ''}`);
    },
    create: (data: { serialNumber: string; customerName: string; customerPhone: string }) =>
      fetchApi<import('./types').Warranty>('/warranties', { method: 'POST', body: JSON.stringify(data) }),
  },
  transactions: {
    list: () => fetchApi<import('./types').Transaction[]>('/transactions'),
  },
  rewards: {
    list: (type?: string) =>
      fetchApi<import('./types').RewardPoint[]>(`/rewards${type && type !== 'All' ? `?type=${type}` : ''}`),
    balance: () => fetchApi<{ balance: number }>('/rewards/balance'),
  },
  dashboard: {
    stats: () =>
      fetchApi<{
        totalRevenue: number;
        activeWarranties: number;
        pendingClaims: number;
        rewardPointsIssued: number;
      }>('/dashboard/stats'),
    chart: () =>
      fetchApi<{ name: string; sales: number; claims: number }[]>('/dashboard/chart'),
  },
};
