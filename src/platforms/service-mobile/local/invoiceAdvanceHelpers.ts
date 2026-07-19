/**
 * Client advance / unallocated payments (Offline Mobile).
 * Cash is recorded once in invoice_payments (invoice_id NULL); applying to an
 * invoice only sets invoice_id / splits rows — analytics collections stay single-count.
 */
import { localQuery } from './db';

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export type PartyRef = {
  partyType: 'vendor' | 'customer' | null;
  partyId: string | null;
  clientName: string | null;
};

export async function invoiceRemaining(
  tenantId: string,
  invoiceId: string,
): Promise<{
  grand: number;
  paid: number;
  remaining: number;
  partyType: string | null;
  partyId: string | null;
  clientName: string;
  status: string;
} | null> {
  const { rows: invRows } = await localQuery(
    `SELECT id, COALESCE(grand_total, total, 0) AS grand_total, status,
            party_type, party_id, COALESCE(customer_name, client_name, '') AS client_name
     FROM standalone_invoices WHERE id=$1 AND tenant_id=$2 AND COALESCE(status,'') != 'cancelled'`,
    [invoiceId, tenantId],
  );
  const inv = invRows[0] as
    | {
        grand_total: number;
        status: string;
        party_type: string | null;
        party_id: string | null;
        client_name: string;
      }
    | undefined;
  if (!inv) return null;
  const { rows: paidRows } = await localQuery(
    `SELECT COALESCE(SUM(amount),0) AS t FROM invoice_payments WHERE invoice_id=$1 AND tenant_id=$2`,
    [invoiceId, tenantId],
  );
  const paid = Number((paidRows[0] as { t: number }).t) || 0;
  const grand = Number(inv.grand_total) || 0;
  return {
    grand,
    paid,
    remaining: grand - paid,
    partyType: (inv.party_type as string) || null,
    partyId: (inv.party_id as string) || null,
    clientName: String(inv.client_name || ''),
    status: String(inv.status || 'draft'),
  };
}

async function listUnallocatedAdvances(tenantId: string, party: PartyRef) {
  let sql = `
    SELECT id, amount, payment_date, method, payment_method, reference_number, notes,
           party_type, party_id, client_name
    FROM invoice_payments
    WHERE tenant_id=$1 AND invoice_id IS NULL AND COALESCE(is_advance,false)=true`;
  const params: unknown[] = [tenantId];
  if (party.partyType && party.partyId) {
    sql += ` AND party_type=$2 AND party_id=$3`;
    params.push(party.partyType, party.partyId);
  } else {
    sql += ` AND COALESCE(client_name,'')=$2 AND (party_type IS NULL OR party_id IS NULL)`;
    params.push(party.clientName || '');
  }
  sql += ` ORDER BY payment_date ASC NULLS LAST, created_at ASC`;
  const { rows } = await localQuery(sql, params);
  return rows as {
    id: string;
    amount: number;
    payment_date: string | null;
    method: string | null;
    payment_method: string | null;
    reference_number: string | null;
    notes: string | null;
    party_type: string | null;
    party_id: string | null;
    client_name: string | null;
  }[];
}

/** FIFO-apply unallocated advances onto one invoice. Returns amount applied. */
export async function applyAdvancesToInvoice(tenantId: string, invoiceId: string): Promise<number> {
  const info = await invoiceRemaining(tenantId, invoiceId);
  if (!info || info.remaining <= 0.001) return 0;

  const party: PartyRef = {
    partyType: info.partyType === 'vendor' || info.partyType === 'customer' ? info.partyType : null,
    partyId: info.partyId,
    clientName: info.clientName,
  };
  const advances = await listUnallocatedAdvances(tenantId, party);
  let remaining = info.remaining;
  let applied = 0;

  for (const adv of advances) {
    if (remaining <= 0.001) break;
    const advAmt = Number(adv.amount) || 0;
    if (advAmt <= 0) continue;
    const take = Math.min(advAmt, remaining);
    const method = adv.payment_method || adv.method || 'Cash';
    const notes = adv.notes || 'Advance payment';

    if (take >= advAmt - 0.001) {
      await localQuery(
        `UPDATE invoice_payments
         SET invoice_id=$1, is_advance=true, notes=COALESCE(NULLIF(notes,''), 'Advance payment'),
             party_type=COALESCE(party_type,$2), party_id=COALESCE(party_id,$3),
             client_name=COALESCE(NULLIF(client_name,''), $4)
         WHERE id=$5 AND tenant_id=$6`,
        [invoiceId, party.partyType, party.partyId, party.clientName || null, adv.id, tenantId],
      );
    } else {
      await localQuery(`UPDATE invoice_payments SET amount=$1 WHERE id=$2 AND tenant_id=$3`, [
        Math.round((advAmt - take) * 100) / 100,
        adv.id,
        tenantId,
      ]);
      const newId = uid('IP');
      await localQuery(
        `INSERT INTO invoice_payments
           (id, tenant_id, invoice_id, amount, payment_date, method, payment_method,
            reference_number, notes, party_type, party_id, client_name, is_advance)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,$11,true)`,
        [
          newId,
          tenantId,
          invoiceId,
          take,
          adv.payment_date,
          method,
          adv.reference_number,
          notes,
          party.partyType || adv.party_type,
          party.partyId || adv.party_id,
          party.clientName || adv.client_name,
        ],
      );
    }
    remaining -= take;
    applied += take;
  }

  if (applied > 0.001) {
    const { rows: sumRows } = await localQuery(
      `SELECT COALESCE(SUM(amount),0) AS t FROM invoice_payments WHERE invoice_id=$1 AND tenant_id=$2`,
      [invoiceId, tenantId],
    );
    const paid = Number((sumRows[0] as { t: number }).t) || 0;
    if (paid >= info.grand - 0.001 && info.grand > 0) {
      await localQuery(`UPDATE standalone_invoices SET status='paid' WHERE id=$1 AND tenant_id=$2`, [
        invoiceId,
        tenantId,
      ]);
    }
  }
  return Math.round(applied * 100) / 100;
}

/** Apply advances to all open invoices for a party (oldest invoice first). */
export async function applyPartyAdvances(tenantId: string, party: PartyRef): Promise<void> {
  let where = `tenant_id=$1 AND COALESCE(status,'') NOT IN ('cancelled','paid')`;
  const params: unknown[] = [tenantId];
  if (party.partyType && party.partyId) {
    where += ` AND party_type=$2 AND party_id=$3`;
    params.push(party.partyType, party.partyId);
  } else {
    where += ` AND COALESCE(customer_name, client_name)=$2 AND (party_type IS NULL OR party_id IS NULL)`;
    params.push(party.clientName || '');
  }
  const { rows } = await localQuery(
    `SELECT id FROM standalone_invoices WHERE ${where}
     ORDER BY invoice_date ASC NULLS LAST, created_at ASC`,
    params,
  );
  for (const r of rows as { id: string }[]) {
    await applyAdvancesToInvoice(tenantId, r.id);
  }
}

export async function sumUnallocatedAdvance(tenantId: string, party: PartyRef): Promise<number> {
  const rows = await listUnallocatedAdvances(tenantId, party);
  return rows.reduce((s, r) => s + (Number(r.amount) || 0), 0);
}
