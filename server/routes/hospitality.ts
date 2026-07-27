import { Router } from 'express';
import { AuthRequest, blockVendors } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { seedHospitalityCatalog } from '../utils/hospitalitySeed';
import { computeOrderDiscount, isMemberCurrentlyActive, resolveMemberUnitPrice } from '../../shared/hospPricing';
import { hospAnalyticsPeriodStart, hospOrderPayable, parseHospAnalyticsPeriod } from '../../shared/hospAnalytics';

const router = Router();

async function requireHospitality(tenantId: string): Promise<string | null> {
  const row = (await pool.query(`SELECT business_type FROM tenants WHERE id = $1`, [tenantId])).rows[0] as
    { business_type: string } | undefined;
  const type = row?.business_type || '';
  if (type !== 'hotel_restaurant') {
    return 'Hospitality APIs are only available for Hotel / Restaurant tenants';
  }
  return null;
}

/** Payment done (close) + clear table — hotel owner / Admin only. */
function requireHotelPaymentAdmin(req: AuthRequest): string | null {
  const role = req.user?.role || '';
  if (role === 'Admin' || role === 'Super Admin') return null;
  return 'Only Admin can mark payment done or clear tables';
}

function tenantOf(req: AuthRequest): string | null {
  return (req.headers['x-tenant-id'] as string) || null;
}

router.post('/api/hospitality/seed', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    await seedHospitalityCatalog(tenantId);
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.get('/api/hospitality/tables', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });

    const tables = (
      await pool.query(
        `SELECT t.*,
           (SELECT o.id FROM hosp_orders o WHERE o.table_id = t.id AND o.status = 'open' LIMIT 1) AS open_order_id,
           (SELECT COUNT(*)::int FROM hosp_order_items oi
              JOIN hosp_orders o ON o.id = oi.order_id
              WHERE o.table_id = t.id AND o.status = 'open' AND oi.kitchen_status != 'served') AS open_items
         FROM hosp_dining_tables t
         WHERE t.tenant_id = $1
         ORDER BY t.zone, t.name`,
        [tenantId],
      )
    ).rows;
    res.json({ tables });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

/** Floor snapshot + billed/closed order stats for hotel Analytics tab. */
router.get('/api/hospitality/analytics', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });

    const period = parseHospAnalyticsPeriod(req.query?.period);
    const start = hospAnalyticsPeriodStart(period);

    const [tablesRow, kitchenRow, queueRow, parcelsOpenRow, orderRows] = await Promise.all([
      pool.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE status = 'occupied')::int AS occupied,
           COUNT(*) FILTER (WHERE status = 'billing')::int AS billing,
           COUNT(*) FILTER (WHERE status = 'available')::int AS available,
           COUNT(*) FILTER (WHERE status = 'cleaning')::int AS cleaning
         FROM hosp_dining_tables WHERE tenant_id = $1`,
        [tenantId],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c
         FROM hosp_order_items oi
         JOIN hosp_orders o ON o.id = oi.order_id
         WHERE o.tenant_id = $1 AND o.status = 'open'
           AND oi.kitchen_status IN ('queued','preparing','ready')`,
        [tenantId],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM hosp_queue_entries
         WHERE tenant_id = $1 AND status IN ('waiting','called')`,
        [tenantId],
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM hosp_orders
         WHERE tenant_id = $1 AND order_type = 'parcel' AND status IN ('open','billed')`,
        [tenantId],
      ),
      pool.query(
        `SELECT o.id, o.order_type, o.discount_percent, o.discount_amount,
           COALESCE(SUM(
             (oi.unit_price + COALESCE((
               SELECT SUM(m.price_delta) FROM hosp_order_item_modifiers m WHERE m.order_item_id = oi.id
             ), 0)) * oi.qty
           ), 0) AS subtotal
         FROM hosp_orders o
         LEFT JOIN hosp_order_items oi ON oi.order_id = o.id
         WHERE o.tenant_id = $1
           AND o.status IN ('billed','closed')
           AND o.updated_at >= $2
         GROUP BY o.id`,
        [tenantId, start.toISOString()],
      ),
    ]);

    const t = tablesRow.rows[0] as Record<string, number>;
    let dineIn = 0;
    let parcel = 0;
    let revenue = 0;
    for (const row of orderRows.rows as Array<{
      order_type: string;
      discount_percent: number;
      discount_amount: number;
      subtotal: string | number;
    }>) {
      const payable = hospOrderPayable(
        Number(row.subtotal) || 0,
        Number(row.discount_percent) || 0,
        Number(row.discount_amount) || 0,
        computeOrderDiscount,
      );
      revenue += payable;
      if (row.order_type === 'parcel') parcel += 1;
      else dineIn += 1;
    }
    revenue = Math.round(revenue * 100) / 100;

    res.json({
      period,
      periodStart: start.toISOString(),
      tables: {
        total: Number(t.total) || 0,
        occupied: Number(t.occupied) || 0,
        billing: Number(t.billing) || 0,
        available: Number(t.available) || 0,
        cleaning: Number(t.cleaning) || 0,
      },
      orders: {
        dineIn,
        parcel,
        total: dineIn + parcel,
        revenue,
      },
      kitchenQueueDepth: Number((kitchenRow.rows[0] as { c: number })?.c) || 0,
      parcelsOpen: Number((parcelsOpenRow.rows[0] as { c: number })?.c) || 0,
      queueWaiting: Number((queueRow.rows[0] as { c: number })?.c) || 0,
    });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

