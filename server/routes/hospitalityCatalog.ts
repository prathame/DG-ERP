/**
 * Hospitality catalog admin — CRUD for tables, menu categories/items, modifiers.
 * Order-taking continues to use GET /api/hospitality/menu + tables from hospitality.ts.
 */
import { Router } from 'express';
import { AuthRequest, blockVendors } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';

const router = Router();

async function requireHospitality(tenantId: string): Promise<string | null> {
  const row = (await pool.query(`SELECT business_type FROM tenants WHERE id = $1`, [tenantId])).rows[0] as
    { business_type: string } | undefined;
  if ((row?.business_type || '') !== 'hotel_restaurant') {
    return 'Hospitality APIs are only available for Hotel / Restaurant tenants';
  }
  return null;
}

function tenantOf(req: AuthRequest): string | null {
  return (req.headers['x-tenant-id'] as string) || null;
}

async function gate(req: AuthRequest, res: import('express').Response): Promise<string | null> {
  const tenantId = tenantOf(req);
  if (!tenantId) {
    res.status(401).json({ error: 'Tenant ID required' });
    return null;
  }
  const err = await requireHospitality(tenantId);
  if (err) {
    res.status(403).json({ error: err });
    return null;
  }
  return tenantId;
}

// ── Dining tables ───────────────────────────────────────────────────────────

