import { Router } from 'express';
import { pool } from '../pg-db';
import { authMiddleware, blockVendors, AuthRequest } from '../middleware/auth';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import {
  defaultStarterTemplate,
  normalizeLabelElement,
  validateLabelTemplateInput,
  type BarcodeLabelTemplate,
  type LabelElement,
} from '../../shared/barcodeLabelTemplate';

const router = Router();

function mapRow(row: Record<string, unknown>): BarcodeLabelTemplate {
  const elementsRaw = row.elements;
  const elements: LabelElement[] = Array.isArray(elementsRaw)
    ? (elementsRaw.map((el, i) => normalizeLabelElement(el, i)).filter(Boolean) as LabelElement[])
    : [];
  return {
    id: String(row.id),
    tenantId: String(row.tenant_id),
    name: String(row.name),
    description: (row.description as string) || null,
    widthMm: Number(row.width_mm),
    heightMm: Number(row.height_mm),
    orientation: row.orientation === 'portrait' ? 'portrait' : 'landscape',
    status: (row.status as BarcodeLabelTemplate['status']) || 'draft',
    isDefault: row.is_default === true,
    version: Number(row.version) || 1,
    elements,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
    createdBy: (row.created_by as string) || null,
    updatedBy: (row.updated_by as string) || null,
  };
}

async function clearOtherDefaults(tenantId: string, exceptId?: string) {
  if (exceptId) {
    await pool.query('UPDATE barcode_label_templates SET is_default = false WHERE tenant_id = $1 AND id <> $2', [
      tenantId,
      exceptId,
    ]);
  } else {
    await pool.query('UPDATE barcode_label_templates SET is_default = false WHERE tenant_id = $1', [tenantId]);
  }
}

