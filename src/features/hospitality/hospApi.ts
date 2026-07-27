import { fetchApi } from '../../api';

export type HospTable = {
  id: string;
  name: string;
  seats: number;
  zone: string;
  status: 'available' | 'occupied' | 'billing' | 'cleaning';
  open_order_id: string | null;
  open_items: number;
};

export type HospMenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  available?: boolean;
  modifierGroups: Array<{
    id: string;
    name: string;
    required: boolean;
    maxSelect: number;
    modifiers: Array<{ id: string; name: string; price_delta: number }>;
  }>;
};

export type HospOrderDetail = {
  order: {
    id: string;
    table_id: string | null;
    status: string;
    order_type?: string;
    customer_name?: string;
    customer_phone?: string;
    token?: string | null;
  };
  items: Array<{
    id: string;
    name: string;
    qty: number;
    unit_price: number;
    notes: string;
    kitchen_status: string;
    modifiers: Array<{ name: string; price_delta: number }>;
    lineTotal: number;
  }>;
  total: number;
  table: { id: string; name: string; seats: number; status: string; zone: string } | null;
  label?: string | null;
};

export type HospParcel = {
  id: string;
  status: string;
  customer_name: string;
  customer_phone: string;
  token: string | null;
  item_count: number;
  total: number;
  label: string;
  created_at?: string;
};

export const hospApi = {
  tables: () => fetchApi<{ tables: HospTable[] }>('/hospitality/tables'),
  menu: () => fetchApi<{ categories: Array<{ id: string; name: string }>; items: HospMenuItem[] }>('/hospitality/menu'),
  openTable: (id: string) =>
    fetchApi<HospOrderDetail>(`/hospitality/tables/${id}/open`, { method: 'POST', body: '{}' }),
  addItem: (orderId: string, body: { menuItemId: string; qty: number; notes?: string; modifierIds?: string[] }) =>
    fetchApi<HospOrderDetail>(`/hospitality/orders/${orderId}/items`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  bill: (orderId: string) =>
    fetchApi<HospOrderDetail>(`/hospitality/orders/${orderId}/bill`, { method: 'POST', body: '{}' }),
  close: (orderId: string) =>
    fetchApi<{ ok: boolean }>(`/hospitality/orders/${orderId}/close`, { method: 'POST', body: '{}' }),
  clear: (tableId: string) =>
    fetchApi<{ ok: boolean }>(`/hospitality/tables/${tableId}/clear`, { method: 'POST', body: '{}' }),
  kitchen: () => fetchApi<{ tickets: Array<Record<string, unknown>> }>('/hospitality/kitchen'),
  setItemStatus: (id: string, status: string) =>
    fetchApi<{ ok: boolean }>(`/hospitality/order-items/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  queue: () =>
    fetchApi<{
      entries: Array<Record<string, unknown>>;
      nowServing: string | null;
    }>('/hospitality/queue'),
  addQueue: (guestName: string, partySize: number) =>
    fetchApi('/hospitality/queue', {
      method: 'POST',
      body: JSON.stringify({ guestName, partySize }),
    }),
  callNext: () => fetchApi('/hospitality/queue/call-next', { method: 'POST', body: '{}' }),
  call: (id: string) => fetchApi(`/hospitality/queue/${id}/call`, { method: 'POST', body: '{}' }),
  seat: (id: string, tableId: string) =>
    fetchApi(`/hospitality/queue/${id}/seat`, {
      method: 'POST',
      body: JSON.stringify({ tableId }),
    }),
  noShow: (id: string) => fetchApi(`/hospitality/queue/${id}/no-show`, { method: 'POST', body: '{}' }),
  leave: (id: string) => fetchApi(`/hospitality/queue/${id}/leave`, { method: 'POST', body: '{}' }),
  seed: () => fetchApi('/hospitality/seed', { method: 'POST', body: '{}' }),

  parcels: () => fetchApi<{ parcels: HospParcel[] }>('/hospitality/parcels'),
  createParcel: (body: { customerName?: string; customerPhone?: string }) =>
    fetchApi<HospOrderDetail>('/hospitality/parcels', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  order: (id: string) => fetchApi<HospOrderDetail>(`/hospitality/orders/${id}`),

  // Catalog admin (Menu & Tables)
  createTable: (body: { name: string; seats?: number; zone?: string }) =>
    fetchApi<{ table: Record<string, unknown> }>('/hospitality/tables', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateTable: (id: string, body: { name: string; seats?: number; zone?: string }) =>
    fetchApi<{ table: Record<string, unknown> }>(`/hospitality/tables/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteTable: (id: string) => fetchApi<{ ok: boolean }>(`/hospitality/tables/${id}`, { method: 'DELETE' }),

  categories: () =>
    fetchApi<{ categories: Array<{ id: string; name: string; sort_order: number }> }>('/hospitality/menu-categories'),
  createCategory: (body: { name: string; sortOrder?: number }) =>
    fetchApi<{ category: Record<string, unknown> }>('/hospitality/menu-categories', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateCategory: (id: string, body: { name: string; sortOrder?: number }) =>
    fetchApi<{ category: Record<string, unknown> }>(`/hospitality/menu-categories/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteCategory: (id: string) => fetchApi<{ ok: boolean }>(`/hospitality/menu-categories/${id}`, { method: 'DELETE' }),

  createMenuItem: (body: {
    name: string;
    categoryId: string;
    price: number;
    description?: string;
    available?: boolean;
    modifierGroupIds?: string[];
  }) =>
    fetchApi<{ item: Record<string, unknown> }>('/hospitality/menu-items', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMenuItem: (
    id: string,
    body: {
      name: string;
      categoryId: string;
      price: number;
      description?: string;
      available?: boolean;
      modifierGroupIds?: string[];
    },
  ) =>
    fetchApi<{ item: Record<string, unknown> }>(`/hospitality/menu-items/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteMenuItem: (id: string) => fetchApi<{ ok: boolean }>(`/hospitality/menu-items/${id}`, { method: 'DELETE' }),

  modifierGroups: () =>
    fetchApi<{
      groups: Array<{
        id: string;
        name: string;
        required: boolean;
        max_select: number;
        modifiers: Array<{ id: string; name: string; price_delta: number }>;
      }>;
    }>('/hospitality/modifier-groups'),
  createModifierGroup: (body: { name: string; required?: boolean; maxSelect?: number }) =>
    fetchApi<{ group: Record<string, unknown> }>('/hospitality/modifier-groups', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateModifierGroup: (id: string, body: { name: string; required?: boolean; maxSelect?: number }) =>
    fetchApi<{ group: Record<string, unknown> }>(`/hospitality/modifier-groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteModifierGroup: (id: string) =>
    fetchApi<{ ok: boolean }>(`/hospitality/modifier-groups/${id}`, { method: 'DELETE' }),
  createModifier: (groupId: string, body: { name: string; priceDelta?: number }) =>
    fetchApi<{ modifier: Record<string, unknown> }>(`/hospitality/modifier-groups/${groupId}/modifiers`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateModifier: (id: string, body: { name: string; priceDelta?: number }) =>
    fetchApi<{ modifier: Record<string, unknown> }>(`/hospitality/modifiers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deleteModifier: (id: string) => fetchApi<{ ok: boolean }>(`/hospitality/modifiers/${id}`, { method: 'DELETE' }),
};
