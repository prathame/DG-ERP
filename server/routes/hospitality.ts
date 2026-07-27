import { Router } from 'express';
import { AuthRequest, blockVendors } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { seedHospitalityCatalog } from '../utils/hospitalitySeed';

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
    handleApiError(res, e);
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
    handleApiError(res, e);
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
    handleApiError(res, e);
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
    const items = (
      await pool.query(`SELECT * FROM hosp_menu_items WHERE tenant_id = $1 AND available = true ORDER BY name`, [
        tenantId,
      ])
    ).rows as Array<{ id: string; category_id: string; name: string; description: string; price: number }>;
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
    handleApiError(res, e);
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
    .rows[0] as { id: string; table_id: string; status: string } | undefined;
  if (!order) return { order: null, items: [], total: 0, table: null };

  const table = (
    await pool.query(`SELECT id, name, seats, status, zone FROM hosp_dining_tables WHERE id = $1 AND tenant_id = $2`, [
      order.table_id,
      tenantId,
    ])
  ).rows[0];

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
  const total = withMods.reduce((s, i) => s + i.lineTotal, 0);
  return { order, items: withMods, total, table };
}

async function createOpenOrder(tenantId: string, tableId: string, waiterId: string | null) {
  try {
    const id = uid('ho');
    await pool.query(
      `INSERT INTO hosp_orders (id, tenant_id, table_id, waiter_id, status) VALUES ($1,$2,$3,$4,'open')`,
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
    handleApiError(res, e);
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
    handleApiError(res, e);
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
        `SELECT id, name, price FROM hosp_menu_items
         WHERE id = $1 AND tenant_id = $2 AND available = true`,
        [menuItemId, tenantId],
      )
    ).rows[0] as { id: string; name: string; price: number } | undefined;
    if (!item) return res.status(400).json({ error: 'Menu item not available' });

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
      [orderItemId, orderId, item.id, item.name, safeQty, item.price, notes || ''],
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
    handleApiError(res, e);
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
    handleApiError(res, e);
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
    await pool.query(`UPDATE hosp_dining_tables SET status = 'billing' WHERE id = $1 AND tenant_id = $2`, [
      order.table_id,
      tenantId,
    ]);
    res.json(await orderDetail(tenantId, order.id));
  } catch (e) {
    handleApiError(res, e);
  }
});

router.post('/api/hospitality/orders/:id/close', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    const order = (
      await pool.query(
        `SELECT id, table_id FROM hosp_orders
         WHERE id = $1 AND tenant_id = $2 AND status IN ('open','billed')`,
        [req.params.id, tenantId],
      )
    ).rows[0] as { id: string; table_id: string } | undefined;
    if (!order) return res.status(404).json({ error: 'Order not found' });
    await pool.query(`UPDATE hosp_orders SET status = 'closed', updated_at = NOW() WHERE id = $1`, [order.id]);
    await pool.query(`UPDATE hosp_dining_tables SET status = 'cleaning' WHERE id = $1 AND tenant_id = $2`, [
      order.table_id,
      tenantId,
    ]);
    res.json({ ok: true });
  } catch (e) {
    handleApiError(res, e);
  }
});

router.post('/api/hospitality/tables/:id/clear', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const err = await requireHospitality(tenantId);
    if (err) return res.status(403).json({ error: err });
    await pool.query(`UPDATE hosp_dining_tables SET status = 'available' WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      tenantId,
    ]);
    res.json({ ok: true });
  } catch (e) {
    handleApiError(res, e);
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
        `SELECT oi.*, o.table_id, t.name AS table_name, u.name AS waiter_name
         FROM hosp_order_items oi
         JOIN hosp_orders o ON o.id = oi.order_id
         JOIN hosp_dining_tables t ON t.id = o.table_id
         LEFT JOIN users u ON u.id = o.waiter_id AND u.tenant_id = o.tenant_id
         WHERE o.tenant_id = $1 AND o.status = 'open'
           AND oi.kitchen_status IN ('queued','preparing','ready')
         ORDER BY
           CASE oi.kitchen_status WHEN 'preparing' THEN 0 WHEN 'queued' THEN 1 ELSE 2 END,
           oi.fired_at ASC NULLS LAST, oi.created_at ASC`,
        [tenantId],
      )
    ).rows as Array<{ id: string }>;

    const ids = tickets.map(t => t.id);
    let mods: Array<{ order_item_id: string; name: string; price_delta: number }> = [];
    if (ids.length) {
      mods = (await pool.query(`SELECT * FROM hosp_order_item_modifiers WHERE order_item_id = ANY($1::text[])`, [ids]))
        .rows as typeof mods;
    }

    res.json({
      tickets: tickets.map(t => ({
        ...t,
        modifiers: mods.filter(m => m.order_item_id === t.id),
      })),
    });
  } catch (e) {
    handleApiError(res, e);
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
    handleApiError(res, e);
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
    handleApiError(res, e);
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
    handleApiError(res, e);
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
    handleApiError(res, e);
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
    handleApiError(res, e);
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
    handleApiError(res, e);
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
    handleApiError(res, e);
  }
});

export default router;
