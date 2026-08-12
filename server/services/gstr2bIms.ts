/**
 * Local IMS-lite triage for GSTR-2B reconcile rows.
 * Persists Accept / Hold / Reject per (rtnprd, ctin, inum) — no GST portal push.
 */
import type { Pool } from 'pg';
import { normalizeGstr2bKeyPart, type Gstr2bReconRow } from './gstr2bReconcile';

export type Gstr2bImsAction = 'accept' | 'hold' | 'reject';

export type Gstr2bImsActionRow = {
  rtnprd: string;
  ctin: string;
  invoiceNumber: string;
  action: Gstr2bImsAction;
  note: string | null;
  updatedAt: string;
};

export function extractGstr2bRtnprd(data: Record<string, unknown>): string {
  const raw = String(data.rtnprd || data.fp || data.ret_period || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '');
  return raw.slice(0, 12);
}

export function isGstr2bImsAction(v: unknown): v is Gstr2bImsAction {
  return v === 'accept' || v === 'hold' || v === 'reject';
}

export async function listGstr2bImsActions(
  pool: Pool,
  tenantId: string,
  rtnprd: string,
): Promise<Gstr2bImsActionRow[]> {
  const period = String(rtnprd || '')
    .trim()
    .toUpperCase();
  if (!period) return [];
  const { rows } = await pool.query(
    `SELECT rtnprd, ctin, invoice_number, action, note, updated_at
     FROM gstr2b_ims_actions
     WHERE tenant_id = $1 AND rtnprd = $2
     ORDER BY updated_at DESC`,
    [tenantId, period],
  );
  return rows.map(r => ({
    rtnprd: String(r.rtnprd),
    ctin: String(r.ctin),
    invoiceNumber: String(r.invoice_number),
    action: r.action as Gstr2bImsAction,
    note: r.note != null ? String(r.note) : null,
    updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
  }));
}

/** Map key = normalizedCtin::normalizedInum → action */
export async function loadGstr2bImsActionMap(
  pool: Pool,
  tenantId: string,
  rtnprd: string,
): Promise<Map<string, Gstr2bImsAction>> {
  const actions = await listGstr2bImsActions(pool, tenantId, rtnprd);
  const map = new Map<string, Gstr2bImsAction>();
  for (const a of actions) {
    const key = `${normalizeGstr2bKeyPart(a.ctin)}::${normalizeGstr2bKeyPart(a.invoiceNumber)}`;
    if (key !== '::') map.set(key, a.action);
  }
  return map;
}

export function mergeImsActionsIntoRows(
  rows: Gstr2bReconRow[],
  actionMap: Map<string, Gstr2bImsAction>,
): Array<Gstr2bReconRow & { imsAction: Gstr2bImsAction | null }> {
  return rows.map(r => {
    const key = `${normalizeGstr2bKeyPart(r.ctin)}::${normalizeGstr2bKeyPart(r.invoiceNumber)}`;
    return { ...r, imsAction: actionMap.get(key) || null };
  });
}

export async function upsertGstr2bImsAction(
  pool: Pool,
  tenantId: string,
  input: {
    rtnprd: string;
    ctin: string;
    invoiceNumber: string;
    action: Gstr2bImsAction | null;
    note?: string | null;
  },
): Promise<{ deleted: boolean; row: Gstr2bImsActionRow | null }> {
  const rtnprd = String(input.rtnprd || '')
    .trim()
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .slice(0, 12);
  const ctin = String(input.ctin || '').trim();
  const invoiceNumber = String(input.invoiceNumber || '').trim();
  const ctinNorm = normalizeGstr2bKeyPart(ctin);
  const inumNorm = normalizeGstr2bKeyPart(invoiceNumber);
  if (!rtnprd) throw Object.assign(new Error('rtnprd (return period) is required'), { status: 400 });
  if (!ctinNorm || !inumNorm) throw Object.assign(new Error('ctin and invoiceNumber are required'), { status: 400 });

  if (!input.action) {
    await pool.query(
      `DELETE FROM gstr2b_ims_actions
       WHERE tenant_id = $1 AND rtnprd = $2 AND ctin_norm = $3 AND inum_norm = $4`,
      [tenantId, rtnprd, ctinNorm, inumNorm],
    );
    return { deleted: true, row: null };
  }
  if (!isGstr2bImsAction(input.action)) {
    throw Object.assign(new Error('action must be accept, hold, or reject'), { status: 400 });
  }

  const note = input.note != null ? String(input.note).trim().slice(0, 500) || null : null;
  const { rows } = await pool.query(
    `INSERT INTO gstr2b_ims_actions
       (tenant_id, rtnprd, ctin, invoice_number, ctin_norm, inum_norm, action, note, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
     ON CONFLICT (tenant_id, rtnprd, ctin_norm, inum_norm)
     DO UPDATE SET
       ctin = EXCLUDED.ctin,
       invoice_number = EXCLUDED.invoice_number,
       action = EXCLUDED.action,
       note = EXCLUDED.note,
       updated_at = NOW()
     RETURNING rtnprd, ctin, invoice_number, action, note, updated_at`,
    [tenantId, rtnprd, ctin, invoiceNumber, ctinNorm, inumNorm, input.action, note],
  );
  const r = rows[0];
  return {
    deleted: false,
    row: {
      rtnprd: String(r.rtnprd),
      ctin: String(r.ctin),
      invoiceNumber: String(r.invoice_number),
      action: r.action as Gstr2bImsAction,
      note: r.note != null ? String(r.note) : null,
      updatedAt: r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at),
    },
  };
}
