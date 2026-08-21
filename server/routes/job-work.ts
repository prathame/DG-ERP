import { Router } from 'express';
import { blockVendors, AuthRequest } from '../middleware/auth';
import { pool, setTenantContext } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';

const router = Router();

const VALID_STATUSES = ['received', 'in_process', 'completed', 'delivered', 'invoiced'] as const;
type JobStatus = (typeof VALID_STATUSES)[number];

function mapJob(r: Record<string, unknown>) {
  return {
    id: r.id,
    jobNumber: r.job_number,
    clientName: r.client_name,
    clientPhone: r.client_phone ?? null,
    clientId: r.client_id ?? null,
    description: r.description,
    material: r.material ?? null,
    materialQty: r.material_qty !== null ? Number(r.material_qty) : null,
    materialUnit: r.material_unit ?? 'pcs',
    status: r.status,
    receivedDate: r.received_date,
    promisedDate: r.promised_date ?? null,
    completedDate: r.completed_date ?? null,
    deliveredDate: r.delivered_date ?? null,
    estimatedAmount: r.estimated_amount !== null ? Number(r.estimated_amount) : null,
    finalAmount: r.final_amount !== null ? Number(r.final_amount) : null,
    gstRate: Number(r.gst_rate ?? 18),
    invoiceId: r.invoice_id ?? null,
    notes: r.notes ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/** Allocate next JOB-YYYY-NNN for the tenant (advisory-locked). */
async function allocateJobNumber(client: { query: typeof pool.query }, tenantId: string): Promise<string> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':job_order_seq'))`, [tenantId]);
  const year = new Date().getFullYear();
  const prefix = `JOB-${year}-`;
  const { rows } = await client.query(
    `SELECT job_number FROM job_orders
     WHERE tenant_id = $1 AND job_number LIKE $2
     ORDER BY job_number DESC LIMIT 1`,
    [tenantId, `${prefix}%`],
  );
  const last = String(rows[0]?.job_number || '');
  const m = last.match(/-(\d+)$/);
  const next = (m ? Number(m[1]) : 0) + 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

// Summary must come before /:id to avoid route capture
router.get('/api/job-work/summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { rows } = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'received')  AS received,
         COUNT(*) FILTER (WHERE status = 'in_process') AS in_process,
         COUNT(*) FILTER (WHERE status = 'completed')  AS completed,
         COUNT(*) FILTER (WHERE status = 'delivered')  AS delivered,
         COUNT(*) FILTER (WHERE status = 'invoiced')   AS invoiced,
         COUNT(*) FILTER (
           WHERE status NOT IN ('invoiced','delivered','completed')
             AND promised_date < CURRENT_DATE
         ) AS overdue_count,
         COALESCE(SUM(final_amount) FILTER (WHERE status = 'invoiced'), 0) AS total_revenue
       FROM job_orders WHERE tenant_id = $1`,
      [tenantId],
    );
    const r = rows[0] as Record<string, unknown>;
    res.json({
      received: Number(r.received),
      inProcess: Number(r.in_process),
      completed: Number(r.completed),
      delivered: Number(r.delivered),
      invoiced: Number(r.invoiced),
      overdueCount: Number(r.overdue_count),
      totalRevenue: Number(r.total_revenue),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/job-work', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { status, clientName, from, to, page = '1', limit = '50' } = req.query as Record<string, string>;
    const params: unknown[] = [tenantId];
    let idx = 2;
    let where = 'WHERE tenant_id = $1';

    if (status && VALID_STATUSES.includes(status as JobStatus)) {
      where += ` AND status = $${idx++}`;
      params.push(status);
    }
    if (clientName) {
      where += ` AND client_name ILIKE $${idx++}`;
      params.push(`%${clientName}%`);
    }
    if (from) {
      where += ` AND received_date >= $${idx++}`;
      params.push(from);
    }
    if (to) {
      where += ` AND received_date <= $${idx++}`;
      params.push(to);
    }

    const pageNum = Math.max(1, Number(page));
    const limitNum = Math.min(200, Math.max(1, Number(limit)));
    const offset = (pageNum - 1) * limitNum;

    const total = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM job_orders ${where}`, params)).rows[0].c);
    const { rows } = await pool.query(
      `SELECT * FROM job_orders ${where} ORDER BY received_date DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limitNum, offset],
    );

    res.setHeader('X-Total-Count', String(total));
    res.json(rows.map(r => mapJob(r as Record<string, unknown>)));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/job-work', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const {
      clientName,
      clientPhone,
      clientId,
      description,
      material,
      materialQty,
      materialUnit,
      receivedDate,
      promisedDate,
      estimatedAmount,
      gstRate,
      notes,
    } = req.body as Record<string, unknown>;

    if (!String(clientName || '').trim()) return res.status(400).json({ error: 'Client name is required' });
    if (!String(description || '').trim()) return res.status(400).json({ error: 'Description is required' });

    const id = uid('JO');
    const client = await pool.connect();
    let jobNumber: string;
    try {
      await client.query('BEGIN');
      await setTenantContext(client, tenantId);
      jobNumber = await allocateJobNumber(client, tenantId);
      await client.query(
        `INSERT INTO job_orders
           (id, tenant_id, job_number, client_name, client_phone, client_id, description,
            material, material_qty, material_unit, received_date, promised_date,
            estimated_amount, gst_rate, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
        [
          id,
          tenantId,
          jobNumber,
          String(clientName).trim(),
          clientPhone ? String(clientPhone).trim() : null,
          clientId ? String(clientId) : null,
          String(description).trim(),
          material ? String(material).trim() : null,
          materialQty !== undefined && materialQty !== null ? Number(materialQty) : 1,
          materialUnit ? String(materialUnit) : 'pcs',
          receivedDate ? String(receivedDate) : new Date().toISOString().slice(0, 10),
          promisedDate ? String(promisedDate) : null,
          estimatedAmount !== undefined && estimatedAmount !== null ? Number(estimatedAmount) : null,
          gstRate !== undefined && gstRate !== null ? Number(gstRate) : 18,
          notes ? String(notes) : null,
        ],
      );
      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }

    await logAudit(pool, tenantId, 'Job Order Created', 'job_order', id, `${jobNumber} — ${String(clientName).trim()}`);
    const { rows } = await pool.query('SELECT * FROM job_orders WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    res.status(201).json(mapJob(rows[0] as Record<string, unknown>));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/job-work/:id', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query('SELECT * FROM job_orders WHERE id = $1 AND tenant_id = $2', [
      req.params.id,
      tenantId,
    ]);
    if (!rows[0]) return res.status(404).json({ error: 'Job order not found' });
    res.json(mapJob(rows[0] as Record<string, unknown>));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/job-work/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id } = req.params;

    const {
      clientName,
      clientPhone,
      description,
      material,
      materialQty,
      materialUnit,
      receivedDate,
      promisedDate,
      estimatedAmount,
      finalAmount,
      gstRate,
      notes,
    } = req.body as Record<string, unknown>;

    const { rowCount } = await pool.query(
      `UPDATE job_orders SET
         client_name = COALESCE($3, client_name),
         client_phone = $4,
         description = COALESCE($5, description),
         material = $6,
         material_qty = COALESCE($7, material_qty),
         material_unit = COALESCE($8, material_unit),
         received_date = COALESCE($9, received_date),
         promised_date = $10,
         estimated_amount = $11,
         final_amount = $12,
         gst_rate = COALESCE($13, gst_rate),
         notes = $14,
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $2`,
      [
        id,
        tenantId,
        clientName ? String(clientName).trim() : null,
        clientPhone ? String(clientPhone).trim() : null,
        description ? String(description).trim() : null,
        material ? String(material).trim() : null,
        materialQty !== undefined && materialQty !== null ? Number(materialQty) : null,
        materialUnit ? String(materialUnit) : null,
        receivedDate ? String(receivedDate) : null,
        promisedDate ? String(promisedDate) : null,
        estimatedAmount !== undefined && estimatedAmount !== null ? Number(estimatedAmount) : null,
        finalAmount !== undefined && finalAmount !== null ? Number(finalAmount) : null,
        gstRate !== undefined && gstRate !== null ? Number(gstRate) : null,
        notes ? String(notes) : null,
      ],
    );
    if (!rowCount) return res.status(404).json({ error: 'Job order not found' });
    const { rows } = await pool.query('SELECT * FROM job_orders WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    res.json(mapJob(rows[0] as Record<string, unknown>));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.patch('/api/job-work/:id/status', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id } = req.params;
    const { status } = req.body as { status: string };

    if (!VALID_STATUSES.includes(status as JobStatus)) {
      return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
    }

    // Set timestamp columns based on status transition
    let extraSet = '';
    if (status === 'completed') extraSet = ', completed_date = COALESCE(completed_date, CURRENT_DATE)';
    if (status === 'delivered') extraSet = ', delivered_date = COALESCE(delivered_date, CURRENT_DATE)';

    const { rowCount } = await pool.query(
      `UPDATE job_orders SET status = $3, updated_at = NOW() ${extraSet}
       WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId, status],
    );
    if (!rowCount) return res.status(404).json({ error: 'Job order not found' });

    await logAudit(pool, tenantId, 'Job Status Updated', 'job_order', id, status);
    const { rows } = await pool.query('SELECT * FROM job_orders WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    res.json(mapJob(rows[0] as Record<string, unknown>));
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/job-work/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id } = req.params;

    const existing = (
      await pool.query('SELECT status, job_number FROM job_orders WHERE id = $1 AND tenant_id = $2', [id, tenantId])
    ).rows[0] as { status: string; job_number: string } | undefined;
    if (!existing) return res.status(404).json({ error: 'Job order not found' });
    if (existing.status !== 'received') {
      return res.status(400).json({ error: 'Only jobs in "received" status can be deleted' });
    }

    await pool.query('DELETE FROM job_orders WHERE id = $1 AND tenant_id = $2', [id, tenantId]);
    await logAudit(pool, tenantId, 'Job Order Deleted', 'job_order', id, existing.job_number);
    res.json({ ok: true });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/job-work/:id/invoice', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id } = req.params;
    const { finalAmount } = req.body as { finalAmount?: number };

    const jobRow = (await pool.query('SELECT * FROM job_orders WHERE id = $1 AND tenant_id = $2', [id, tenantId]))
      .rows[0] as Record<string, unknown> | undefined;
    if (!jobRow) return res.status(404).json({ error: 'Job order not found' });
    if (jobRow.invoice_id) return res.status(400).json({ error: 'Invoice already generated for this job' });
    if (jobRow.status === 'received' || jobRow.status === 'in_process') {
      return res.status(400).json({ error: 'Cannot invoice a job that is not yet completed or delivered' });
    }

    const amount =
      finalAmount !== undefined && finalAmount !== null
        ? Number(finalAmount)
        : jobRow.final_amount !== null
          ? Number(jobRow.final_amount)
          : Number(jobRow.estimated_amount ?? 0);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'Final amount is required to generate invoice' });

    const gstRate = Number(jobRow.gst_rate ?? 18);
    // GST is on top of base amount
    const subtotal = amount;
    const taxTotal = Math.round(subtotal * gstRate) / 100;
    const grandTotal = subtotal + taxTotal;
    const taxCgst = Math.round((taxTotal / 2) * 100) / 100;
    const taxSgst = taxCgst;
    const taxIgst = 0;

    const items = JSON.stringify([
      {
        description: String(jobRow.description),
        qty: 1,
        rate: amount,
        gstPercent: gstRate,
      },
    ]);

    const invoiceId = uid('INV');
    const client = await pool.connect();
    let invNumber: string;
    try {
      await client.query('BEGIN');
      await setTenantContext(client, tenantId);

      // Allocate invoice number
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':standalone_invoice_seq'))`, [tenantId]);
      const now = new Date();
      const fy =
        now.getMonth() >= 3
          ? `${now.getFullYear()}-${String(now.getFullYear() + 1).slice(2)}`
          : `${now.getFullYear() - 1}-${String(now.getFullYear()).slice(2)}`;
      const invPrefix = `INV/${fy}/`;
      const { rows: invRows } = await client.query(
        `SELECT invoice_number FROM standalone_invoices
         WHERE tenant_id = $1 AND invoice_number LIKE $2
         ORDER BY invoice_number DESC LIMIT 1`,
        [tenantId, `${invPrefix}%`],
      );
      const lastInv = String(invRows[0]?.invoice_number || '');
      const mInv = lastInv.match(/\/(\d+)$/);
      invNumber = `${invPrefix}${String((mInv ? Number(mInv[1]) : 0) + 1).padStart(4, '0')}`;

      await client.query(
        `INSERT INTO standalone_invoices
           (id, tenant_id, invoice_number, customer_name, customer_phone,
            items, subtotal, tax_total, grand_total, status, invoice_date,
            tax_cgst, tax_sgst, tax_igst, is_interstate, gst_enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'sent',CURRENT_DATE,$10,$11,$12,false,true)`,
        [
          invoiceId,
          tenantId,
          invNumber,
          String(jobRow.client_name),
          jobRow.client_phone ? String(jobRow.client_phone) : null,
          items,
          subtotal,
          taxTotal,
          grandTotal,
          taxCgst,
          taxSgst,
          taxIgst,
        ],
      );

      await client.query(
        `UPDATE job_orders SET invoice_id = $3, status = 'invoiced', final_amount = $4, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId, invoiceId, amount],
      );
      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }

    await logAudit(
      pool,
      tenantId,
      'Job Invoice Generated',
      'job_order',
      id,
      `${String(jobRow.job_number)} → ${invNumber} ₹${grandTotal}`,
    );

    const { rows: invOut } = await pool.query('SELECT * FROM standalone_invoices WHERE id = $1 AND tenant_id = $2', [
      invoiceId,
      tenantId,
    ]);
    const inv = invOut[0] as Record<string, unknown>;
    res.status(201).json({
      invoiceId,
      invoiceNumber: inv.invoice_number,
      grandTotal,
      customerName: inv.customer_name,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
