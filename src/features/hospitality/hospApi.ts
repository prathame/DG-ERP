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
  modifierGroups: Array<{
    id: string;
    name: string;
    required: boolean;
    maxSelect: number;
    modifiers: Array<{ id: string; name: string; price_delta: number }>;
  }>;
};

export type HospOrderDetail = {
  order: { id: string; table_id: string; status: string };
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
};