/** Restaurant books: food sales (dine-in / parcel), daily summary, expenses, GST note. */
router.get('/api/hospitality/accounts-summary', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });

    const period = parseHospAnalyticsPeriod(req.query?.period);
    const start = hospAnalyticsPeriodStart(period);
    const startIso = start.toISOString();
    const startDate = startIso.slice(0, 10);

    const [orderRows, expenseRows, gstRow] = await Promise.all([
      pool.query(
        `SELECT o.id, o.order_type, o.discount_percent, o.discount_amount, o.updated_at,
           COALESCE(SUM(
             (oi.unit_price + COALESCE((
               SELECT SUM(m.price_delta) FROM hosp_order_item_modifiers m WHERE m.order_item_id = oi.id
             ), 0)) * oi.qty
           ), 0) AS subtotal
         FROM hosp_orders o
         LEFT JOIN hosp_order_items oi ON oi.order_id = o.id
         WHERE o.tenant_id = $1
           AND o.status IN ('billed','closed')
           AND o.updated_at >= $2
         GROUP BY o.id`,
        [tenantId, startIso],
      ),
      pool.query(
        `SELECT category, SUM(amount)::numeric AS total, COUNT(*)::int AS count
         FROM expenses
         WHERE tenant_id = $1 AND expense_date >= $2::date
         GROUP BY category
         ORDER BY total DESC`,
        [tenantId, startDate],
      ),
      pool.query(
        `SELECT hosp_charge_gst, hosp_prices_include_gst
         FROM bill_settings WHERE tenant_id = $1`,
        [tenantId],
      ),
    ]);

    let dineInOrders = 0;
    let parcelOrders = 0;
    let dineInRevenue = 0;
    let parcelRevenue = 0;
    const byDayMap = new Map<string, { revenue: number; orders: number; dineIn: number; parcel: number }>();

    for (const row of orderRows.rows as Array<{
      order_type: string;
      discount_percent: number;
      discount_amount: number;
      subtotal: string | number;
      updated_at: string | Date;
    }>) {
      const payable = hospOrderPayable(
        Number(row.subtotal) || 0,
        Number(row.discount_percent) || 0,
        Number(row.discount_amount) || 0,
        computeOrderDiscount,
      );
      const isParcel = row.order_type === 'parcel';
      if (isParcel) {
        parcelOrders += 1;
        parcelRevenue += payable;
      } else {
        dineInOrders += 1;
        dineInRevenue += payable;
      }
      const day = new Date(row.updated_at).toISOString().slice(0, 10);
      const slot = byDayMap.get(day) || { revenue: 0, orders: 0, dineIn: 0, parcel: 0 };
      slot.revenue += payable;
      slot.orders += 1;
      if (isParcel) slot.parcel += 1;
      else slot.dineIn += 1;
      byDayMap.set(day, slot);
    }

    const round2 = (n: number) => Math.round(n * 100) / 100;
    dineInRevenue = round2(dineInRevenue);
    parcelRevenue = round2(parcelRevenue);
    const revenue = round2(dineInRevenue + parcelRevenue);

    const byDay = [...byDayMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, s]) => ({
        date,
        revenue: round2(s.revenue),
        orders: s.orders,
        dineIn: s.dineIn,
        parcel: s.parcel,
      }));

    const byCategory = (expenseRows.rows as Array<{ category: string; total: string | number; count: number }>).map(
      r => ({
        category: r.category || 'Other',
        total: round2(Number(r.total) || 0),
        count: Number(r.count) || 0,
      }),
    );
    const expensesTotal = round2(byCategory.reduce((s, r) => s + r.total, 0));

    const gst = gstRow.rows[0] as { hosp_charge_gst?: boolean; hosp_prices_include_gst?: boolean } | undefined;
    const chargeGst = gst?.hosp_charge_gst === true;
    const pricesIncludeGst = gst?.hosp_prices_include_gst !== false;
    let gstNote =
      'Hospitality GST is configured in Settings → Bill. Sales below are billed order totals (after discounts).';
    if (chargeGst) {
      gstNote = pricesIncludeGst
        ? 'Menu prices include GST (hosp setting on). Totals below are what guests paid.'
        : 'GST is charged on top of menu prices (hosp setting on). Totals below are pre-GST order payables as stored on orders.';
    } else {
      gstNote = 'GST charge on bills is off in Settings. Enable hosp GST there if you need tax on guest bills.';
    }

    res.json({
      period,
      periodStart: startIso,
      sales: {
        revenue,
        orderCount: dineInOrders + parcelOrders,
        dineIn: { revenue: dineInRevenue, orders: dineInOrders },
        parcel: { revenue: parcelRevenue, orders: parcelOrders },
      },
      byDay,
      expenses: {
        total: expensesTotal,
        count: byCategory.reduce((s, r) => s + r.count, 0),
        byCategory,
      },
      gst: { chargeGst, pricesIncludeGst, note: gstNote },
    });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.patch('/api/hospitality/tables/:id/status', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const status = String(req.body?.status || '');
    if (!['available', 'occupied', 'billing', 'cleaning'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const result = await pool.query(`UPDATE hosp_dining_tables SET status = $1 WHERE id = $2 AND tenant_id = $3`, [
      status,
      req.params.id,
      tenantId,
    ]);
    if (!result.rowCount) return res.status(404).json({ error: 'Table not found' });
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.get('/api/hospitality/menu', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });

    const categories = (
      await pool.query(`SELECT * FROM hosp_menu_categories WHERE tenant_id = $1 ORDER BY sort_order`, [tenantId])
    ).rows;
    const items = (await pool.query(`SELECT * FROM hosp_menu_items WHERE tenant_id = $1 ORDER BY name`, [tenantId]))
      .rows as Array<{
      id: string;
      category_id: string;
      name: string;
      description: string;
      price: number;
      member_price: number | null;
      available: boolean;
    }>;
    const groups = (await pool.query(`SELECT * FROM hosp_modifier_groups WHERE tenant_id = $1`, [tenantId]))
      .rows as Array<{ id: string; name: string; required: boolean; max_select: number }>;
    const modifiers = (
      await pool.query(
        `SELECT m.* FROM hosp_modifiers m
         JOIN hosp_modifier_groups g ON g.id = m.group_id
         WHERE g.tenant_id = $1`,
        [tenantId],
      )
    ).rows as Array<{ id: string; group_id: string; name: string; price_delta: number }>;
    const links = (
      await pool.query(
        `SELECT l.* FROM hosp_item_modifier_groups l
         JOIN hosp_menu_items i ON i.id = l.menu_item_id
         WHERE i.tenant_id = $1`,
        [tenantId],
      )
    ).rows as Array<{ menu_item_id: string; group_id: string }>;

    const menu = items.map(item => {
      const groupIds = links.filter(l => l.menu_item_id === item.id).map(l => l.group_id);
      return {
        ...item,
        price: Number(item.price),
        member_price: item.member_price != null ? Number(item.member_price) : null,
        modifierGroups: groups
          .filter(g => groupIds.includes(g.id))
          .map(g => ({
            id: g.id,
            name: g.name,
            required: !!g.required,
            maxSelect: g.max_select,
            modifiers: modifiers
              .filter(m => m.group_id === g.id)
              .map(m => ({ ...m, price_delta: Number(m.price_delta) })),
          })),
      };
    });

    res.json({ categories, items: menu });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

async function getOpenOrder(tenantId: string, tableId: string) {
  return (
    await pool.query(
      `SELECT * FROM hosp_orders WHERE tenant_id = $1 AND table_id = $2 AND status = 'open'
       ORDER BY created_at DESC LIMIT 1`,
      [tenantId, tableId],
    )
  ).rows[0] as { id: string; table_id: string; status: string } | undefined;
}

async function orderDetail(tenantId: string, orderId: string) {
  const order = (await pool.query(`SELECT * FROM hosp_orders WHERE id = $1 AND tenant_id = $2`, [orderId, tenantId]))
    .rows[0] as
    | {
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
      }
    | undefined;
  if (!order) {
    return {
      order: null,
      items: [],
      subtotal: 0,
      discount_value: 0,
      total: 0,
      table: null,
      label: null,
      member: null,
    };
  }

  const table = order.table_id
    ? (
        await pool.query(
          `SELECT id, name, seats, status, zone FROM hosp_dining_tables WHERE id = $1 AND tenant_id = $2`,
          [order.table_id, tenantId],
        )
      ).rows[0]
    : null;

  let member: Record<string, unknown> | null = null;
  if (order.member_id) {
    const m = (
      await pool.query(
        `SELECT m.id, m.name, m.phone, m.status, m.valid_from, m.valid_until, m.plan_id,
                p.name AS plan_name, p.discount_percent, p.use_member_prices
         FROM hosp_members m
         JOIN hosp_membership_plans p ON p.id = m.plan_id
         WHERE m.id = $1 AND m.tenant_id = $2`,
        [order.member_id, tenantId],
      )
    ).rows[0] as Record<string, unknown> | undefined;
    if (m) {
      member = {
        ...m,
        discount_percent: Number(m.discount_percent) || 0,
        use_member_prices: !!m.use_member_prices,
        currently_active: isMemberCurrentlyActive(String(m.status), m.valid_until as string | Date),
      };
    }
  }

  const items = (await pool.query(`SELECT * FROM hosp_order_items WHERE order_id = $1 ORDER BY created_at`, [orderId]))
    .rows as Array<{
    id: string;
    name: string;
    qty: number;
    unit_price: number;
    notes: string;
    kitchen_status: string;
  }>;
  const mods = (
    await pool.query(
      `SELECT oim.* FROM hosp_order_item_modifiers oim
       JOIN hosp_order_items oi ON oi.id = oim.order_item_id
       WHERE oi.order_id = $1`,
      [orderId],
    )
  ).rows as Array<{ order_item_id: string; name: string; price_delta: number }>;

  const withMods = items.map(item => {
    const itemMods = mods.filter(m => m.order_item_id === item.id);
    const lineTotal = (Number(item.unit_price) + itemMods.reduce((s, m) => s + Number(m.price_delta), 0)) * item.qty;
    return {
      ...item,
      unit_price: Number(item.unit_price),
      modifiers: itemMods.map(m => ({ ...m, price_delta: Number(m.price_delta) })),
      lineTotal,
    };
  });
  const subtotal = withMods.reduce((s, i) => s + i.lineTotal, 0);
  const discountPercent = Number(order.discount_percent) || 0;
  const discountAmount = Number(order.discount_amount) || 0;
  const discount_value = computeOrderDiscount(subtotal, discountPercent, discountAmount);
  const total = Math.round((subtotal - discount_value) * 100) / 100;
  const label =
    order.order_type === 'parcel'
      ? `Parcel · ${order.token || order.customer_name || 'Takeaway'}`
      : (table as { name?: string } | null)?.name || 'Table';
  return {
    order: {
      ...order,
      discount_percent: discountPercent,
      discount_amount: discountAmount,
    },
    items: withMods,
    subtotal,
    discount_value,
    total,
    table: table || null,
    label,
    member,
  };
}

async function createOpenOrder(tenantId: string, tableId: string, waiterId: string | null) {
  try {
    const id = uid('ho');
    await pool.query(
      `INSERT INTO hosp_orders (id, tenant_id, table_id, waiter_id, status, order_type)
       VALUES ($1,$2,$3,$4,'open','dine_in')`,
      [id, tenantId, tableId, waiterId],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!msg.includes('idx_hosp_one_open_order') && !msg.includes('unique')) throw e;
  }
  return (await getOpenOrder(tenantId, tableId))!;
}

router.post('/api/hospitality/tables/:id/open', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });

    const tableId = req.params.id;
    const table = (
      await pool.query(`SELECT * FROM hosp_dining_tables WHERE id = $1 AND tenant_id = $2`, [tableId, tenantId])
    ).rows[0] as { id: string; status: string } | undefined;
    if (!table) return res.status(404).json({ error: 'Table not found' });

    let order = await getOpenOrder(tenantId, tableId);
    if (!order && table.status === 'billing') {
      order = (
        await pool.query(
          `SELECT * FROM hosp_orders WHERE tenant_id = $1 AND table_id = $2 AND status = 'billed'
           ORDER BY updated_at DESC LIMIT 1`,
          [tenantId, tableId],
        )
      ).rows[0] as typeof order;
    }
    if (!order) {
      order = await createOpenOrder(tenantId, tableId, req.user?.userId || null);
    }
    if (table.status === 'available' || table.status === 'cleaning') {
      await pool.query(`UPDATE hosp_dining_tables SET status = 'occupied' WHERE id = $1 AND tenant_id = $2`, [
        tableId,
        tenantId,
      ]);
    }
    res.json(await orderDetail(tenantId, order.id));
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.get('/api/hospitality/orders/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const detail = await orderDetail(tenantId, req.params.id);
    if (!detail.order) return res.status(404).json({ error: 'Order not found' });
    res.json(detail);
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/orders/:id/items', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });

    const orderId = req.params.id;
    const order = (
      await pool.query(`SELECT id FROM hosp_orders WHERE id = $1 AND tenant_id = $2 AND status = 'open'`, [
        orderId,
        tenantId,
      ])
    ).rows[0];
    if (!order) return res.status(404).json({ error: 'Open order not found' });

    const { menuItemId, qty = 1, notes = '', modifierIds = [] } = req.body || {};
    const safeQty = Number(qty);
    if (!Number.isInteger(safeQty) || safeQty < 1) {
      return res.status(400).json({ error: 'Quantity must be a positive integer' });
    }

    const item = (
      await pool.query(
        `SELECT id, name, price, member_price FROM hosp_menu_items
         WHERE id = $1 AND tenant_id = $2 AND available = true`,
        [menuItemId, tenantId],
      )
    ).rows[0] as { id: string; name: string; price: number; member_price: number | null } | undefined;
    if (!item) return res.status(400).json({ error: 'Menu item not available' });

    const orderRow = (
      await pool.query(`SELECT member_id FROM hosp_orders WHERE id = $1 AND tenant_id = $2`, [orderId, tenantId])
    ).rows[0] as { member_id: string | null } | undefined;

    let unitPrice = Number(item.price);
    if (orderRow?.member_id) {
      const mem = (
        await pool.query(
          `SELECT m.status, m.valid_until, p.use_member_prices, p.discount_percent
           FROM hosp_members m
           JOIN hosp_membership_plans p ON p.id = m.plan_id
           WHERE m.id = $1 AND m.tenant_id = $2`,
          [orderRow.member_id, tenantId],
        )
      ).rows[0] as
        | {
            status: string;
            valid_until: string | Date;
            use_member_prices: boolean;
            discount_percent: number;
          }
        | undefined;
      if (mem) {
        unitPrice = resolveMemberUnitPrice({
          listPrice: Number(item.price),
          memberPrice: item.member_price != null ? Number(item.member_price) : null,
          memberActive: isMemberCurrentlyActive(mem.status, mem.valid_until),
          useMemberPrices: !!mem.use_member_prices,
          discountPercent: Number(mem.discount_percent) || 0,
        });
      }
    }

    const mods: Array<{ id: string; name: string; price_delta: number }> = [];
    for (const mid of modifierIds as string[]) {
      const m = (
        await pool.query(
          `SELECT m.id, m.name, m.price_delta FROM hosp_modifiers m
           JOIN hosp_modifier_groups g ON g.id = m.group_id
           WHERE m.id = $1 AND g.tenant_id = $2`,
          [mid, tenantId],
        )
      ).rows[0] as { id: string; name: string; price_delta: number } | undefined;
      if (!m) return res.status(400).json({ error: 'Invalid modifier' });
      mods.push(m);
    }

    const orderItemId = uid('hoi');
    await pool.query(
      `INSERT INTO hosp_order_items
         (id, order_id, menu_item_id, name, qty, unit_price, notes, kitchen_status, fired_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'queued',NOW())`,
      [orderItemId, orderId, item.id, item.name, safeQty, unitPrice, notes || ''],
    );
    for (const m of mods) {
      await pool.query(
        `INSERT INTO hosp_order_item_modifiers (id, order_item_id, name, price_delta)
         VALUES ($1,$2,$3,$4)`,
        [uid('hom'), orderItemId, m.name, m.price_delta],
      );
    }
    await pool.query(`UPDATE hosp_orders SET updated_at = NOW(), waiter_id = $1 WHERE id = $2 AND tenant_id = $3`, [
      req.user?.userId || null,
      orderId,
      tenantId,
    ]);

    res.json(await orderDetail(tenantId, orderId));
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.patch('/api/hospitality/order-items/:id/status', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const status = String(req.body?.status || '');
    if (!['queued', 'preparing', 'ready', 'served'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const result = await pool.query(
      `UPDATE hosp_order_items oi SET kitchen_status = $1
       FROM hosp_orders o
       WHERE oi.id = $2 AND oi.order_id = o.id AND o.tenant_id = $3`,
      [status, req.params.id, tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Order item not found' });
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/orders/:id/bill', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const order = (
      await pool.query(`SELECT id, table_id FROM hosp_orders WHERE id = $1 AND tenant_id = $2 AND status = 'open'`, [
        req.params.id,
        tenantId,
      ])
    ).rows[0] as { id: string; table_id: string } | undefined;
    if (!order) return res.status(404).json({ error: 'Open order not found' });
    await pool.query(`UPDATE hosp_orders SET status = 'billed', updated_at = NOW() WHERE id = $1`, [order.id]);
    if (order.table_id) {
      await pool.query(`UPDATE hosp_dining_tables SET status = 'billing' WHERE id = $1 AND tenant_id = $2`, [
        order.table_id,
        tenantId,
      ]);
    }
    res.json(await orderDetail(tenantId, order.id));
  } catch (e) {
    handleApiError(req, res, e);
  }
});

/** Payment done — Admin only. Closes order and frees the table immediately (no cleaning step). */
router.post('/api/hospitality/orders/:id/close', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const role = req.user?.role || '';
    if (role !== 'Admin' && role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only Admin can mark payment done' });
    }
    const order = (
      await pool.query(
        `SELECT id, table_id FROM hosp_orders
         WHERE id = $1 AND tenant_id = $2 AND status IN ('open','billed')`,
        [req.params.id, tenantId],
      )
    ).rows[0] as { id: string; table_id: string | null } | undefined;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await pool.query(`UPDATE hosp_orders SET status = 'closed', updated_at = NOW() WHERE id = $1`, [order.id]);
    if (order.table_id) {
      // Happy path: paid → available (skip cleaning)
      await pool.query(`UPDATE hosp_dining_tables SET status = 'available' WHERE id = $1 AND tenant_id = $2`, [
        order.table_id,
        tenantId,
      ]);
    }
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

/** Legacy clear — Admin only. Prefer close (payment done) which already frees the table. */
router.post('/api/hospitality/tables/:id/clear', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const role = req.user?.role || '';
    if (role !== 'Admin' && role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only Admin can clear tables' });
    }
    await pool.query(`UPDATE hosp_dining_tables SET status = 'available' WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      tenantId,
    ]);
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.get('/api/hospitality/kitchen', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });

    const tickets = (
      await pool.query(
        `SELECT oi.*, o.table_id, o.order_type, o.token, o.customer_name,
                t.name AS table_name, u.name AS waiter_name
         FROM hosp_order_items oi
         JOIN hosp_orders o ON o.id = oi.order_id
         LEFT JOIN hosp_dining_tables t ON t.id = o.table_id
         LEFT JOIN users u ON u.id = o.waiter_id AND u.tenant_id = o.tenant_id
         WHERE o.tenant_id = $1 AND o.status = 'open'
           AND oi.kitchen_status IN ('queued','preparing','ready')
         ORDER BY
           CASE oi.kitchen_status WHEN 'preparing' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
           oi.fired_at ASC NULLS LAST, oi.created_at ASC`,
        [tenantId],
      )
    ).rows as Array<{
      id: string;
      order_type?: string;
      token?: string | null;
      customer_name?: string;
      table_name?: string | null;
    }>;

    const ids = tickets.map(t => t.id);
    let mods: Array<{ order_item_id: string; name: string; price_delta: number }> = [];
    if (ids.length) {
      mods = (await pool.query(`SELECT * FROM hosp_order_item_modifiers WHERE order_item_id = ANY($1::text[])`, [ids]))
        .rows as typeof mods;
    }

    res.json({
      tickets: tickets.map(t => {
        const label =
          t.order_type === 'parcel' ? `Parcel · ${t.token || t.customer_name || 'Takeaway'}` : t.table_name || 'Table';
        return {
          ...t,
          table_name: label,
          label,
          modifiers: mods.filter(m => m.order_item_id === t.id),
        };
      }),
    });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.get('/api/hospitality/queue', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });

    const entries = (
      await pool.query(
        `SELECT q.*, t.name AS table_name
         FROM hosp_queue_entries q
         LEFT JOIN hosp_dining_tables t ON t.id = q.table_id
         WHERE q.tenant_id = $1
           AND (q.status IN ('waiting','called')
             OR (q.status = 'seated' AND q.seated_at >= NOW() - INTERVAL '2 hours'))
         ORDER BY
           CASE q.status WHEN 'called' THEN 0 WHEN 'waiting' THEN 1 ELSE 2 END,
           q.created_at ASC`,
        [tenantId],
      )
    ).rows;
    const nowServing = (
      await pool.query(
        `SELECT token FROM hosp_queue_entries
         WHERE tenant_id = $1 AND status = 'called'
         ORDER BY called_at DESC NULLS LAST LIMIT 1`,
        [tenantId],
      )
    ).rows[0] as { token: string } | undefined;
    res.json({ entries, nowServing: nowServing?.token ?? null });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/queue', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const guestName = String(req.body?.guestName || '').trim();
    if (!guestName) return res.status(400).json({ error: 'Guest name required' });
    const partySize = Number(req.body?.partySize) || 2;
    const count = (
      await pool.query(
        `SELECT COUNT(*)::int AS c FROM hosp_queue_entries
         WHERE tenant_id = $1 AND created_at::date = CURRENT_DATE`,
        [tenantId],
      )
    ).rows[0] as { c: number };
    const token = `T-${String(count.c + 1).padStart(3, '0')}`;
    const id = uid('hq');
    await pool.query(
      `INSERT INTO hosp_queue_entries (id, tenant_id, token, guest_name, party_size, status)
       VALUES ($1,$2,$3,$4,$5,'waiting')`,
      [id, tenantId, token, guestName, partySize],
    );
    res.json({ id, token, guestName, partySize });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/queue/call-next', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const next = (
      await pool.query(
        `SELECT id FROM hosp_queue_entries
         WHERE tenant_id = $1 AND status = 'waiting'
         ORDER BY created_at ASC LIMIT 1`,
        [tenantId],
      )
    ).rows[0] as { id: string } | undefined;
    if (!next) return res.status(404).json({ error: 'No one waiting' });
    await pool.query(
      `UPDATE hosp_queue_entries SET status = 'called', called_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [next.id, tenantId],
    );
    res.json({ ok: true, id: next.id });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/queue/:id/call', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const result = await pool.query(
      `UPDATE hosp_queue_entries SET status = 'called', called_at = NOW()
       WHERE id = $1 AND tenant_id = $2 AND status = 'waiting'`,
      [req.params.id, tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Waiting entry not found' });
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/queue/:id/seat', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const tableId = String(req.body?.tableId || '');
    const entry = (
      await pool.query(`SELECT * FROM hosp_queue_entries WHERE id = $1 AND tenant_id = $2`, [req.params.id, tenantId])
    ).rows[0] as { id: string; status: string } | undefined;
    if (!entry) return res.status(404).json({ error: 'Queue entry not found' });
    if (entry.status !== 'called' && entry.status !== 'waiting') {
      return res.status(400).json({ error: 'Entry cannot be seated' });
    }
    const table = (
      await pool.query(`SELECT * FROM hosp_dining_tables WHERE id = $1 AND tenant_id = $2`, [tableId, tenantId])
    ).rows[0] as { id: string; status: string } | undefined;
    if (!table || table.status !== 'available') {
      return res.status(400).json({ error: 'Table not available' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE hosp_queue_entries SET status = 'seated', seated_at = NOW(), table_id = $1
         WHERE id = $2 AND tenant_id = $3`,
        [tableId, entry.id, tenantId],
      );
      await client.query(`UPDATE hosp_dining_tables SET status = 'occupied' WHERE id = $1 AND tenant_id = $2`, [
        tableId,
        tenantId,
      ]);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await createOpenOrder(tenantId, tableId, null);
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/queue/:id/no-show', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    await pool.query(`UPDATE hosp_queue_entries SET status = 'no_show' WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      tenantId,
    ]);
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/queue/:id/leave', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    await pool.query(`UPDATE hosp_queue_entries SET status = 'left' WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      tenantId,
    ]);
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.get('/api/hospitality/parcels', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const orders = (
      await pool.query(
        `SELECT o.*,
           (SELECT COUNT(*)::int FROM hosp_order_items oi WHERE oi.order_id = o.id) AS item_count,
           (SELECT COALESCE(SUM(
              (oi.unit_price + COALESCE((
                SELECT SUM(m.price_delta) FROM hosp_order_item_modifiers m WHERE m.order_item_id = oi.id
              ), 0)) * oi.qty
            ), 0) FROM hosp_order_items oi WHERE oi.order_id = o.id) AS total
         FROM hosp_orders o
         WHERE o.tenant_id = $1 AND o.order_type = 'parcel' AND o.status IN ('open','billed')
         ORDER BY o.created_at DESC`,
        [tenantId],
      )
    ).rows;
    res.json({
      parcels: orders.map((o: Record<string, unknown>) => ({
        ...o,
        total: Number(o.total) || 0,
        item_count: Number(o.item_count) || 0,
        label: `Parcel · ${(o.token as string) || (o.customer_name as string) || 'Takeaway'}`,
      })),
    });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/parcels', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const customerName = String(req.body?.customerName || '').trim();
    const customerPhone = String(req.body?.customerPhone || '').trim();
    const count = (
      await pool.query(
        `SELECT COUNT(*)::int AS c FROM hosp_orders
         WHERE tenant_id = $1 AND order_type = 'parcel' AND created_at::date = CURRENT_DATE`,
        [tenantId],
      )
    ).rows[0] as { c: number };
    const token = `P-${String(count.c + 1).padStart(3, '0')}`;
    const id = uid('ho');
    await pool.query(
      `INSERT INTO hosp_orders
         (id, tenant_id, table_id, waiter_id, status, order_type, customer_name, customer_phone, token)
       VALUES ($1,$2,NULL,$3,'open','parcel',$4,$5,$6)`,
      [id, tenantId, req.user?.userId || null, customerName, customerPhone, token],
    );
    res.status(201).json(await orderDetail(tenantId, id));
  } catch (e) {
    handleApiError(req, res, e);
  }
});

/** Optional guest name/phone on dine-in or parcel (empty allowed — does not block bill). */
router.put('/api/hospitality/orders/:id/guest', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const order = (
      await pool.query(`SELECT id FROM hosp_orders WHERE id = $1 AND tenant_id = $2 AND status IN ('open','billed')`, [
        req.params.id,
        tenantId,
      ])
    ).rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const customerName = String(req.body?.customerName ?? req.body?.customer_name ?? '').trim();
    const customerPhone = String(req.body?.customerPhone ?? req.body?.customer_phone ?? '').trim();
    await pool.query(
      `UPDATE hosp_orders SET customer_name = $1, customer_phone = $2, updated_at = NOW() WHERE id = $3`,
      [customerName, customerPhone, req.params.id],
    );
    res.json(await orderDetail(tenantId, req.params.id));
  } catch (e) {
    handleApiError(req, res, e);
  }
});

/** Attach / clear membership on an open order (new lines only pick up member prices). */
router.put('/api/hospitality/orders/:id/member', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const order = (
      await pool.query(`SELECT id FROM hosp_orders WHERE id = $1 AND tenant_id = $2 AND status = 'open'`, [
        req.params.id,
        tenantId,
      ])
    ).rows[0];
    if (!order) return res.status(404).json({ error: 'Open order not found' });

    const raw = req.body?.memberId ?? req.body?.member_id;
    if (raw === null || raw === '' || raw === undefined) {
      await pool.query(`UPDATE hosp_orders SET member_id = NULL, updated_at = NOW() WHERE id = $1`, [req.params.id]);
      return res.json(await orderDetail(tenantId, req.params.id));
    }
    const memberId = String(raw).trim();
    const member = (
      await pool.query(`SELECT id, name, phone FROM hosp_members WHERE id = $1 AND tenant_id = $2`, [
        memberId,
        tenantId,
      ])
    ).rows[0] as { id: string; name: string; phone: string } | undefined;
    if (!member) return res.status(400).json({ error: 'Member not found' });
    // Copy member contact onto guest fields for bill print
    await pool.query(
      `UPDATE hosp_orders
       SET member_id = $1, customer_name = $2, customer_phone = $3, updated_at = NOW()
       WHERE id = $4`,
      [memberId, member.name || '', member.phone || '', req.params.id],
    );
    res.json(await orderDetail(tenantId, req.params.id));
  } catch (e) {
    handleApiError(req, res, e);
  }
});

/** Order-level discount (% and/or flat ₹) on subtotal after lines. */
router.put('/api/hospitality/orders/:id/discount', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const order = (
      await pool.query(`SELECT id FROM hosp_orders WHERE id = $1 AND tenant_id = $2 AND status IN ('open','billed')`, [
        req.params.id,
        tenantId,
      ])
    ).rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const discountPercent = Number(req.body?.discountPercent ?? req.body?.discount_percent ?? 0);
    const discountAmount = Number(req.body?.discountAmount ?? req.body?.discount_amount ?? 0);
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      return res.status(400).json({ error: 'discount_percent must be 0–100' });
    }
    if (!Number.isFinite(discountAmount) || discountAmount < 0) {
      return res.status(400).json({ error: 'discount_amount must be ≥ 0' });
    }
    await pool.query(
      `UPDATE hosp_orders SET discount_percent = $1, discount_amount = $2, updated_at = NOW() WHERE id = $3`,
      [discountPercent, discountAmount, req.params.id],
    );
    res.json(await orderDetail(tenantId, req.params.id));
  } catch (e) {
    handleApiError(req, res, e);
  }
});

export default router;
