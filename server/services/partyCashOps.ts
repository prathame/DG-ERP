/**
 * Party cash → ops dual-write (Invoice Finance / vendor payments).
 * Shared by Miracle import and Books voucher desk.
 */
import type { PoolClient } from 'pg';
import { uid } from '../utils/helpers';

/** Collapse padded doc nos (`GT/     1` → `GT/1`). */
export function normalizeDocNumber(raw: string | null | undefined): string {
  const s = (raw || '').trim();
  if (!s) return '';
  return s.replace(/\s+/g, '');
}

export async function upsertVendorPayment(
  client: PoolClient,
  tenantId: string,
  vendorId: string,
  amount: number,
  paymentDate: string,
  paymentMethod: string,
  referenceNumber: string | null,
  notes: string | null,
  idempotencyKey: string,
): Promise<boolean> {
  if (amount <= 0) return false;
  const existing = (
    await client.query(`SELECT id FROM vendor_payments WHERE tenant_id = $1 AND idempotency_key = $2`, [
      tenantId,
      idempotencyKey,
    ])
  ).rows[0] as { id: string } | undefined;
  if (existing) {
    await client.query(
      `UPDATE vendor_payments
       SET vendor_id = $3, amount = $4, payment_date = $5, payment_method = $6,
           reference_number = $7, notes = $8
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, existing.id, vendorId, amount, paymentDate, paymentMethod, referenceNumber, notes],
    );
    return true;
  }
  await client.query(
    `INSERT INTO vendor_payments
       (id, tenant_id, vendor_id, amount, payment_date, payment_method, reference_number, notes, idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [uid('VP'), tenantId, vendorId, amount, paymentDate, paymentMethod, referenceNumber, notes, idempotencyKey],
  );
  return true;
}

/**
 * Allocate a party receipt to open invoices (bill refs first, then FIFO).
 * `idempotencyBase` e.g. `miracle:CRV…` or `books:BV…` — re-import / re-save safe.
 */
export async function allocatePartyReceipt(
  client: PoolClient,
  tenantId: string,
  vendorId: string,
  amount: number,
  paymentDate: string,
  paymentMethod: string,
  referenceNumber: string | null,
  idempotencyBase: string,
  narration: string | null,
  preferredInvoiceNumbers: string[] = [],
  noteLabel = 'Receipt',
): Promise<{ invoicePayments: number; vendorPayments: number; billMatched: number }> {
  await client.query(`DELETE FROM invoice_payments WHERE tenant_id = $1 AND idempotency_key LIKE $2`, [
    tenantId,
    `${idempotencyBase}:%`,
  ]);
  await client.query(`DELETE FROM vendor_payments WHERE tenant_id = $1 AND idempotency_key = $2`, [
    tenantId,
    idempotencyBase,
  ]);

  const open = (
    await client.query(
      `SELECT si.id, si.invoice_number, si.grand_total::float AS grand_total,
              COALESCE((SELECT SUM(ip.amount)::float FROM invoice_payments ip
                        WHERE ip.tenant_id = si.tenant_id AND ip.invoice_id = si.id), 0) AS paid
       FROM standalone_invoices si
       WHERE si.tenant_id = $1 AND si.party_type = 'vendor' AND si.party_id = $2
         AND si.status IS DISTINCT FROM 'cancelled'
       ORDER BY si.invoice_date ASC NULLS LAST, si.created_at ASC NULLS LAST, si.id ASC`,
      [tenantId, vendorId],
    )
  ).rows as Array<{ id: string; invoice_number: string; grand_total: number; paid: number }>;

  const byNumber = new Map<string, (typeof open)[number]>();
  for (const inv of open) {
    const key = normalizeDocNumber(inv.invoice_number);
    if (key && !byNumber.has(key)) byNumber.set(key, inv);
  }

  const paidSoFar = new Map<string, number>();
  for (const inv of open) paidSoFar.set(inv.id, Number(inv.paid));

  let remaining = Math.round(amount * 100) / 100;
  let invoicePayments = 0;
  let billMatched = 0;
  let slice = 0;

  const applyTo = async (inv: (typeof open)[number], preferBill: boolean) => {
    if (remaining <= 0.009) return;
    const already = paidSoFar.get(inv.id) || 0;
    const due = Math.round((Number(inv.grand_total) - already) * 100) / 100;
    if (due <= 0.009) return;
    const apply = Math.min(remaining, due);
    const key = `${idempotencyBase}:${slice++}`;
    await client.query(
      `INSERT INTO invoice_payments
         (id, tenant_id, invoice_id, amount, payment_date, payment_method, reference_number, notes, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uid('IP'),
        tenantId,
        inv.id,
        apply,
        paymentDate,
        paymentMethod,
        referenceNumber,
        narration
          ? `${noteLabel}${preferBill ? ' (bill)' : ''}: ${narration}`
          : `${noteLabel}${preferBill ? ' (bill)' : ''}`,
        key,
      ],
    );
    invoicePayments++;
    if (preferBill) billMatched++;
    const newPaid = already + apply;
    paidSoFar.set(inv.id, newPaid);
    if (newPaid >= Number(inv.grand_total) - 0.001) {
      await client.query(
        `UPDATE standalone_invoices SET status = 'paid', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [inv.id, tenantId],
      );
    } else {
      await client.query(
        `UPDATE standalone_invoices SET status = 'sent', updated_at = NOW() WHERE id = $1 AND tenant_id = $2 AND status = 'draft'`,
        [inv.id, tenantId],
      );
    }
    remaining = Math.round((remaining - apply) * 100) / 100;
  };

  const seen = new Set<string>();
  for (const raw of preferredInvoiceNumbers) {
    const num = normalizeDocNumber(raw);
    if (!num) continue;
    const inv = byNumber.get(num);
    if (!inv || seen.has(inv.id)) continue;
    seen.add(inv.id);
    await applyTo(inv, true);
  }

  for (const inv of open) {
    if (seen.has(inv.id)) continue;
    await applyTo(inv, false);
  }

  let vendorPayments = 0;
  if (remaining > 0.009) {
    const ok = await upsertVendorPayment(
      client,
      tenantId,
      vendorId,
      remaining,
      paymentDate,
      paymentMethod,
      referenceNumber,
      narration ? `${noteLabel} (unallocated): ${narration}` : `${noteLabel} (unallocated)`,
      idempotencyBase,
    );
    if (ok) vendorPayments = 1;
  }
  return { invoicePayments, vendorPayments, billMatched };
}

/** Resolve ops vendor from a Books party ledger (external_ref, then exact name). */
export async function resolveVendorForBookLedger(
  client: PoolClient,
  tenantId: string,
  ledgerId: string,
): Promise<{ vendorId: string; vendorName: string; ledgerName: string; ledgerType: string | null } | null> {
  const ledger = (
    await client.query(
      `SELECT id, name, ledger_type, external_ref FROM book_ledgers WHERE tenant_id = $1 AND id = $2`,
      [tenantId, ledgerId],
    )
  ).rows[0] as { id: string; name: string; ledger_type: string | null; external_ref: string | null } | undefined;
  if (!ledger) return null;

  if (ledger.external_ref) {
    const byRef = (
      await client.query(`SELECT id, name FROM vendors WHERE tenant_id = $1 AND external_ref = $2 LIMIT 1`, [
        tenantId,
        ledger.external_ref,
      ])
    ).rows[0] as { id: string; name: string } | undefined;
    if (byRef) {
      return {
        vendorId: byRef.id,
        vendorName: byRef.name,
        ledgerName: ledger.name,
        ledgerType: ledger.ledger_type,
      };
    }
  }

  const byName = (
    await client.query(`SELECT id, name FROM vendors WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
      tenantId,
      ledger.name,
    ])
  ).rows[0] as { id: string; name: string } | undefined;
  if (byName) {
    return {
      vendorId: byName.id,
      vendorName: byName.name,
      ledgerName: ledger.name,
      ledgerType: ledger.ledger_type,
    };
  }
  return null;
}
