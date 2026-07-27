/**
 * Hotel membership plans + member registry (Admin CRUD).
 * Attach/search used by waiters lives here too; order line pricing is in hospitality.ts.
 */
import { Router } from 'express';
import { AuthRequest, blockVendors } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { evaluateMembershipValidity, isMemberCurrentlyActive } from '../../shared/hospPricing';

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

function requireAdminRole(req: AuthRequest, res: import('express').Response): boolean {
  const role = req.user?.role || '';
  if (role === 'Admin' || role === 'Super Admin') return true;
  res.status(403).json({ error: 'Only Admin can manage membership plans and members' });
  return false;
}

function addPeriod(from: Date, period: 'monthly' | 'yearly'): Date {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  if (period === 'yearly') d.setFullYear(d.getFullYear() + 1);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

function toDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mapMember(row: Record<string, unknown>) {
  const status = String(row.status || '');
  const validUntil = row.valid_until as string | Date;
  const planActive = row.plan_active !== false && row.plan_active !== undefined ? !!row.plan_active : true;
  const active = isMemberCurrentlyActive(status, validUntil);
  const validity = evaluateMembershipValidity({ status, validUntil, planActive });
  return {
    ...row,
    fee: Number(row.fee) || 0,
    discount_percent: Number(row.discount_percent) || 0,
    use_member_prices: !!row.use_member_prices,
    plan_active: row.plan_active !== false && row.plan_active !== undefined ? !!row.plan_active : undefined,
    currently_active: active,
    valid: validity.valid,
    reason: validity.reason,
  };
}

// ── Plans ───────────────────────────────────────────────────────────────────

router.get('/api/hospitality/membership-plans', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const rows = (
      await pool.query(`SELECT * FROM hosp_membership_plans WHERE tenant_id = $1 ORDER BY name`, [tenantId])
    ).rows;
    res.json({
      plans: rows.map((r: Record<string, unknown>) => ({
        ...r,
        fee: Number(r.fee) || 0,
        discount_percent: Number(r.discount_percent) || 0,
        use_member_prices: !!r.use_member_prices,
        active: !!r.active,
      })),
    });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/membership-plans', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    if (!requireAdminRole(req, res)) return;
    const name = String(req.body?.name || '').trim();
    const period = String(req.body?.period || 'monthly') === 'yearly' ? 'yearly' : 'monthly';
    const fee = Number(req.body?.fee);
    const discountPercent = Number(req.body?.discountPercent ?? req.body?.discount_percent ?? 0);
    const useMemberPrices = !!req.body?.useMemberPrices || !!req.body?.use_member_prices;
    const active = req.body?.active !== false;
    if (!name) return res.status(400).json({ error: 'Plan name is required' });
    if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ error: 'Valid fee is required' });
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      return res.status(400).json({ error: 'discount_percent must be 0–100' });
    }
    const id = uid('hmp');
    await pool.query(
      `INSERT INTO hosp_membership_plans
         (id, tenant_id, name, period, fee, discount_percent, use_member_prices, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [id, tenantId, name, period, fee, discountPercent, useMemberPrices, active],
    );
    const row = (await pool.query(`SELECT * FROM hosp_membership_plans WHERE id = $1`, [id])).rows[0];
    res.status(201).json({ plan: row });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique') || msg.includes('hosp_membership_plans')) {
      return res.status(400).json({ error: 'A plan with this name already exists' });
    }
    handleApiError(req, res, e);
  }
});

router.put('/api/hospitality/membership-plans/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    if (!requireAdminRole(req, res)) return;
    const name = String(req.body?.name || '').trim();
    const period = String(req.body?.period || 'monthly') === 'yearly' ? 'yearly' : 'monthly';
    const fee = Number(req.body?.fee);
    const discountPercent = Number(req.body?.discountPercent ?? req.body?.discount_percent ?? 0);
    const useMemberPrices = !!req.body?.useMemberPrices || !!req.body?.use_member_prices;
    const active = req.body?.active !== false;
    if (!name) return res.status(400).json({ error: 'Plan name is required' });
    if (!Number.isFinite(fee) || fee < 0) return res.status(400).json({ error: 'Valid fee is required' });
    if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
      return res.status(400).json({ error: 'discount_percent must be 0–100' });
    }
    const result = await pool.query(
      `UPDATE hosp_membership_plans
       SET name = $1, period = $2, fee = $3, discount_percent = $4, use_member_prices = $5, active = $6
       WHERE id = $7 AND tenant_id = $8`,
      [name, period, fee, discountPercent, useMemberPrices, active, req.params.id, tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Plan not found' });
    const row = (await pool.query(`SELECT * FROM hosp_membership_plans WHERE id = $1`, [req.params.id])).rows[0];
    res.json({ plan: row });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.delete('/api/hospitality/membership-plans/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    if (!requireAdminRole(req, res)) return;
    const inUse = (
      await pool.query(`SELECT id FROM hosp_members WHERE plan_id = $1 AND tenant_id = $2 LIMIT 1`, [
        req.params.id,
        tenantId,
      ])
    ).rows[0];
    if (inUse) return res.status(400).json({ error: 'Plan has members — reassign or cancel them first' });
    const result = await pool.query(`DELETE FROM hosp_membership_plans WHERE id = $1 AND tenant_id = $2`, [
      req.params.id,
      tenantId,
    ]);
    if (!result.rowCount) return res.status(404).json({ error: 'Plan not found' });
    res.json({ ok: true });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/membership-plans/batch', blockVendors, async (req: AuthRequest, res) => {
  const tenantId = await gate(req, res);
  if (!tenantId) return;
  if (!requireAdminRole(req, res)) return;
  const { items } = req.body as { items: Record<string, unknown>[] };
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'No items to import' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    let count = 0;
    for (const r of items) {
      const name = String(r.name || '').trim();
      const period = String(r.period || 'monthly') === 'yearly' ? 'yearly' : 'monthly';
      const fee = Number(r.fee);
      const discountPercent = Number(r.discountPercent ?? r.discount_percent ?? 0);
      const useMemberPrices = (() => {
        const v = r.useMemberPrices ?? r.use_member_prices;
        if (v === undefined || v === '') return false;
        const s = String(v).trim().toLowerCase();
        return s === 'y' || s === 'yes' || s === 'true' || s === '1';
      })();
      const active = (() => {
        const v = r.active;
        if (v === undefined || v === '') return true;
        const s = String(v).trim().toLowerCase();
        return s === 'y' || s === 'yes' || s === 'true' || s === '1';
      })();
      if (!name) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Row ${count + 1}: Plan name is required — nothing imported` });
      }
      if (!Number.isFinite(fee) || fee < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Row ${count + 1}: Valid fee is required — nothing imported` });
      }
      if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Row ${count + 1}: discountPercent must be 0–100 — nothing imported` });
      }
      try {
        await client.query(
          `INSERT INTO hosp_membership_plans
             (id, tenant_id, name, period, fee, discount_percent, use_member_prices, active)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [uid('hmp'), tenantId, name, period, fee, discountPercent, useMemberPrices, active],
        );
      } catch (e) {
        await client.query('ROLLBACK');
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('unique') || msg.includes('hosp_membership_plans')) {
          return res.status(400).json({ error: `Plan "${name}" already exists — nothing imported` });
        }
        throw e;
      }
      count++;
    }
    await client.query('COMMIT');
    res.status(201).json({ success: count, errors: [] });
  } catch (e) {
    await client.query('ROLLBACK');
    handleApiError(req, res, e, 'Plan import failed', { publicMessage: 'Import failed — no plans were added' });
  } finally {
    client.release();
  }
});

// ── Members ─────────────────────────────────────────────────────────────────

/** Order-time phone lookup with explicit validity (valid / expired / not found). */
router.get('/api/hospitality/members/lookup', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const phone = String(req.query.phone || '').trim();
    if (!phone) {
      return res.json({ found: false, valid: false, reason: 'No mobile entered', member: null });
    }
    const row = (
      await pool.query(
        `SELECT m.*, p.name AS plan_name, p.period, p.fee, p.discount_percent, p.use_member_prices, p.active AS plan_active
         FROM hosp_members m
         JOIN hosp_membership_plans p ON p.id = m.plan_id
         WHERE m.tenant_id = $1 AND m.phone = $2
         LIMIT 1`,
        [tenantId, phone],
      )
    ).rows[0] as Record<string, unknown> | undefined;
    if (!row) {
      return res.json({ found: false, valid: false, reason: 'No membership', member: null });
    }
    const member = mapMember(row);
    res.json({
      found: true,
      valid: !!member.valid,
      reason: member.reason ?? null,
      member,
    });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.get('/api/hospitality/members', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    const phone = String(req.query.phone || '').trim();
    const q = String(req.query.q || '').trim();
    let rows: Record<string, unknown>[];
    if (phone) {
      rows = (
        await pool.query(
          `SELECT m.*, p.name AS plan_name, p.period, p.fee, p.discount_percent, p.use_member_prices, p.active AS plan_active
           FROM hosp_members m
           JOIN hosp_membership_plans p ON p.id = m.plan_id
           WHERE m.tenant_id = $1 AND m.phone = $2`,
          [tenantId, phone],
        )
      ).rows;
    } else if (q) {
      rows = (
        await pool.query(
          `SELECT m.*, p.name AS plan_name, p.period, p.fee, p.discount_percent, p.use_member_prices, p.active AS plan_active
           FROM hosp_members m
           JOIN hosp_membership_plans p ON p.id = m.plan_id
           WHERE m.tenant_id = $1 AND (m.phone ILIKE $2 OR m.name ILIKE $2)
           ORDER BY m.name
           LIMIT 30`,
          [tenantId, `%${q}%`],
        )
      ).rows;
    } else {
      rows = (
        await pool.query(
          `SELECT m.*, p.name AS plan_name, p.period, p.fee, p.discount_percent, p.use_member_prices, p.active AS plan_active
           FROM hosp_members m
           JOIN hosp_membership_plans p ON p.id = m.plan_id
           WHERE m.tenant_id = $1
           ORDER BY m.name`,
          [tenantId],
        )
      ).rows;
    }
    res.json({ members: rows.map(mapMember) });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.post('/api/hospitality/members', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    if (!requireAdminRole(req, res)) return;
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const planId = String(req.body?.planId || req.body?.plan_id || '').trim();
    if (!name) return res.status(400).json({ error: 'Name is required' });
    if (!phone) return res.status(400).json({ error: 'Phone is required' });
    if (!planId) return res.status(400).json({ error: 'Plan is required' });
    const plan = (
      await pool.query(`SELECT * FROM hosp_membership_plans WHERE id = $1 AND tenant_id = $2`, [planId, tenantId])
    ).rows[0] as { period: 'monthly' | 'yearly' } | undefined;
    if (!plan) return res.status(400).json({ error: 'Plan not found' });
    const from = new Date();
    const until = addPeriod(from, plan.period);
    const id = uid('hm');
    try {
      await pool.query(
        `INSERT INTO hosp_members (id, tenant_id, name, phone, plan_id, status, valid_from, valid_until)
         VALUES ($1,$2,$3,$4,$5,'active',$6,$7)`,
        [id, tenantId, name, phone, planId, toDateOnly(from), toDateOnly(until)],
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('unique') || msg.includes('hosp_members')) {
        return res.status(400).json({ error: 'A member with this phone already exists' });
      }
      throw e;
    }
    const row = (
      await pool.query(
        `SELECT m.*, p.name AS plan_name, p.period, p.fee, p.discount_percent, p.use_member_prices, p.active AS plan_active
         FROM hosp_members m JOIN hosp_membership_plans p ON p.id = m.plan_id WHERE m.id = $1`,
        [id],
      )
    ).rows[0];
    res.status(201).json({ member: mapMember(row) });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

router.put('/api/hospitality/members/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    if (!requireAdminRole(req, res)) return;
    const name = String(req.body?.name || '').trim();
    const phone = String(req.body?.phone || '').trim();
    const planId = String(req.body?.planId || req.body?.plan_id || '').trim();
    const status = String(req.body?.status || 'active');
    if (!name || !phone || !planId) return res.status(400).json({ error: 'Name, phone, and plan are required' });
    if (!['active', 'expired', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    const plan = (
      await pool.query(`SELECT id FROM hosp_membership_plans WHERE id = $1 AND tenant_id = $2`, [planId, tenantId])
    ).rows[0];
    if (!plan) return res.status(400).json({ error: 'Plan not found' });
    const result = await pool.query(
      `UPDATE hosp_members SET name = $1, phone = $2, plan_id = $3, status = $4
       WHERE id = $5 AND tenant_id = $6`,
      [name, phone, planId, status, req.params.id, tenantId],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Member not found' });
    const row = (
      await pool.query(
        `SELECT m.*, p.name AS plan_name, p.period, p.fee, p.discount_percent, p.use_member_prices, p.active AS plan_active
         FROM hosp_members m JOIN hosp_membership_plans p ON p.id = m.plan_id WHERE m.id = $1`,
        [req.params.id],
      )
    ).rows[0];
    res.json({ member: mapMember(row) });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('unique')) return res.status(400).json({ error: 'A member with this phone already exists' });
    handleApiError(req, res, e);
  }
});

/** Renew: extend valid_until by one plan period from max(today, current valid_until); set status active. */
router.post('/api/hospitality/members/:id/renew', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = await gate(req, res);
    if (!tenantId) return;
    if (!requireAdminRole(req, res)) return;
    const row = (
      await pool.query(
        `SELECT m.*, p.period FROM hosp_members m
         JOIN hosp_membership_plans p ON p.id = m.plan_id
         WHERE m.id = $1 AND m.tenant_id = $2`,
        [req.params.id, tenantId],
      )
    ).rows[0] as { valid_until: string | Date; period: 'monthly' | 'yearly' } | undefined;
    if (!row) return res.status(404).json({ error: 'Member not found' });
    const today = new Date();
    const currentEnd = new Date(row.valid_until);
    const base = currentEnd.getTime() > today.getTime() ? currentEnd : today;
    const until = addPeriod(base, row.period);
    await pool.query(`UPDATE hosp_members SET status = 'active', valid_until = $1 WHERE id = $2 AND tenant_id = $3`, [
      toDateOnly(until),
      req.params.id,
      tenantId,
    ]);
    const updated = (
      await pool.query(
        `SELECT m.*, p.name AS plan_name, p.period, p.fee, p.discount_percent, p.use_member_prices, p.active AS plan_active
         FROM hosp_members m JOIN hosp_membership_plans p ON p.id = m.plan_id WHERE m.id = $1`,
        [req.params.id],
      )
    ).rows[0];
    res.json({ member: mapMember(updated) });
  } catch (e) {
    handleApiError(req, res, e);
  }
});

export default router;
