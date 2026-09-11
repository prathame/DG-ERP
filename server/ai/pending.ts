import { pool } from '../pg-db';
import { logger } from '../utils/logger';
import { logAudit } from '../utils/helpers';
import { asQty, asSearchQuery, assertModuleAccess } from './authz';
import type { InvoicePreview, PendingInvoicePayload, ToolContext } from './types';
import { createStandaloneInvoice } from '../services/standaloneInvoice';

export type PendingRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  action_type: string;
  payload: PendingInvoicePayload;
  preview: InvoicePreview | null;
  status: string;
  idempotency_key: string;
  result_invoice_id: string | null;
  expires_at: Date;
};

export async function insertPendingAction(args: {
  id: string;
  tenantId: string;
  userId: string;
  actionType: string;
  payload: PendingInvoicePayload;
  preview: InvoicePreview;
  idempotencyKey: string;
  expiresAt: Date;
}): Promise<void> {
  await pool.query(
    `INSERT INTO pending_ai_actions
      (id, tenant_id, user_id, action_type, payload, preview, status, idempotency_key, expires_at)
     VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,$8)`,
    [
      args.id,
      args.tenantId,
      args.userId,
      args.actionType,
      JSON.stringify(args.payload),
      JSON.stringify(args.preview),
      args.idempotencyKey,
      args.expiresAt.toISOString(),
    ],
  );
}

function parsePayload(raw: unknown): PendingInvoicePayload {
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as PendingInvoicePayload;
    } catch {
      throw new Error('Invalid pending payload');
    }
  }
  return raw as PendingInvoicePayload;
}

export type ConfirmResult =
  { ok: true; invoice: Record<string, unknown>; created: boolean } | { ok: false; status: number; error: string };

