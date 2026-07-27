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

/** Natural sort for hotel-owner table names (T2 before T10). */
export function compareHospTableName(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

/** Zone then name — matches how Floor groups tiles. */
export function compareHospTablesByZoneThenName(a: HospTable, b: HospTable): number {
  const byZone = (a.zone || '').localeCompare(b.zone || '', undefined, { sensitivity: 'base' });
  if (byZone !== 0) return byZone;
  return compareHospTableName(a.name, b.name);
}

export type HospMenuItem = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  price: number;
  member_price?: number | null;
  available?: boolean;
  modifierGroups: Array<{
    id: string;
    name: string;
    required: boolean;
    maxSelect: number;
    modifiers: Array<{ id: string; name: string; price_delta: number }>;
  }>;
};

export type HospMemberSummary = {
  id: string;
  name: string;
  phone: string;
  status: string;
  plan_name?: string;
  currently_active?: boolean;
  valid_until?: string;
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
    member_id?: string | null;
    discount_percent?: number;
    discount_amount?: number;
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
  /** Sum of line totals before order discount */
  subtotal?: number;
  /** Computed order discount (₹) */
  discount_value?: number;
  /** Payable after order discount (before GST) */
  total: number;
  table: { id: string; name: string; seats: number; status: string; zone: string } | null;
  label?: string | null;
  member?: HospMemberSummary | null;
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

export type HospMembershipPlan = {
  id: string;
  name: string;
  period: 'monthly' | 'yearly';
  fee: number;
  discount_percent: number;
  use_member_prices: boolean;
  active: boolean;
};

export type HospMember = {
  id: string;
  name: string;
  phone: string;
  plan_id: string;
  status: 'active' | 'expired' | 'cancelled';
  valid_from: string;
  valid_until: string;
  plan_name?: string;
  period?: string;
  fee?: number;
  discount_percent?: number;
  use_member_prices?: boolean;
  currently_active?: boolean;
  /** Order-time validity: active + date + plan */
  valid?: boolean;
  reason?: string | null;
};

export type HospMemberLookup = {
  found: boolean;
  valid: boolean;
  reason: string | null;
  member: HospMember | null;
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
  setOrderMember: (orderId: string, memberId: string | null) =>
    fetchApi<HospOrderDetail>(`/hospitality/orders/${orderId}/member`, {
      method: 'PUT',
      body: JSON.stringify({ memberId }),
    }),
  setOrderGuest: (orderId: string, body: { customerName?: string; customerPhone?: string }) =>
    fetchApi<HospOrderDetail>(`/hospitality/orders/${orderId}/guest`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  setOrderDiscount: (orderId: string, body: { discountPercent: number; discountAmount: number }) =>
    fetchApi<HospOrderDetail>(`/hospitality/orders/${orderId}/discount`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  bill: (orderId: string) =>
    fetchApi<HospOrderDetail>(`/hospitality/orders/${orderId}/bill`, { method: 'POST', body: '{}' }),
  close: (orderId: string) =>
    fetchApi<{ ok: boolean }>(`/hospitality/orders/${orderId}/close`, { method: 'POST', body: '{}' }),
  /** Cancel/void open or billed order (Admin; Waiter only when empty + open). */
  cancelOrder: (orderId: string) =>
    fetchApi<{ ok: boolean; cancelled: boolean }>(`/hospitality/orders/${orderId}/cancel`, {
      method: 'POST',
      body: '{}',
    }),
  /** Admin: cancel many open/billed orders by order and/or table id. */
  bulkCancelOrders: (body: { orderIds?: string[]; tableIds?: string[] }) =>
    fetchApi<{ cancelled: number; errors: string[] }>('/hospitality/orders/bulk-cancel', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  /** Remove a queued line from an open order. */
  removeItem: (itemId: string) => fetchApi<HospOrderDetail>(`/hospitality/order-items/${itemId}`, { method: 'DELETE' }),
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

  parcels: () => fetchApi<{ parcels: HospParcel[] }>('/hospitality/parcels'),
  createParcel: (body: { customerName?: string; customerPhone?: string }) =>
    fetchApi<HospOrderDetail>('/hospitality/parcels', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  order: (id: string) => fetchApi<HospOrderDetail>(`/hospitality/orders/${id}`),

  // Membership
  membershipPlans: () => fetchApi<{ plans: HospMembershipPlan[] }>('/hospitality/membership-plans'),
  createPlan: (body: {
    name: string;
    period: 'monthly' | 'yearly';
    fee: number;
    discountPercent: number;
    useMemberPrices: boolean;
    active?: boolean;
  }) =>
    fetchApi<{ plan: HospMembershipPlan }>('/hospitality/membership-plans', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updatePlan: (
    id: string,
    body: {
      name: string;
      period: 'monthly' | 'yearly';
      fee: number;
      discountPercent: number;
      useMemberPrices: boolean;
      active?: boolean;
    },
  ) =>
    fetchApi<{ plan: HospMembershipPlan }>(`/hospitality/membership-plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  deletePlan: (id: string) => fetchApi<{ ok: boolean }>(`/hospitality/membership-plans/${id}`, { method: 'DELETE' }),
  members: (params?: { phone?: string; q?: string }) => {
    const qs = new URLSearchParams();
    if (params?.phone) qs.set('phone', params.phone);
    if (params?.q) qs.set('q', params.q);
    const suffix = qs.toString() ? `?${qs}` : '';
    return fetchApi<{ members: HospMember[] }>(`/hospitality/members${suffix}`);
  },
  /** Order-time phone check — returns found/valid/reason without attaching. */
  lookupMember: (phone: string) =>
    fetchApi<HospMemberLookup>(`/hospitality/members/lookup?phone=${encodeURIComponent(phone.trim())}`),
  createMember: (body: { name: string; phone: string; planId: string }) =>
    fetchApi<{ member: HospMember }>('/hospitality/members', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateMember: (
    id: string,
    body: { name: string; phone: string; planId: string; status: 'active' | 'expired' | 'cancelled' },
  ) =>
    fetchApi<{ member: HospMember }>(`/hospitality/members/${id}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  renewMember: (id: string) =>
    fetchApi<{ member: HospMember }>(`/hospitality/members/${id}/renew`, { method: 'POST', body: '{}' }),

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
  bulkDeleteTables: (ids: string[]) =>
    fetchApi<{ deleted: number; errors: string[] }>('/hospitality/tables/bulk-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  importTablesBatch: (items: Array<{ name: string; seats?: number | string; zone?: string }>) =>
    fetchApi<{ success: number; errors: string[] }>('/hospitality/tables/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  importMenuItemsBatch: (items: Record<string, string | number | boolean | null | undefined>[]) =>
    fetchApi<{ success: number; errors: string[]; createdModifierGroups?: string[] }>('/hospitality/menu-items/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  importModifiersBatch: (items: Record<string, string | number | boolean | null | undefined>[]) =>
    fetchApi<{ success: number; errors: string[] }>('/hospitality/modifiers/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  importPlansBatch: (items: Record<string, string | number | boolean | null | undefined>[]) =>
    fetchApi<{ success: number; errors: string[] }>('/hospitality/membership-plans/batch', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),

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
    memberPrice?: number | null;
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
      memberPrice?: number | null;
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

  analytics: (period: 'today' | 'week' = 'today') =>
    fetchApi<{
      period: 'today' | 'week';
      periodStart: string;
      tables: {
        total: number;
        occupied: number;
        billing: number;
        available: number;
        cleaning: number;
      };
      orders: { dineIn: number; parcel: number; total: number; revenue: number };
      kitchenQueueDepth: number;
      parcelsOpen: number;
      queueWaiting: number;
    }>(`/hospitality/analytics?period=${period}`),

  accountsSummary: (period: 'today' | 'week' = 'today') =>
    fetchApi<{
      period: 'today' | 'week';
      periodStart: string;
      sales: {
        revenue: number;
        orderCount: number;
        dineIn: { revenue: number; orders: number };
        parcel: { revenue: number; orders: number };
      };
      byDay: Array<{ date: string; revenue: number; orders: number; dineIn: number; parcel: number }>;
      expenses: { total: number; count: number; byCategory: Array<{ category: string; total: number; count: number }> };
      gst: { chargeGst: boolean; pricesIncludeGst: boolean; note: string };
    }>(`/hospitality/accounts-summary?period=${period}`),
};