router.post('/api/hospitality/tables', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const name = String(req.body?.name || '').trim();
    const seats = Math.max(1, Math.min(50, Number(req.body?.seats) || 4));
    const zone = String(req.body?.zone || 'Main').trim() || 'Main';
    if (!name) return res.status(400).json({ error: 'Table name is required' });
    const id = uid('HT');
    try {
      await pool.query(
        `INSERT INTO hosp_dining_tables (id, tenant_id, name, seats, zone, status)
         VALUES ($1,$2,$3,$4,$5,'available')`,
        [id, tenantId, name, seats, zone],
      );
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === '23505') return res.status(400).json({ error: 'A table with that name already exists' });
      throw e;
    }
    const row = (await pool.query(`SELECT * FROM hosp_dining_tables WHERE id = $1`, [id])).rows[0];
    res.status(201).json({ table: row });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.put('/api/hospitality/tables/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const name = String(req.body?.name || '').trim();
    const seats = Math.max(1, Math.min(50, Number(req.body?.seats) || 4));
    const zone = String(req.body?.zone || 'Main').trim() || 'Main';
    if (!name) return res.status(400).json({ error: 'Table name is required' });
    try {
      const result = await pool.query(
        `UPDATE hosp_dining_tables SET name = $1, seats = $2, zone = $3
         WHERE id = $4 AND tenant_id = $5`,
        [name, seats, zone, req.params.id, tenantId],
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Table not found' });
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === '23505') return res.status(400).json({ error: 'A table with that name already exists' });
      throw e;
    }
    const row = (await pool.query(`SELECT * FROM hosp_dining_tables WHERE id = $1`, [req.params.id])).rows[0];
    res.json({ table: row });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

async function deleteDiningTable(
  tenantId: string,
  tableId: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const active = (
    await pool.query(
      `SELECT id FROM hosp_orders
       WHERE table_id = $1 AND tenant_id = $2 AND status IN ('open','billed') LIMIT 1`,
      [tableId, tenantId],
    )
  ).rows[0];
  if (active) {
    return { error: 'Cannot delete a table with an active order — cancel or close it first', status: 400 };
  }
  // Detach history so closed/cancelled orders don't block table removal
  await pool.query(
    `UPDATE hosp_orders SET table_id = NULL
     WHERE table_id = $1 AND tenant_id = $2 AND status IN ('closed','cancelled')`,
    [tableId, tenantId],
  );
  await pool.query(`UPDATE hosp_queue_entries SET table_id = NULL WHERE table_id = $1 AND tenant_id = $2`, [
    tableId,
    tenantId,
  ]);
  const result = await pool.query(`DELETE FROM hosp_dining_tables WHERE id = $1 AND tenant_id = $2`, [
    tableId,
    tenantId,
  ]);
  if (!result.rowCount) return { error: 'Table not found', status: 404 };
  return { ok: true };
}

router.delete('/api/hospitality/tables/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const result = await deleteDiningTable(tenantId, req.params.id);
    if ('error' in result) return res.status(result.status).json({ error: result.error });
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

/** Bulk delete dining tables. Admin only. Skips tables with active orders. */
router.post('/api/hospitality/tables/bulk-delete', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const role = req.user?.role || '';
    if (role !== 'Admin' && role !== 'Super Admin') {
      return res.status(403).json({ error: 'Only Admin can bulk-delete tables' });
    }
    const ids = Array.isArray(req.body?.ids) ? (req.body.ids as unknown[]).map(x => String(x)).filter(Boolean) : [];
    if (!ids.length) return res.status(400).json({ error: 'Provide ids' });

    let deleted = 0;
    const errors: string[] = [];
    for (const id of ids) {
      const result = await deleteDiningTable(tenantId, id);
      if ('error' in result) errors.push(`${id}: ${result.error}`);
      else deleted += 1;
    }
    res.json({ deleted, errors });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

// ── Menu categories ─────────────────────────────────────────────────────────

router.get('/api/hospitality/menu-categories', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const categories = (
      await pool.query(`SELECT * FROM hosp_menu_categories WHERE tenant_id = $1 ORDER BY sort_order, name`, [tenantId])
    ).rows;
    res.json({ categories });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/menu-categories', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const name = String(req.body?.name || '').trim();
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    const id = uid('HC');
    try {
      await pool.query(`INSERT INTO hosp_menu_categories (id, tenant_id, name, sort_order) VALUES ($1,$2,$3,$4)`, [
        id,
        tenantId,
        name,
        sortOrder,
      ]);
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === '23505') return res.status(400).json({ error: 'Category already exists' });
      throw e;
    }
    const row = (await pool.query(`SELECT * FROM hosp_menu_categories WHERE id = $1`, [id])).rows[0];
    res.status(201).json({ category: row });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.put('/api/hospitality/menu-categories/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const name = String(req.body?.name || '').trim();
    const sortOrder = Number.isFinite(Number(req.body?.sortOrder)) ? Number(req.body.sortOrder) : 0;
    if (!name) return res.status(400).json({ error: 'Category name is required' });
    try {
      const result = await pool.query(
        `UPDATE hosp_menu_categories SET name = $1, sort_order = $2 WHERE id = $3 AND tenant_id = $4`,
        [name, sortOrder, req.params.id, tenantId],
      );
      if (!result.rowCount) return res.status(404).json({ error: 'Category not found' });
    } catch (e) {
      const err = e as { code?: string };
      if (err.code === '23505') return res.status(400).json({ error: 'Category already exists' });
      throw e;
    }
    const row = (await pool.query(`SELECT * FROM hosp_menu_categories WHERE id = $1`, [req.params.id])).rows[0];
    res.json({ category: row });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.delete('/api/hospitality/menu-categories/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const result = await pool.query(`DELETE FROM hosp_menu_categories WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      tenantId,
    ]);
    if (!result.rowCount) return res.status(404).json({ error: 'Category not found' });
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

// ── Menu items ──────────────────────────────────────────────────────────────

router.post('/api/hospitality/menu-items', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const name = String(req.body?.name || '').trim();
    const categoryId = String(req.body?.categoryId || '').trim();
    const description = String(req.body?.description || '').trim();
    const price = Number(req.body?.price);
    const available = req.body?.available !== false;
    const memberPriceRaw = req.body?.memberPrice ?? req.body?.member_price;
    const memberPrice =
      memberPriceRaw === null || memberPriceRaw === undefined || memberPriceRaw === '' ? null : Number(memberPriceRaw);
    const modifierGroupIds = Array.isArray(req.body?.modifierGroupIds)
      ? (req.body.modifierGroupIds as unknown[]).map(String)
      : [];
    if (!name) return res.status(400).json({ error: 'Item name is required' });
    if (!categoryId) return res.status(400).json({ error: 'Category is required' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Valid price is required' });
    if (memberPrice != null && (!Number.isFinite(memberPrice) || memberPrice < 0)) {
      return res.status(400).json({ error: 'Valid member price is required' });
    }
    const cat = (
      await pool.query(`SELECT id FROM hosp_menu_categories WHERE id = $1 AND tenant_id = $2`, [categoryId, tenantId])
    ).rows[0];
    if (!cat) return res.status(400).json({ error: 'Category not found' });
    const id = uid('HI');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO hosp_menu_items (id, tenant_id, category_id, name, description, price, available, member_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, tenantId, categoryId, name, description, price, available, memberPrice],
      );
      for (const gid of modifierGroupIds) {
        const g = (
          await client.query(`SELECT id FROM hosp_modifier_groups WHERE id = $1 AND tenant_id = $2`, [gid, tenantId])
        ).rows[0];
        if (g) {
          await client.query(
            `INSERT INTO hosp_item_modifier_groups (menu_item_id, group_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [id, gid],
          );
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const row = (await pool.query(`SELECT * FROM hosp_menu_items WHERE id = $1`, [id])).rows[0];
    res.status(201).json({ item: row });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.put('/api/hospitality/menu-items/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const name = String(req.body?.name || '').trim();
    const categoryId = String(req.body?.categoryId || '').trim();
    const description = String(req.body?.description || '').trim();
    const price = Number(req.body?.price);
    const available = req.body?.available !== false;
    const memberPriceRaw = req.body?.memberPrice ?? req.body?.member_price;
    const memberPrice =
      memberPriceRaw === null || memberPriceRaw === undefined || memberPriceRaw === '' ? null : Number(memberPriceRaw);
    const modifierGroupIds = Array.isArray(req.body?.modifierGroupIds)
      ? (req.body.modifierGroupIds as unknown[]).map(String)
      : null;
    if (!name) return res.status(400).json({ error: 'Item name is required' });
    if (!categoryId) return res.status(400).json({ error: 'Category is required' });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: 'Valid price is required' });
    if (memberPrice != null && (!Number.isFinite(memberPrice) || memberPrice < 0)) {
      return res.status(400).json({ error: 'Valid member price is required' });
    }
    const cat = (
      await pool.query(`SELECT id FROM hosp_menu_categories WHERE id = $1 AND tenant_id = $2`, [categoryId, tenantId])
    ).rows[0];
    if (!cat) return res.status(400).json({ error: 'Category not found' });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `UPDATE hosp_menu_items
         SET category_id = $1, name = $2, description = $3, price = $4, available = $5, member_price = $6
         WHERE id = $7 AND tenant_id = $8`,
        [categoryId, name, description, price, available, memberPrice, req.params.id, tenantId],
      );
      if (!result.rowCount) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Item not found' });
      }
      if (modifierGroupIds) {
        await client.query(`DELETE FROM hosp_item_modifier_groups WHERE menu_item_id = $1`, [req.params.id]);
        for (const gid of modifierGroupIds) {
          const g = (
            await client.query(`SELECT id FROM hosp_modifier_groups WHERE id = $1 AND tenant_id = $2`, [gid, tenantId])
          ).rows[0];
          if (g) {
            await client.query(
              `INSERT INTO hosp_item_modifier_groups (menu_item_id, group_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
              [req.params.id, gid],
            );
          }
        }
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    const row = (await pool.query(`SELECT * FROM hosp_menu_items WHERE id = $1`, [req.params.id])).rows[0];
    res.json({ item: row });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.delete('/api/hospitality/menu-items/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const result = await pool.query(`DELETE FROM hosp_menu_items WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      tenantId,
    ]);
    if (!result.rowCount) return res.status(404).json({ error: 'Item not found' });
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

// ── Modifier groups + options ───────────────────────────────────────────────

router.get('/api/hospitality/modifier-groups', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const groups = (
      await pool.query(`SELECT * FROM hosp_modifier_groups WHERE tenant_id = $1 ORDER BY name`, [tenantId])
    ).rows;
    const mods = (
      await pool.query(
        `SELECT m.* FROM hosp_modifiers m
         JOIN hosp_modifier_groups g ON g.id = m.group_id
         WHERE g.tenant_id = $1
         ORDER BY m.name`,
        [tenantId],
      )
    ).rows;
    res.json({
      groups: groups.map(g => ({
        ...g,
        modifiers: mods.filter(m => m.group_id === g.id),
      })),
    });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/modifier-groups', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const name = String(req.body?.name || '').trim();
    const required = !!req.body?.required;
    const maxSelect = Math.max(1, Math.min(20, Number(req.body?.maxSelect) || 3));
    if (!name) return res.status(400).json({ error: 'Group name is required' });
    const id = uid('HG');
    await pool.query(
      `INSERT INTO hosp_modifier_groups (id, tenant_id, name, required, max_select) VALUES ($1,$2,$3,$4,$5)`,
      [id, tenantId, name, required, maxSelect],
    );
    const row = (await pool.query(`SELECT * FROM hosp_modifier_groups WHERE id = $1`, [id])).rows[0];
    res.status(201).json({ group: { ...row, modifiers: [] } });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.put('/api/hospitality/modifier-groups/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const name = String(req.body?.name || '').trim();
    const required = !!req.body?.required;
    const maxSelect = Math.max(1, Math.min(20, Number(req.body?.maxSelect) || 3));
    if (!name) return res.status(400).json({ error: 'Group name is required' });
    const result = await pool.query(
      `UPDATE hosp_modifier_groups SET name = $1, required = $2, max_select = $3
       WHERE id = $4 AND tenant_id = $5`,
      [name, required, maxSelect, req.params.id, tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Group not found' });
    const row = (await pool.query(`SELECT * FROM hosp_modifier_groups WHERE id = $1`, [req.params.id])).rows[0];
    res.json({ group: row });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.delete('/api/hospitality/modifier-groups/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const result = await pool.query(`DELETE FROM hosp_modifier_groups WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      tenantId,
    ]);
    if (!result.rowCount) return res.status(404).json({ error: 'Group not found' });
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/modifier-groups/:id/modifiers', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const g = (
      await pool.query(`SELECT id FROM hosp_modifier_groups WHERE id = $1 AND tenant_id = $2`, [
        req.params.id,
        tenantId,
      ])
    ).rows[0];
    if (!g) return res.status(404).json({ error: 'Group not found' });
    const name = String(req.body?.name || '').trim();
    const priceDelta = Number(req.body?.priceDelta ?? 0);
    if (!name) return res.status(400).json({ error: 'Modifier name is required' });
    if (!Number.isFinite(priceDelta)) return res.status(400).json({ error: 'Valid price delta is required' });
    const id = uid('HM');
    await pool.query(`INSERT INTO hosp_modifiers (id, group_id, name, price_delta) VALUES ($1,$2,$3,$4)`, [
      id,
      req.params.id,
      name,
      priceDelta,
    ]);
    const row = (await pool.query(`SELECT * FROM hosp_modifiers WHERE id = $1`, [id])).rows[0];
    res.status(201).json({ modifier: row });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.put('/api/hospitality/modifiers/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const name = String(req.body?.name || '').trim();
    const priceDelta = Number(req.body?.priceDelta ?? 0);
    if (!name) return res.status(400).json({ error: 'Modifier name is required' });
    if (!Number.isFinite(priceDelta)) return res.status(400).json({ error: 'Valid price delta is required' });
    const result = await pool.query(
      `UPDATE hosp_modifiers m SET name = $1, price_delta = $2
       FROM hosp_modifier_groups g
       WHERE m.id = $3 AND m.group_id = g.id AND g.tenant_id = $4`,
      [name, priceDelta, req.params.id, tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Modifier not found' });
    const row = (await pool.query(`SELECT * FROM hosp_modifiers WHERE id = $1`, [req.params.id])).rows[0];
    res.json({ modifier: row });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.delete('/api/hospitality/modifiers/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const result = await pool.query(
      `DELETE FROM hosp_modifiers m
       USING hosp_modifier_groups g
       WHERE m.id = $1 AND m.group_id = g.id AND g.tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Modifier not found' });
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

// ── CSV / Excel batch import (all-or-nothing) ────────────────────────────────

function ynTrue(v: unknown): boolean {
  const s = String(v ?? '')
    .trim()
    .toLowerCase();
  return s === 'y' || s === 'yes' || s === 'true' || s === '1';
}

/** Case / spacing / underscore insensitive field read from a CSV/Excel row. */
function csvField(row: Record<string, unknown>, ...aliases: string[]): string {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    const nk = k
      .replace(/^\uFEFF/, '')
      .toLowerCase()
      .replace(/[\s_-]+/g, '');
    if (!map.has(nk)) map.set(nk, String(v ?? '').trim());
  }
  for (const a of aliases) {
    const nk = a.toLowerCase().replace(/[\s_-]+/g, '');
    if (map.has(nk)) return map.get(nk)!;
  }
  return '';
}

function normGroupName(s: string): string {
  return s.trim().replace(/\s+/g, ' ').toLowerCase();
}

router.post('/api/hospitality/tables/batch', blockVendors, async (req: AuthRequest, res) => {
  const tenantId = await gate(req, res);
  if (!tenantId) return;
  const { items } = req.body as { items: Record<string, unknown>[] };
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items to import' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let count = 0;
    for (const r of items) {
      const name = String(r.name || '').trim();
      const seats = Math.max(1, Math.min(50, Number(r.seats) || 4));
      const zone = String(r.zone || 'Main').trim() || 'Main';
      if (!name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Row ${count + 1}: Table name is required — nothing imported` });
      }
      const id = uid('HT');
      try {
        await client.query(
          `INSERT INTO hosp_dining_tables (id, tenant_id, name, seats, zone, status)
           VALUES ($1,$2,$3,$4,$5,'available')`,
          [id, tenantId, name, seats, zone],
        );
      } catch (e) {
        await client.query('ROLLBACK');
        const err = e as { code?: string };
        if (err.code === '23505') {
          return res.status(400).json({ error: `Table "${name}" already exists — nothing imported` });
        }
        throw e;
      }
      count++;
    }
    await client.query('COMMIT');
    res.status(201).json({ success: count, errors: [] });
  } catch (e) {
    await client.query('ROLLBACK');
    handleApiError(req, res, e, 'Table import failed', { publicMessage: 'Import failed — no tables were added' });
  } finally {
    client.release();
  }
});

router.post('/api/hospitality/modifiers/batch', blockVendors, async (req: AuthRequest, res) => {
  const tenantId = await gate(req, res);
  if (!tenantId) return;
  const { items } = req.body as { items: Record<string, unknown>[] };
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items to import' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const groupCache = new Map<string, string>();
    let count = 0;
    for (const r of items) {
      const groupName = csvField(r, 'groupName', 'group', 'group_name');
      const modifierName = csvField(r, 'modifierName', 'name', 'modifier_name', 'optionName', 'option');
      const required = ynTrue(csvField(r, 'required') || r.required);
      const maxSelect = Math.max(
        1,
        Math.min(20, Number(csvField(r, 'maxSelect', 'max_select') || r.maxSelect || r.max_select) || 3),
      );
      const priceDelta = Number(csvField(r, 'priceDelta', 'price_delta') || r.priceDelta || r.price_delta || 0);
      if (!groupName || !modifierName) {
        await client.query('ROLLBACK');
        return res
          .status(400)
          .json({ error: `Row ${count + 1}: groupName and modifierName are required — nothing imported` });
      }
      if (!Number.isFinite(priceDelta)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Row ${count + 1}: Invalid priceDelta — nothing imported` });
      }
      const groupKey = normGroupName(groupName);
      let gid = groupCache.get(groupKey);
      if (!gid) {
        const existing = (
          await client.query(
            `SELECT id FROM hosp_modifier_groups
             WHERE tenant_id = $1 AND lower(btrim(regexp_replace(name, '\\s+', ' ', 'g'))) = $2`,
            [tenantId, groupKey],
          )
        ).rows[0] as { id: string } | undefined;
        if (existing) {
          gid = existing.id;
        } else {
          gid = uid('HG');
          await client.query(
            `INSERT INTO hosp_modifier_groups (id, tenant_id, name, required, max_select)
             VALUES ($1,$2,$3,$4,$5)`,
            [gid, tenantId, groupName.replace(/\s+/g, ' ').trim(), required, maxSelect],
          );
        }
        groupCache.set(groupKey, gid);
      }
      await client.query(`INSERT INTO hosp_modifiers (id, group_id, name, price_delta) VALUES ($1,$2,$3,$4)`, [
        uid('HM'),
        gid,
        modifierName,
        priceDelta,
      ]);
      count++;
    }
    await client.query('COMMIT');
    res.status(201).json({ success: count, errors: [] });
  } catch (e) {
    await client.query('ROLLBACK');
    handleApiError(req, res, e, 'Modifier import failed', {
      publicMessage: 'Import failed — no modifiers were added',
    });
  } finally {
    client.release();
  }
});

router.post('/api/hospitality/menu-items/batch', blockVendors, async (req: AuthRequest, res) => {
  const tenantId = await gate(req, res);
  if (!tenantId) return;
  const { items } = req.body as { items: Record<string, unknown>[] };
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items to import' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const catCache = new Map<string, string>();
    const groupRows = (await client.query(`SELECT id, name FROM hosp_modifier_groups WHERE tenant_id = $1`, [tenantId]))
      .rows as Array<{ id: string; name: string }>;
    const groupByName = new Map(groupRows.map(g => [normGroupName(g.name), g.id]));
    let sortNext =
      Number(
        (
          await client.query(
            `SELECT COALESCE(MAX(sort_order), 0)::int AS m FROM hosp_menu_categories WHERE tenant_id = $1`,
            [tenantId],
          )
        ).rows[0]?.m,
      ) + 1;
    let count = 0;
    for (const r of items) {
      const category = csvField(r, 'category', 'categoryName', 'category_name');
      const name = csvField(r, 'name', 'dish', 'dishName', 'item');
      const description = csvField(r, 'description', 'desc');
      const price = Number(csvField(r, 'price') || r.price);
      const memberRaw = csvField(r, 'memberPrice', 'member_price') || r.memberPrice || r.member_price;
      const memberPrice =
        memberRaw === null || memberRaw === undefined || String(memberRaw).trim() === '' ? null : Number(memberRaw);
      const availableRaw = csvField(r, 'available');
      const available = availableRaw === '' ? true : ynTrue(availableRaw);
      const modGroupsRaw = csvField(r, 'modifierGroups', 'modifier_groups', 'modifiers', 'modifierGroup');
      if (!category || !name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Row ${count + 1}: category and name are required — nothing imported` });
      }
      if (!Number.isFinite(price) || price < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Row ${count + 1}: Valid price is required — nothing imported` });
      }
      if (memberPrice != null && (!Number.isFinite(memberPrice) || memberPrice < 0)) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Row ${count + 1}: Invalid memberPrice — nothing imported` });
      }
      let catId = catCache.get(normGroupName(category));
      if (!catId) {
        const existing = (
          await client.query(
            `SELECT id FROM hosp_menu_categories
             WHERE tenant_id = $1 AND lower(btrim(regexp_replace(name, '\\s+', ' ', 'g'))) = $2`,
            [tenantId, normGroupName(category)],
          )
        ).rows[0] as { id: string } | undefined;
        if (existing) {
          catId = existing.id;
        } else {
          catId = uid('HC');
          await client.query(
            `INSERT INTO hosp_menu_categories (id, tenant_id, name, sort_order) VALUES ($1,$2,$3,$4)`,
            [catId, tenantId, category.replace(/\s+/g, ' ').trim(), sortNext++],
          );
        }
        catCache.set(normGroupName(category), catId);
      }
      const id = uid('HI');
      await client.query(
        `INSERT INTO hosp_menu_items (id, tenant_id, category_id, name, description, price, available, member_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, tenantId, catId, name, description, price, available, memberPrice],
      );
      if (modGroupsRaw) {
        for (const part of modGroupsRaw
          .split(/[|;]/)
          .map(s => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean)) {
          const gid = groupByName.get(normGroupName(part));
          if (!gid) {
            await client.query('ROLLBACK');
            const known = groupRows.map(g => g.name).sort((a, b) => a.localeCompare(b));
            const hint =
              known.length > 0
                ? ` Known groups: ${known.map(n => `"${n}"`).join(', ')}.`
                : ' No modifier groups exist yet.';
            return res.status(400).json({
              error: `Row ${count + 1}: Unknown modifier group "${part}" — import modifiers first.${hint}`,
            });
          }
          await client.query(
            `INSERT INTO hosp_item_modifier_groups (menu_item_id, group_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,
            [id, gid],
          );
        }
      }
      count++;
    }
    await client.query('COMMIT');
    res.status(201).json({ success: count, errors: [] });
  } catch (e) {
    await client.query('ROLLBACK');
    handleApiError(req, res, e, 'Menu import failed', { publicMessage: 'Import failed — no dishes were added' });
  } finally {
    client.release();
  }
});

export default router;