export async function confirmPendingInvoice(ctx: ToolContext, actionId: string): Promise<ConfirmResult> {
  const denied = assertModuleAccess(ctx, 'sales', 'full');
  if (denied) return { ok: false, status: 403, error: denied };

  const id = String(actionId || '')
    .trim()
    .slice(0, 64);
  if (!id) return { ok: false, status: 400, error: 'Action id required' };

  const { mapStandaloneInvoice } = await import('../services/standaloneInvoice');

  async function loadInvoice(invoiceId: string) {
    const loaded = (
      await pool.query(
        `SELECT si.*, COALESCE(SUM(ip.amount), 0) AS paid_amount
         FROM standalone_invoices si
         LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $2
         WHERE si.id = $1 AND si.tenant_id = $2
         GROUP BY si.id`,
        [invoiceId, ctx.tenantId],
      )
    ).rows[0];
    return loaded ? mapStandaloneInvoice(loaded as Record<string, unknown>) : null;
  }

  const client = await pool.connect();
  let row: PendingRow | undefined;
  try {
    await client.query('BEGIN');
    const claimed = await client.query(
      `UPDATE pending_ai_actions
       SET status = 'executing'
       WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'pending' AND expires_at > NOW()
       RETURNING *`,
      [id, ctx.tenantId, ctx.userId],
    );
    row = claimed.rows[0] as PendingRow | undefined;
    if (!row) {
      const existing = (
        await client.query(`SELECT * FROM pending_ai_actions WHERE id = $1 AND tenant_id = $2`, [id, ctx.tenantId])
      ).rows[0] as PendingRow | undefined;
      await client.query('COMMIT');
      if (!existing) return { ok: false, status: 404, error: 'Pending action not found' };
      if (existing.user_id !== ctx.userId) return { ok: false, status: 403, error: 'This confirmation is not yours' };
      if (existing.status === 'completed' && existing.result_invoice_id) {
        const invoice = await loadInvoice(existing.result_invoice_id);
        if (!invoice) return { ok: false, status: 409, error: 'Invoice already recorded but could not be loaded' };
        return { ok: true, invoice, created: false };
      }
      if (existing.status === 'cancelled') return { ok: false, status: 409, error: 'This action was cancelled' };
      if (new Date(existing.expires_at).getTime() <= Date.now() || existing.status === 'expired') {
        return { ok: false, status: 410, error: 'This confirmation expired. Prepare the invoice again.' };
      }
      if (existing.status === 'executing') {
        for (let i = 0; i < 8; i++) {
          await new Promise(r => setTimeout(r, 50));
          const again = (
            await pool.query(`SELECT * FROM pending_ai_actions WHERE id = $1 AND tenant_id = $2`, [id, ctx.tenantId])
          ).rows[0] as PendingRow | undefined;
          if (again?.status === 'completed' && again.result_invoice_id) {
            const invoice = await loadInvoice(again.result_invoice_id);
            if (invoice) return { ok: true, invoice, created: false };
          }
        }
        return { ok: false, status: 409, error: 'This invoice is already being created' };
      }
      return { ok: false, status: 409, error: 'This action cannot be confirmed' };
    }
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

  const payload = parsePayload(row.payload);
  if (payload.partyType !== 'vendor' && payload.partyType !== 'customer') {
    await pool.query(`UPDATE pending_ai_actions SET status = 'pending' WHERE id = $1 AND tenant_id = $2`, [
      id,
      ctx.tenantId,
    ]);
    return { ok: false, status: 400, error: 'Invalid party on pending action' };
  }

  const partyTable = payload.partyType === 'vendor' ? 'vendors' : 'customers';
  const gstCol = payload.partyType === 'vendor' ? 'gst_number' : 'NULL';
  const party = (
    await pool.query(
      `SELECT id, name, phone, address, ${gstCol} AS gstin FROM ${partyTable} WHERE id = $1 AND tenant_id = $2`,
      [payload.partyId, ctx.tenantId],
    )
  ).rows[0] as
    { id: string; name: string; phone: string | null; address: string | null; gstin: string | null } | undefined;
  if (!party) {
    await pool.query(`UPDATE pending_ai_actions SET status = 'pending' WHERE id = $1 AND tenant_id = $2`, [
      id,
      ctx.tenantId,
    ]);
    return { ok: false, status: 400, error: 'Customer no longer exists' };
  }

  const confirmItems: Array<{ productId: string; qty: number; unit?: string }> = [];
  for (const item of payload.items || []) {
    const qty = asQty(item.qty);
    if (qty == null) {
      await pool.query(`UPDATE pending_ai_actions SET status = 'pending' WHERE id = $1 AND tenant_id = $2`, [
        id,
        ctx.tenantId,
      ]);
      return { ok: false, status: 400, error: 'Quantity is missing or invalid' };
    }
    const p = (
      await pool.query('SELECT id FROM products WHERE id = $1 AND tenant_id = $2', [item.productId, ctx.tenantId])
    ).rows[0];
    if (!p) {
      await pool.query(`UPDATE pending_ai_actions SET status = 'pending' WHERE id = $1 AND tenant_id = $2`, [
        id,
        ctx.tenantId,
      ]);
      return { ok: false, status: 400, error: 'A product on this invoice no longer exists' };
    }
    confirmItems.push({
      productId: item.productId,
      qty,
      unit: asSearchQuery(item.unit, 24) || undefined,
    });
  }
  if (!confirmItems.length) {
    await pool.query(`UPDATE pending_ai_actions SET status = 'pending' WHERE id = $1 AND tenant_id = $2`, [
      id,
      ctx.tenantId,
    ]);
    return { ok: false, status: 400, error: 'Quantity and items are missing' };
  }

  const created = await createStandaloneInvoice(ctx.tenantId, {
    customerName: party.name,
    customerGstin: party.gstin,
    customerAddress: party.address,
    customerPhone: party.phone,
    partyType: payload.partyType,
    partyId: party.id,
    items: confirmItems,
    status: 'sent',
    idempotencyKey: row.idempotency_key,
    requireExistingParty: true,
    authoritativeLines: true,
    auditUserId: ctx.userId,
    auditUserName: ctx.userName,
  });

  if (created.ok === false) {
    await pool.query(
      `UPDATE pending_ai_actions SET status = 'pending' WHERE id = $1 AND tenant_id = $2 AND status = 'executing'`,
      [id, ctx.tenantId],
    );
    return created;
  }

  await pool.query(
    `UPDATE pending_ai_actions
     SET status = 'completed', result_invoice_id = $3, confirmed_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [id, ctx.tenantId, created.invoice.id],
  );
  await logAudit(
    pool,
    ctx.tenantId,
    'AI Invoice Confirmed',
    'invoice',
    created.invoice.id,
    `${created.invoice.invoiceNumber} — ${created.invoice.customerName} — ₹${created.invoice.grandTotal}`,
    ctx.userId,
    ctx.userName,
  );
  logger.info('AI invoice confirmed', {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    pendingActionId: id,
    invoiceId: created.invoice.id,
    created: created.created,
    correlationId: ctx.correlationId,
  });
  return { ok: true, invoice: created.invoice, created: created.created };
}

export async function cancelPendingInvoice(ctx: ToolContext, actionId: string): Promise<ConfirmResult> {
  const id = String(actionId || '')
    .trim()
    .slice(0, 64);
  const updated = await pool.query(
    `UPDATE pending_ai_actions
     SET status = 'cancelled'
     WHERE id = $1 AND tenant_id = $2 AND user_id = $3 AND status = 'pending'
     RETURNING id`,
    [id, ctx.tenantId, ctx.userId],
  );
  if (!updated.rows[0]) {
    const existing = (
      await pool.query(`SELECT status, user_id FROM pending_ai_actions WHERE id = $1 AND tenant_id = $2`, [
        id,
        ctx.tenantId,
      ])
    ).rows[0] as { status: string; user_id: string } | undefined;
    if (!existing) return { ok: false, status: 404, error: 'Pending action not found' };
    if (existing.user_id !== ctx.userId) return { ok: false, status: 403, error: 'This confirmation is not yours' };
    if (existing.status === 'cancelled') return { ok: false, status: 409, error: 'Already cancelled' };
    if (existing.status === 'completed') return { ok: false, status: 409, error: 'Already created' };
    return { ok: false, status: 409, error: 'This action cannot be cancelled' };
  }
  await logAudit(pool, ctx.tenantId, 'AI Invoice Cancelled', 'ai_action', id, 'cancelled', ctx.userId, ctx.userName);
  return { ok: true, invoice: { cancelled: true }, created: false };
}