router.get('/api/barcode-label-templates', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
    const includeArchived = req.query.includeArchived === 'true';
    const { rows } = await pool.query(
      `SELECT id, tenant_id, name, description, width_mm, height_mm, orientation, status, is_default, version,
              jsonb_array_length(COALESCE(elements, '[]'::jsonb)) AS element_count,
              created_at, updated_at, created_by, updated_by, elements
       FROM barcode_label_templates
       WHERE tenant_id = $1 ${includeArchived ? '' : "AND status <> 'archived'"}
       ORDER BY is_default DESC, updated_at DESC`,
      [tenantId],
    );
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        ...mapRow(r),
        elementCount: Number(r.element_count) || 0,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/barcode-label-templates/default', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query(
      `SELECT * FROM barcode_label_templates WHERE tenant_id = $1 AND is_default = true AND status = 'active' LIMIT 1`,
      [tenantId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'No default template' });
    res.json(mapRow(rows[0]));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/barcode-label-templates/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query('SELECT * FROM barcode_label_templates WHERE id = $1 AND tenant_id = $2', [
      req.params.id,
      tenantId,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Template not found' });
    res.json(mapRow(rows[0]));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/barcode-label-templates', authMiddleware, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
    const role = req.user?.role;
    if (!role || !['Admin', 'Super Admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const body = req.body || {};
    const err = validateLabelTemplateInput(body);
    if (err) return res.status(400).json({ error: err });
    const starter = defaultStarterTemplate(String(body.name).trim());
    const id = uid('BLT');
    const elements = Array.isArray(body.elements)
      ? body.elements.map((el: unknown, i: number) => normalizeLabelElement(el, i)).filter(Boolean)
      : starter.elements;
    const isDefault = body.isDefault === true;
    if (isDefault) await clearOtherDefaults(tenantId);
    await pool.query(
      `INSERT INTO barcode_label_templates
       (id, tenant_id, name, description, width_mm, height_mm, orientation, status, is_default, version, elements, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)`,
      [
        id,
        tenantId,
        String(body.name).trim(),
        body.description ? String(body.description).trim() : null,
        Number(body.widthMm) || starter.widthMm,
        Number(body.heightMm) || starter.heightMm,
        body.orientation === 'portrait' ? 'portrait' : 'landscape',
        body.status === 'active' ? 'active' : 'draft',
        isDefault,
        1,
        JSON.stringify(elements),
        req.user?.userId || null,
      ],
    );
    await logAudit(pool, tenantId, 'Barcode Label Template Created', 'barcode_label_template', id, String(body.name));
    const { rows } = await pool.query('SELECT * FROM barcode_label_templates WHERE id = $1 AND tenant_id = $2', [
      id,
      tenantId,
    ]);
    res.status(201).json(mapRow(rows[0]));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/barcode-label-templates/:id', authMiddleware, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
    const role = req.user?.role;
    if (!role || !['Admin', 'Super Admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const existing = (
      await pool.query('SELECT * FROM barcode_label_templates WHERE id = $1 AND tenant_id = $2', [
        req.params.id,
        tenantId,
      ])
    ).rows[0];
    if (!existing) return res.status(404).json({ error: 'Template not found' });
    const body = req.body || {};
    const err = validateLabelTemplateInput({
      name: body.name ?? existing.name,
      widthMm: body.widthMm ?? existing.width_mm,
      heightMm: body.heightMm ?? existing.height_mm,
      elements: body.elements ?? existing.elements,
    });
    if (err) return res.status(400).json({ error: err });
    const elements = Array.isArray(body.elements)
      ? body.elements.map((el: unknown, i: number) => normalizeLabelElement(el, i)).filter(Boolean)
      : existing.elements;
    const isDefault = body.isDefault === true;
    if (isDefault) await clearOtherDefaults(tenantId, req.params.id);
    const nextVersion = Number(existing.version) + 1;
    await pool.query(
      `UPDATE barcode_label_templates SET
        name = COALESCE($1, name),
        description = $2,
        width_mm = COALESCE($3, width_mm),
        height_mm = COALESCE($4, height_mm),
        orientation = COALESCE($5, orientation),
        status = COALESCE($6, status),
        is_default = COALESCE($7, is_default),
        version = $8,
        elements = $9,
        updated_by = $10,
        updated_at = NOW()
       WHERE id = $11 AND tenant_id = $12`,
      [
        body.name ? String(body.name).trim() : null,
        body.description !== undefined
          ? body.description
            ? String(body.description).trim()
            : null
          : existing.description,
        body.widthMm != null ? Number(body.widthMm) : null,
        body.heightMm != null ? Number(body.heightMm) : null,
        body.orientation === 'portrait' || body.orientation === 'landscape' ? body.orientation : null,
        body.status === 'active' || body.status === 'draft' || body.status === 'archived' ? body.status : null,
        body.isDefault !== undefined ? isDefault : null,
        nextVersion,
        JSON.stringify(elements),
        req.user?.userId || null,
        req.params.id,
        tenantId,
      ],
    );
    await logAudit(
      pool,
      tenantId,
      'Barcode Label Template Updated',
      'barcode_label_template',
      req.params.id,
      String(body.name || existing.name),
    );
    const { rows } = await pool.query('SELECT * FROM barcode_label_templates WHERE id = $1 AND tenant_id = $2', [
      req.params.id,
      tenantId,
    ]);
    res.json(mapRow(rows[0]));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post(
  '/api/barcode-label-templates/:id/duplicate',
  authMiddleware,
  blockVendors,
  async (req: AuthRequest, res) => {
    try {
      const tenantId = req.tenantId;
      if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
      const role = req.user?.role;
      if (!role || !['Admin', 'Super Admin', 'super_admin'].includes(role)) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const { rows } = await pool.query('SELECT * FROM barcode_label_templates WHERE id = $1 AND tenant_id = $2', [
        req.params.id,
        tenantId,
      ]);
      if (!rows[0]) return res.status(404).json({ error: 'Template not found' });
      const src = rows[0];
      const id = uid('BLT');
      const name = `${String(src.name)} (copy)`;
      await pool.query(
        `INSERT INTO barcode_label_templates
       (id, tenant_id, name, description, width_mm, height_mm, orientation, status, is_default, version, elements, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,'draft',false,1,$8,$9,$9)`,
        [
          id,
          tenantId,
          name,
          src.description,
          src.width_mm,
          src.height_mm,
          src.orientation,
          JSON.stringify(src.elements),
          req.user?.userId || null,
        ],
      );
      const created = await pool.query('SELECT * FROM barcode_label_templates WHERE id = $1 AND tenant_id = $2', [
        id,
        tenantId,
      ]);
      res.status(201).json(mapRow(created.rows[0]));
    } catch (err) {
      return handleApiError(req, res, err);
    }
  },
);

router.put('/api/barcode-label-templates/:id/default', authMiddleware, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
    const role = req.user?.role;
    if (!role || !['Admin', 'Super Admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const exists = await pool.query('SELECT id FROM barcode_label_templates WHERE id = $1 AND tenant_id = $2', [
      req.params.id,
      tenantId,
    ]);
    if (!exists.rows[0]) return res.status(404).json({ error: 'Template not found' });
    // Clear other defaults first — unique index allows only one active default per tenant.
    await clearOtherDefaults(tenantId, req.params.id);
    await pool.query(
      `UPDATE barcode_label_templates SET is_default = true, status = 'active', updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    const { rows } = await pool.query('SELECT * FROM barcode_label_templates WHERE id = $1 AND tenant_id = $2', [
      req.params.id,
      tenantId,
    ]);
    res.json(mapRow(rows[0]));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/barcode-label-templates/:id', authMiddleware, blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'Tenant ID required' });
    const role = req.user?.role;
    if (!role || !['Admin', 'Super Admin', 'super_admin'].includes(role)) {
      return res.status(403).json({ error: 'Admin access required' });
    }
    const { rowCount } = await pool.query(
      `UPDATE barcode_label_templates SET status = 'archived', is_default = false, updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, tenantId],
    );
    if (!rowCount) return res.status(404).json({ error: 'Template not found' });
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
