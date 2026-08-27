/**
 * Ops → Books dual-write (invoice / payment / expense / distribution / vendor payment).
 * Idempotent via book_vouchers.external_ref.
 * Native tenants get a minimal COA on first use — Miracle import is optional data, not a gate.
 * Does not call createBookVoucher receipt dual-write (would loop into invoice_payments).
 */
import type { PoolClient } from 'pg';
import { splitGst, uid } from '../utils/helpers';
import { round2 } from './bookReports';
import { assertBooksDatesUnlocked } from './bookPeriodLock';

/**
 * Ensure Cash / Bank / Sales Income (+ party ledgers for existing clients) exist.
 * Safe to call on every Books list/summary and before ops dual-write.
 *
 * After Miracle import, cash is usually `ACASHACT` ("Cash Account"). Do not also
 * seed `ops:CASH` with the same display name — uniqueness is only on external_ref.
 */
export async function ensureNativeBooksDesk(client: PoolClient, tenantId: string): Promise<void> {
  await ensureCashOrBankDeskLedger(client, tenantId, 'CS');
  await ensureCashOrBankDeskLedger(client, tenantId, 'BK');
  await ensureLedger(client, tenantId, 'ops:SALES_INCOME', 'Sales Income', 'I', 'IN', 'ops:G-INCOME', 'Income');
  await ensureLedger(client, tenantId, 'ops:PURCHASE', 'Purchase Account', 'E', 'EX', 'ops:G-PURCHASE', 'Purchases');
  await ensureOutputGstLedgers(client, tenantId);
  await ensureInputGstLedgers(client, tenantId);
  await ensureStockLedger(client, tenantId);
  const vendors = (
    await client.query(`SELECT id, name FROM vendors WHERE tenant_id = $1 ORDER BY name LIMIT 500`, [tenantId])
  ).rows as { id: string; name: string }[];
  for (const v of vendors) {
    await resolvePartyLedgerId(client, tenantId, v.id, v.name);
  }
}

/**
 * Prefer Miracle / existing CS|BK ledgers over creating a second "Cash Account" / "Bank Account".
 * Also drops an empty native `ops:CASH`/`ops:BANK` duplicate when another CS/BK already exists.
 */
async function ensureCashOrBankDeskLedger(
  client: PoolClient,
  tenantId: string,
  ledgerType: 'CS' | 'BK',
): Promise<string> {
  const opsRef = ledgerType === 'CS' ? 'ops:CASH' : 'ops:BANK';
  const miracleRef = ledgerType === 'CS' ? 'ACASHACT' : null;
  const displayName = ledgerType === 'CS' ? 'Cash Account' : 'Bank Account';
  const groupExt = ledgerType === 'CS' ? 'ops:G-CASH' : 'ops:G-BANK';
  const groupName = ledgerType === 'CS' ? 'Cash-in-Hand' : 'Bank Accounts';

  const preferred = (
    await client.query(
      `SELECT id, external_ref FROM book_ledgers
       WHERE tenant_id = $1 AND ledger_type = $2
       ORDER BY
         CASE
           WHEN $3::text IS NOT NULL AND external_ref = $3 THEN 0
           WHEN external_ref = $4 THEN 1
           WHEN LOWER(name) = LOWER($5) THEN 2
           ELSE 3
         END,
         name
       LIMIT 1`,
      [tenantId, ledgerType, miracleRef, opsRef, displayName],
    )
  ).rows[0] as { id: string; external_ref: string | null } | undefined;

  if (preferred) {
    // Cleanup: empty native twin left over from older dual-seed
    if (preferred.external_ref !== opsRef) {
      await client.query(
        `DELETE FROM book_ledgers bl
         WHERE bl.tenant_id = $1
           AND bl.external_ref = $2
           AND bl.id <> $3
           AND NOT EXISTS (
             SELECT 1 FROM book_voucher_entries e WHERE e.tenant_id = bl.tenant_id AND e.ledger_id = bl.id
           )`,
        [tenantId, opsRef, preferred.id],
      );
    }
    return preferred.id;
  }

  return ensureLedger(client, tenantId, opsRef, displayName, 'B', ledgerType, groupExt, groupName);
}

/** Output GST payable ledgers (Duties & Taxes) — used when dual-writing GST invoices. */
async function ensureOutputGstLedgers(
  client: PoolClient,
  tenantId: string,
): Promise<{ cgst: string; sgst: string; igst: string }> {
  const cgst = await ensureLedger(
    client,
    tenantId,
    'ops:CGST_OUT',
    'Output CGST',
    'L',
    'LI',
    'ops:G-DUTIES',
    'Duties & Taxes',
  );
  const sgst = await ensureLedger(
    client,
    tenantId,
    'ops:SGST_OUT',
    'Output SGST',
    'L',
    'LI',
    'ops:G-DUTIES',
    'Duties & Taxes',
  );
  const igst = await ensureLedger(
    client,
    tenantId,
    'ops:IGST_OUT',
    'Output IGST',
    'L',
    'LI',
    'ops:G-DUTIES',
    'Duties & Taxes',
  );
  return { cgst, sgst, igst };
}

/** Input GST (ITC) — Duties & Taxes, debit on purchase. */
async function ensureInputGstLedgers(
  client: PoolClient,
  tenantId: string,
): Promise<{ cgst: string; sgst: string; igst: string }> {
  const cgst = await ensureLedger(
    client,
    tenantId,
    'ops:CGST_IN',
    'Input CGST',
    'L',
    'LI',
    'ops:G-DUTIES',
    'Duties & Taxes',
  );
  const sgst = await ensureLedger(
    client,
    tenantId,
    'ops:SGST_IN',
    'Input SGST',
    'L',
    'LI',
    'ops:G-DUTIES',
    'Duties & Taxes',
  );
  const igst = await ensureLedger(
    client,
    tenantId,
    'ops:IGST_IN',
    'Input IGST',
    'L',
    'LI',
    'ops:G-DUTIES',
    'Duties & Taxes',
  );
  return { cgst, sgst, igst };
}

async function ensureStockLedger(client: PoolClient, tenantId: string): Promise<string> {
  return ensureLedger(client, tenantId, 'ops:STOCK', 'Stock-in-Hand', 'A', 'AS', 'ops:G-CURRENT', 'Current Assets');
}

async function ensureOpeningCapitalLedger(client: PoolClient, tenantId: string): Promise<string> {
  return ensureLedger(
    client,
    tenantId,
    'ops:OPENING_CAPITAL',
    'Opening Capital',
    'C',
    'CA',
    'ops:G-CAPITAL',
    'Capital Account',
  );
}

async function tenantGstin(client: PoolClient, tenantId: string): Promise<string | null> {
  const row = (await client.query(`SELECT gst_number FROM tenants WHERE id = $1`, [tenantId])).rows[0] as
    { gst_number?: string | null } | undefined;
  return row?.gst_number ?? null;
}

function pushGstLines(
  entries: Array<{ ledgerId: string; debit: number; credit: number }>,
  ledgers: { cgst: string; sgst: string; igst: string },
  split: { cgst: number; sgst: number; igst: number },
  side: 'debit' | 'credit',
): void {
  const add = (ledgerId: string, amt: number) => {
    if (!(amt > 0)) return;
    entries.push(side === 'debit' ? { ledgerId, debit: amt, credit: 0 } : { ledgerId, debit: 0, credit: amt });
  };
  add(ledgers.cgst, round2(split.cgst));
  add(ledgers.sgst, round2(split.sgst));
  add(ledgers.igst, round2(split.igst));
}

/** Delete all Books rows for a tenant, then re-seed Cash / Bank / Sales + party ledgers. */
export async function wipeNativeBooksDesk(
  client: PoolClient,
  tenantId: string,
): Promise<{ deleted: Record<string, number> }> {
  const deleted: Record<string, number> = {};
  const tables = [
    'book_bank_recon_marks',
    'book_bank_recon_sessions',
    'book_voucher_entries',
    'book_voucher_items',
    'book_vouchers',
    'book_ledger_details',
    'book_ledgers',
    'book_products',
    'book_account_groups',
    'book_import_jobs',
    'book_financial_years',
  ] as const;
  for (const table of tables) {
    const result = await client.query(`DELETE FROM ${table} WHERE tenant_id = $1`, [tenantId]);
    deleted[table] = result.rowCount ?? 0;
  }
  await ensureNativeBooksDesk(client, tenantId);
  return { deleted };
}

async function resolveFinancialYearId(client: PoolClient, tenantId: string, voucherDate: string): Promise<string> {
  const active = (
    await client.query(
      `SELECT id FROM book_financial_years WHERE tenant_id = $1 AND is_active = true ORDER BY code DESC LIMIT 1`,
      [tenantId],
    )
  ).rows[0] as { id: string } | undefined;
  if (active) return active.id;
  const year = Number(voucherDate.slice(0, 4)) || new Date().getFullYear();
  const month = Number(voucherDate.slice(5, 7)) || 4;
  const fyStart = month >= 4 ? year : year - 1;
  const code = `YR${String(fyStart).slice(-2)}`;
  const id = uid('BF');
  await client.query(
    `INSERT INTO book_financial_years (id, tenant_id, code, label, is_active, external_ref)
     VALUES ($1,$2,$3,$4,true,$3)
     ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true`,
    [id, tenantId, code, `FY ${fyStart}-${String(fyStart + 1).slice(-2)}`],
  );
  const row = (
    await client.query(`SELECT id FROM book_financial_years WHERE tenant_id = $1 AND code = $2`, [tenantId, code])
  ).rows[0] as { id: string };
  return row.id;
}

async function ensureGroup(
  client: PoolClient,
  tenantId: string,
  externalRef: string,
  name: string,
  nature: string,
): Promise<string> {
  const existing = (
    await client.query(`SELECT id FROM book_account_groups WHERE tenant_id = $1 AND external_ref = $2`, [
      tenantId,
      externalRef,
    ])
  ).rows[0] as { id: string } | undefined;
  if (existing) return existing.id;
  const id = uid('BG');
  await client.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, nature, external_ref)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (tenant_id, external_ref) DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [id, tenantId, name, nature, externalRef],
  );
  const row = (
    await client.query(`SELECT id FROM book_account_groups WHERE tenant_id = $1 AND external_ref = $2`, [
      tenantId,
      externalRef,
    ])
  ).rows[0] as { id: string };
  return row.id;
}

async function ensureLedger(
  client: PoolClient,
  tenantId: string,
  externalRef: string,
  name: string,
  nature: string,
  ledgerType: string,
  groupExt: string,
  groupName: string,
): Promise<string> {
  const existing = (
    await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND external_ref = $2`, [
      tenantId,
      externalRef,
    ])
  ).rows[0] as { id: string } | undefined;
  if (existing) return existing.id;
  const groupId = await ensureGroup(client, tenantId, groupExt, groupName, nature);
  const id = uid('BL');
  await client.query(
    `INSERT INTO book_ledgers
       (id, tenant_id, name, group_id, nature, ledger_type, opening_balance, opening_side, is_system, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,0,'D',$7,$8)
     ON CONFLICT (tenant_id, external_ref) DO UPDATE SET name = EXCLUDED.name`,
    [id, tenantId, name, groupId, nature, ledgerType, externalRef.startsWith('ops:'), externalRef],
  );
  const row = (
    await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND external_ref = $2`, [
      tenantId,
      externalRef,
    ])
  ).rows[0] as { id: string };
  return row.id;
}

async function resolvePartyLedgerId(
  client: PoolClient,
  tenantId: string,
  partyId: string | null | undefined,
  partyName: string,
): Promise<string> {
  if (partyId) {
    const vendor = (
      await client.query(`SELECT id, name, external_ref FROM vendors WHERE tenant_id = $1 AND id = $2`, [
        tenantId,
        partyId,
      ])
    ).rows[0] as { id: string; name: string; external_ref: string | null } | undefined;
    if (vendor?.external_ref) {
      const byRef = (
        await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND external_ref = $2`, [
          tenantId,
          vendor.external_ref,
        ])
      ).rows[0] as { id: string } | undefined;
      if (byRef) return byRef.id;
    }
    if (vendor) {
      const byName = (
        await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
          tenantId,
          vendor.name,
        ])
      ).rows[0] as { id: string } | undefined;
      if (byName) return byName.id;
      return ensureLedger(
        client,
        tenantId,
        `ops:party:${vendor.id}`,
        vendor.name,
        'B',
        'PR',
        'ops:G-DEBTORS',
        'Sundry Debtors',
      );
    }
  }
  const byName = (
    await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
      tenantId,
      partyName,
    ])
  ).rows[0] as { id: string } | undefined;
  if (byName) return byName.id;
  return ensureLedger(
    client,
    tenantId,
    `ops:party:name:${partyName.slice(0, 80)}`,
    partyName || 'Party',
    'B',
    'PR',
    'ops:G-DEBTORS',
    'Sundry Debtors',
  );
}

async function resolveSalesIncomeLedger(client: PoolClient, tenantId: string): Promise<string> {
  const preferred = (
    await client.query(
      `SELECT id FROM book_ledgers
       WHERE tenant_id = $1
         AND (ledger_type IN ('IN','JP','TS') OR nature = 'I' OR LOWER(name) LIKE '%sales%' OR LOWER(name) LIKE '%income%')
       ORDER BY
         CASE
           WHEN external_ref = 'ops:SALES_INCOME' THEN 0
           WHEN LOWER(name) = 'sales income' THEN 1
           WHEN ledger_type = 'IN' AND LOWER(name) LIKE '%sales%' THEN 2
           WHEN ledger_type = 'IN' THEN 3
           WHEN ledger_type = 'JP' THEN 4
           WHEN LOWER(name) LIKE '%sales%' THEN 5
           ELSE 6
         END,
         name
       LIMIT 1`,
      [tenantId],
    )
  ).rows[0] as { id: string } | undefined;
  if (preferred) return preferred.id;
  return ensureLedger(client, tenantId, 'ops:SALES_INCOME', 'Sales Income', 'I', 'IN', 'ops:G-INCOME', 'Income');
}

async function resolvePurchaseAccountLedger(client: PoolClient, tenantId: string): Promise<string> {
  const preferred = (
    await client.query(
      `SELECT id FROM book_ledgers
       WHERE tenant_id = $1
         AND (external_ref = 'ops:PURCHASE' OR LOWER(name) LIKE '%purchase%')
       ORDER BY
         CASE
           WHEN external_ref = 'ops:PURCHASE' THEN 0
           WHEN LOWER(name) = 'purchase account' THEN 1
           WHEN LOWER(name) LIKE '%purchase%' THEN 2
           ELSE 3
         END,
         name
       LIMIT 1`,
      [tenantId],
    )
  ).rows[0] as { id: string } | undefined;
  if (preferred) return preferred.id;
  return ensureLedger(client, tenantId, 'ops:PURCHASE', 'Purchase Account', 'E', 'EX', 'ops:G-PURCHASE', 'Purchases');
}

/** Supplier → Sundry Creditors party ledger (AP). */
async function resolveSupplierLedgerId(
  client: PoolClient,
  tenantId: string,
  supplierId: string | null | undefined,
  supplierName: string,
): Promise<string> {
  if (supplierId) {
    const byRef = (
      await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND external_ref = $2`, [
        tenantId,
        `ops:supplier:${supplierId}`,
      ])
    ).rows[0] as { id: string } | undefined;
    if (byRef) return byRef.id;
    const supplier = (
      await client.query(`SELECT id, name FROM suppliers WHERE tenant_id = $1 AND id = $2`, [tenantId, supplierId])
    ).rows[0] as { id: string; name: string } | undefined;
    if (supplier) {
      const byName = (
        await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
          tenantId,
          supplier.name,
        ])
      ).rows[0] as { id: string } | undefined;
      if (byName) return byName.id;
      return ensureLedger(
        client,
        tenantId,
        `ops:supplier:${supplier.id}`,
        supplier.name,
        'L',
        'PR',
        'ops:G-CREDITORS',
        'Sundry Creditors',
      );
    }
  }
  const byName = (
    await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
      tenantId,
      supplierName,
    ])
  ).rows[0] as { id: string } | undefined;
  if (byName) return byName.id;
  return ensureLedger(
    client,
    tenantId,
    `ops:supplier:name:${(supplierName || 'Supplier').slice(0, 80)}`,
    supplierName || 'Supplier',
    'L',
    'PR',
    'ops:G-CREDITORS',
    'Sundry Creditors',
  );
}

async function resolveCashBankLedger(client: PoolClient, tenantId: string, paymentMethod: string): Promise<string> {
  const method = (paymentMethod || 'Cash').toLowerCase();
  const wantBank = /bank|neft|rtgs|upi|cheque|card|online|transfer/.test(method);
  if (wantBank) {
    return ensureCashOrBankDeskLedger(client, tenantId, 'BK');
  }
  return ensureCashOrBankDeskLedger(client, tenantId, 'CS');
}

async function resolveExpenseLedger(client: PoolClient, tenantId: string, category: string | null): Promise<string> {
  const name = (category || 'General Expense').trim() || 'General Expense';
  const byName = (
    await client.query(
      `SELECT id FROM book_ledgers
       WHERE tenant_id = $1 AND (LOWER(name) = LOWER($2) OR (nature = 'E' AND LOWER(name) LIKE $3))
       ORDER BY CASE WHEN LOWER(name) = LOWER($2) THEN 0 ELSE 1 END
       LIMIT 1`,
      [tenantId, name, `%${name.toLowerCase()}%`],
    )
  ).rows[0] as { id: string } | undefined;
  if (byName) return byName.id;
  return ensureLedger(
    client,
    tenantId,
    `ops:EXP:${name.slice(0, 60)}`,
    name,
    'E',
    'EX',
    'ops:G-EXPENSE',
    'Indirect Expenses',
  );
}

async function insertVoucher(
  client: PoolClient,
  tenantId: string,
  opts: {
    voucherType: string;
    voucherDate: string;
    voucherNumber: string | null;
    partyLedgerId: string;
    contraLedgerId: string;
    amount: number;
    narration: string | null;
    externalRef: string;
    entries: Array<{ ledgerId: string; debit: number; credit: number }>;
  },
): Promise<string | null> {
  const existing = (
    await client.query(`SELECT id FROM book_vouchers WHERE tenant_id = $1 AND external_ref = $2`, [
      tenantId,
      opts.externalRef,
    ])
  ).rows[0] as { id: string } | undefined;
  if (existing) return existing.id;

  const amount = round2(opts.amount);
  if (!(amount > 0)) return null;
  await assertBooksDatesUnlocked(client, tenantId, [opts.voucherDate]);
  const fy = await resolveFinancialYearId(client, tenantId, opts.voucherDate);
  const voucherId = uid('BV');
  await client.query(
    `INSERT INTO book_vouchers
       (id, tenant_id, financial_year_id, voucher_type, voucher_date, voucher_number,
        party_ledger_id, contra_ledger_id, amount, narration, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      voucherId,
      tenantId,
      fy,
      opts.voucherType,
      opts.voucherDate,
      opts.voucherNumber,
      opts.partyLedgerId,
      opts.contraLedgerId,
      amount,
      opts.narration,
      opts.externalRef,
    ],
  );
  let lineNo = 0;
  for (const line of opts.entries) {
    lineNo++;
    await client.query(
      `INSERT INTO book_voucher_entries
         (id, tenant_id, voucher_id, line_no, ledger_id, debit, credit, external_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        uid('BE'),
        tenantId,
        voucherId,
        lineNo,
        line.ledgerId,
        round2(line.debit),
        round2(line.credit),
        `${opts.externalRef}:${lineNo}`,
      ],
    );
  }
  return voucherId;
}

/** Sales invoice → Dr Party, Cr Sales (taxable) + Cr Output GST (if any). */
export async function postStandaloneInvoiceToBooks(
  client: PoolClient,
  tenantId: string,
  invoice: {
    id: string;
    invoiceNumber?: string | null;
    customerName: string;
    partyId?: string | null;
    grandTotal: number;
    /** Taxable value; when omitted, derived as grandTotal − GST. */
    subtotal?: number | null;
    taxCgst?: number | null;
    taxSgst?: number | null;
    taxIgst?: number | null;
    invoiceDate: string;
    notes?: string | null;
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(invoice.grandTotal);
  if (!(amt > 0)) return null;
  const cgst = round2(Math.max(0, Number(invoice.taxCgst) || 0));
  const sgst = round2(Math.max(0, Number(invoice.taxSgst) || 0));
  const igst = round2(Math.max(0, Number(invoice.taxIgst) || 0));
  const tax = round2(cgst + sgst + igst);
  let sales =
    invoice.subtotal != null && Number.isFinite(Number(invoice.subtotal))
      ? round2(Number(invoice.subtotal))
      : round2(amt - tax);
  // Keep voucher balanced if rounding drifts
  if (Math.abs(round2(sales + tax) - amt) > 0.009) {
    sales = round2(amt - tax);
  }

  const partyLedgerId = await resolvePartyLedgerId(client, tenantId, invoice.partyId, invoice.customerName);
  const salesLedgerId = await resolveSalesIncomeLedger(client, tenantId);
  const entries: Array<{ ledgerId: string; debit: number; credit: number }> = [
    { ledgerId: partyLedgerId, debit: amt, credit: 0 },
  ];
  if (sales > 0) {
    entries.push({ ledgerId: salesLedgerId, debit: 0, credit: sales });
  }
  if (tax > 0) {
    const gst = await ensureOutputGstLedgers(client, tenantId);
    if (cgst > 0) entries.push({ ledgerId: gst.cgst, debit: 0, credit: cgst });
    if (sgst > 0) entries.push({ ledgerId: gst.sgst, debit: 0, credit: sgst });
    if (igst > 0) entries.push({ ledgerId: gst.igst, debit: 0, credit: igst });
  }

  return insertVoucher(client, tenantId, {
    voucherType: 'sales',
    voucherDate: invoice.invoiceDate,
    voucherNumber: invoice.invoiceNumber || null,
    partyLedgerId,
    contraLedgerId: salesLedgerId,
    amount: amt,
    narration: invoice.notes || `Ops invoice ${invoice.invoiceNumber || invoice.id}`,
    externalRef: `ops:si:${invoice.id}`,
    entries,
  });
}

/** Drop the ops sales voucher for an invoice so it can be re-posted after an edit. */
export async function replaceStandaloneInvoiceBooks(
  client: PoolClient,
  tenantId: string,
  invoice: Parameters<typeof postStandaloneInvoiceToBooks>[2],
): Promise<string | null> {
  const externalRef = `ops:si:${invoice.id}`;
  const existing = (
    await client.query(`SELECT id FROM book_vouchers WHERE tenant_id = $1 AND external_ref = $2`, [
      tenantId,
      externalRef,
    ])
  ).rows[0] as { id: string } | undefined;
  if (existing) {
    await client.query(`DELETE FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2`, [
      tenantId,
      existing.id,
    ]);
    await client.query(`DELETE FROM book_voucher_items WHERE tenant_id = $1 AND voucher_id = $2`, [
      tenantId,
      existing.id,
    ]);
    await client.query(`DELETE FROM book_vouchers WHERE tenant_id = $1 AND id = $2`, [tenantId, existing.id]);
  }
  return postStandaloneInvoiceToBooks(client, tenantId, invoice);
}

/** Delete + re-post all ops sales vouchers from standalone_invoices (GST repair / resync). */
export async function resyncOpsInvoiceBooks(
  client: PoolClient,
  tenantId: string,
): Promise<{ repaired: number; skipped: number }> {
  await ensureNativeBooksDesk(client, tenantId);
  const invoices = (
    await client.query(
      `SELECT id, invoice_number, customer_name, party_id, grand_total, subtotal,
              tax_cgst, tax_sgst, tax_igst, invoice_date, notes
       FROM standalone_invoices
       WHERE tenant_id = $1 AND status IS DISTINCT FROM 'cancelled'
       ORDER BY invoice_date, created_at`,
      [tenantId],
    )
  ).rows as Array<{
    id: string;
    invoice_number: string | null;
    customer_name: string;
    party_id: string | null;
    grand_total: number;
    subtotal: number;
    tax_cgst: number | null;
    tax_sgst: number | null;
    tax_igst: number | null;
    invoice_date: string;
    notes: string | null;
  }>;

  let repaired = 0;
  let skipped = 0;
  for (const inv of invoices) {
    const externalRef = `ops:si:${inv.id}`;
    const existing = (
      await client.query(`SELECT id FROM book_vouchers WHERE tenant_id = $1 AND external_ref = $2`, [
        tenantId,
        externalRef,
      ])
    ).rows[0] as { id: string } | undefined;
    if (existing) {
      await client.query(`DELETE FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2`, [
        tenantId,
        existing.id,
      ]);
      await client.query(`DELETE FROM book_voucher_items WHERE tenant_id = $1 AND voucher_id = $2`, [
        tenantId,
        existing.id,
      ]);
      await client.query(`DELETE FROM book_vouchers WHERE tenant_id = $1 AND id = $2`, [tenantId, existing.id]);
    }
    const date =
      typeof inv.invoice_date === 'string'
        ? inv.invoice_date.slice(0, 10)
        : new Date(inv.invoice_date).toISOString().slice(0, 10);
    const posted = await postStandaloneInvoiceToBooks(client, tenantId, {
      id: inv.id,
      invoiceNumber: inv.invoice_number,
      customerName: inv.customer_name,
      partyId: inv.party_id,
      grandTotal: Number(inv.grand_total),
      subtotal: Number(inv.subtotal),
      taxCgst: Number(inv.tax_cgst) || 0,
      taxSgst: Number(inv.tax_sgst) || 0,
      taxIgst: Number(inv.tax_igst) || 0,
      invoiceDate: date,
      notes: inv.notes,
    });
    if (posted) repaired += 1;
    else skipped += 1;
  }
  return { repaired, skipped };
}

/** Invoice payment → Dr Cash/Bank, Cr Party (receipt) */
export async function postInvoicePaymentToBooks(
  client: PoolClient,
  tenantId: string,
  payment: {
    id: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string | null;
    notes?: string | null;
    partyId?: string | null;
    partyName: string;
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(payment.amount);
  if (!(amt > 0)) return null;
  const partyLedgerId = await resolvePartyLedgerId(client, tenantId, payment.partyId, payment.partyName);
  const cashLedgerId = await resolveCashBankLedger(client, tenantId, payment.paymentMethod);
  return insertVoucher(client, tenantId, {
    voucherType: 'receipt',
    voucherDate: payment.paymentDate,
    voucherNumber: payment.referenceNumber || null,
    partyLedgerId,
    contraLedgerId: cashLedgerId,
    amount: amt,
    narration: payment.notes || `Ops receipt ${payment.id}`,
    externalRef: `ops:ip:${payment.id}`,
    entries: [
      { ledgerId: cashLedgerId, debit: amt, credit: 0 },
      { ledgerId: partyLedgerId, debit: 0, credit: amt },
    ],
  });
}

async function resolveIncomeLedgerByHead(client: PoolClient, tenantId: string, incomeHead: string): Promise<string> {
  const name = (incomeHead || 'Other Income').trim() || 'Other Income';
  const byName = (
    await client.query(
      `SELECT id FROM book_ledgers
       WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)
       LIMIT 1`,
      [tenantId, name],
    )
  ).rows[0] as { id: string } | undefined;
  if (byName) return byName.id;
  const byIncome = (
    await client.query(
      `SELECT id FROM book_ledgers
       WHERE tenant_id = $1
         AND (ledger_type IN ('IN','JP') OR nature = 'I')
         AND LOWER(name) LIKE $2
       ORDER BY name
       LIMIT 1`,
      [tenantId, `%${name.toLowerCase()}%`],
    )
  ).rows[0] as { id: string } | undefined;
  if (byIncome) return byIncome.id;
  return ensureLedger(client, tenantId, `ops:INCOME:${name.slice(0, 60)}`, name, 'I', 'IN', 'ops:G-INCOME', 'Income');
}

/** Direct cash income → Dr Cash/Bank, Cr Income (no party AR). */
export async function postCashIncomeToBooks(
  client: PoolClient,
  tenantId: string,
  income: {
    id: string;
    amount: number;
    incomeDate: string;
    incomeHead: string;
    paymentMethod?: string | null;
    referenceNumber?: string | null;
    notes?: string | null;
    invoiceNumber?: string | null;
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(income.amount);
  if (!(amt > 0)) return null;
  const incomeLedgerId = await resolveIncomeLedgerByHead(client, tenantId, income.incomeHead);
  const cashLedgerId = await resolveCashBankLedger(client, tenantId, income.paymentMethod || 'Cash');
  return insertVoucher(client, tenantId, {
    voucherType: 'receipt',
    voucherDate: income.incomeDate,
    voucherNumber: income.referenceNumber || income.invoiceNumber || null,
    partyLedgerId: incomeLedgerId,
    contraLedgerId: cashLedgerId,
    amount: amt,
    narration: income.notes || `Cash income: ${income.incomeHead}`,
    externalRef: `ops:ci:${income.id}`,
    entries: [
      { ledgerId: cashLedgerId, debit: amt, credit: 0 },
      { ledgerId: incomeLedgerId, debit: 0, credit: amt },
    ],
  });
}

/** Expense → Dr Expense, Cr Cash/Bank */
export async function postExpenseToBooks(
  client: PoolClient,
  tenantId: string,
  expense: {
    id: string;
    amount: number;
    expenseDate: string;
    category?: string | null;
    description?: string | null;
    paymentMethod?: string | null;
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(expense.amount);
  if (!(amt > 0)) return null;
  const expenseLedgerId = await resolveExpenseLedger(client, tenantId, expense.category || null);
  const cashLedgerId = await resolveCashBankLedger(client, tenantId, expense.paymentMethod || 'Cash');
  return insertVoucher(client, tenantId, {
    voucherType: 'payment',
    voucherDate: expense.expenseDate,
    voucherNumber: null,
    partyLedgerId: expenseLedgerId,
    contraLedgerId: cashLedgerId,
    amount: amt,
    narration: expense.description || `Ops expense ${expense.id}`,
    externalRef: `ops:ex:${expense.id}`,
    entries: [
      { ledgerId: expenseLedgerId, debit: amt, credit: 0 },
      { ledgerId: cashLedgerId, debit: 0, credit: amt },
    ],
  });
}

/**
 * Distribution / dispatch batch → Books.
 * Manufacturer / dealer: Dr Party, Cr Sales (taxable) + Output GST; COGS Dr Purchase Cr Stock.
 * Retail (UI label “Purchase”): Dr Purchase Account, Cr Party (AP).
 */
export async function postDistributionBatchToBooks(
  client: PoolClient,
  tenantId: string,
  batch: {
    batchId: string;
    vendorId: string;
    vendorName: string;
    billValue: number;
    distributionDate: string;
    notes?: string | null;
    /** Force purchase posting; default = retail business type. */
    asPurchase?: boolean;
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(batch.billValue);
  if (!(amt > 0)) return null;

  let asPurchase = batch.asPurchase;
  if (asPurchase === undefined) {
    const bt = (await client.query(`SELECT business_type FROM tenants WHERE id = $1`, [tenantId])).rows[0] as
      { business_type?: string } | undefined;
    asPurchase = bt?.business_type === 'retail';
  }

  const partyLedgerId = await resolvePartyLedgerId(client, tenantId, batch.vendorId, batch.vendorName);

  if (asPurchase) {
    const purchaseLedgerId = await resolvePurchaseAccountLedger(client, tenantId);
    return insertVoucher(client, tenantId, {
      voucherType: 'purchase',
      voucherDate: batch.distributionDate,
      voucherNumber: batch.batchId,
      partyLedgerId,
      contraLedgerId: purchaseLedgerId,
      amount: amt,
      narration: batch.notes || `Ops purchase (distribution) ${batch.batchId}`,
      externalRef: `ops:dist:${batch.batchId}`,
      entries: [
        { ledgerId: purchaseLedgerId, debit: amt, credit: 0 },
        { ledgerId: partyLedgerId, debit: 0, credit: amt },
      ],
    });
  }

  const totals = (
    await client.query(
      `SELECT
         COALESCE(SUM(pd.billed_price), 0)::float AS billed,
         COALESCE(SUM(pd.net_price), 0)::float AS taxable,
         COALESCE(SUM(CASE WHEN COALESCE(pd.gst_applied, false)
           THEN GREATEST(0, COALESCE(pd.billed_price, 0) - COALESCE(pd.net_price, 0)) ELSE 0 END), 0)::float AS tax
       FROM product_distribution pd
       WHERE pd.tenant_id = $1 AND pd.batch_id = $2`,
      [tenantId, batch.batchId],
    )
  ).rows[0] as { billed: number; taxable: number; tax: number };
  const billed = round2(Number(totals?.billed) || amt);
  const tax = round2(Number(totals?.tax) || 0);
  let taxable = tax > 0 ? round2(Number(totals?.taxable) || billed - tax) : billed;
  if (Math.abs(round2(taxable + tax) - billed) > 0.009) taxable = round2(billed - tax);

  const vendorGst = (
    await client.query(`SELECT gst_number FROM vendors WHERE id = $1 AND tenant_id = $2`, [batch.vendorId, tenantId])
  ).rows[0] as { gst_number?: string | null } | undefined;
  const split = splitGst(tax, await tenantGstin(client, tenantId), vendorGst?.gst_number);
  const salesLedgerId = await resolveSalesIncomeLedger(client, tenantId);
  const entries: Array<{ ledgerId: string; debit: number; credit: number }> = [
    { ledgerId: partyLedgerId, debit: billed, credit: 0 },
  ];
  if (taxable > 0) entries.push({ ledgerId: salesLedgerId, debit: 0, credit: taxable });
  if (tax > 0) {
    pushGstLines(entries, await ensureOutputGstLedgers(client, tenantId), split, 'credit');
  }

  const voucherId = await insertVoucher(client, tenantId, {
    voucherType: 'sales',
    voucherDate: batch.distributionDate,
    voucherNumber: batch.batchId,
    partyLedgerId,
    contraLedgerId: salesLedgerId,
    amount: billed,
    narration: batch.notes || `Ops distribution ${batch.batchId}`,
    externalRef: `ops:dist:${batch.batchId}`,
    entries,
  });

  const cogsRow = (
    await client.query(
      `SELECT COALESCE(SUM(
         COALESCE(
           (SELECT AVG(pp.cost_price) FROM product_purchases pp
             WHERE pp.product_id = pd.product_id AND pp.tenant_id = pd.tenant_id AND pp.cost_price > 0),
           NULLIF(p.cost_price, 0)
         )
       ), 0)::float AS cogs
       FROM product_distribution pd
       JOIN products p ON p.id = pd.product_id AND p.tenant_id = pd.tenant_id
       WHERE pd.tenant_id = $1 AND pd.batch_id = $2`,
      [tenantId, batch.batchId],
    )
  ).rows[0] as { cogs: number };
  const cogs = round2(Number(cogsRow?.cogs) || 0);
  if (cogs > 0) {
    const stockLedgerId = await ensureStockLedger(client, tenantId);
    const purchaseLedgerId = await resolvePurchaseAccountLedger(client, tenantId);
    await insertVoucher(client, tenantId, {
      voucherType: 'journal',
      voucherDate: batch.distributionDate,
      voucherNumber: batch.batchId,
      partyLedgerId: purchaseLedgerId,
      contraLedgerId: stockLedgerId,
      amount: cogs,
      narration: `COGS ${batch.batchId}`,
      externalRef: `ops:cogs:${batch.batchId}`,
      entries: [
        { ledgerId: purchaseLedgerId, debit: cogs, credit: 0 },
        { ledgerId: stockLedgerId, debit: 0, credit: cogs },
      ],
    });
  }

  return voucherId;
}

/** Supplier purchase → Dr Stock + Input GST, Cr Supplier. Not a P&L expense until sold. */
export async function postPurchaseBatchToBooks(
  client: PoolClient,
  tenantId: string,
  batch: {
    batchId: string;
    supplierId: string;
    supplierName: string;
    billValue: number;
    purchaseDate: string;
    notes?: string | null;
    taxableValue?: number;
    taxAmount?: number;
    isRcm?: boolean;
    sellerGstin?: string | null;
    buyerGstin?: string | null;
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const billed = round2(batch.billValue);
  if (!(billed > 0)) return null;
  const tax = round2(Math.max(0, Number(batch.taxAmount) || 0));
  let taxable = round2(
    batch.taxableValue != null && Number.isFinite(Number(batch.taxableValue))
      ? Number(batch.taxableValue)
      : billed - tax,
  );
  if (taxable < 0) taxable = 0;
  if (!batch.isRcm && Math.abs(round2(taxable + tax) - billed) > 0.009) {
    taxable = round2(billed - tax);
  }

  const supplierLedgerId = await resolveSupplierLedgerId(client, tenantId, batch.supplierId, batch.supplierName);
  const stockLedgerId = await ensureStockLedger(client, tenantId);
  const sellerGstin = batch.sellerGstin ?? (await tenantGstin(client, tenantId));
  const split = splitGst(tax, sellerGstin, batch.buyerGstin);
  const entries: Array<{ ledgerId: string; debit: number; credit: number }> = [];
  if (taxable > 0) entries.push({ ledgerId: stockLedgerId, debit: taxable, credit: 0 });
  if (tax > 0) {
    pushGstLines(entries, await ensureInputGstLedgers(client, tenantId), split, 'debit');
  }
  if (batch.isRcm) {
    entries.push({ ledgerId: supplierLedgerId, debit: 0, credit: taxable > 0 ? taxable : billed });
    if (tax > 0) {
      pushGstLines(entries, await ensureOutputGstLedgers(client, tenantId), split, 'credit');
    }
  } else {
    entries.push({ ledgerId: supplierLedgerId, debit: 0, credit: billed });
  }

  return insertVoucher(client, tenantId, {
    voucherType: 'purchase',
    voucherDate: batch.purchaseDate,
    voucherNumber: batch.batchId,
    partyLedgerId: supplierLedgerId,
    contraLedgerId: stockLedgerId,
    amount: batch.isRcm ? taxable || billed : billed,
    narration: batch.notes || `Ops purchase ${batch.batchId}`,
    externalRef: `ops:pur:${batch.batchId}`,
    entries,
  });
}

/** Opening qty × cost → Dr Stock-in-Hand, Cr Opening Capital. Idempotent per product. */
export async function postOpeningStockToBooks(
  client: PoolClient,
  tenantId: string,
  opts: {
    productId: string;
    productName: string;
    qty: number;
    unitCost: number;
    asOfDate: string;
  },
): Promise<string | null> {
  const amt = round2((Number(opts.qty) || 0) * (Number(opts.unitCost) || 0));
  if (!(amt > 0)) return null;
  await ensureNativeBooksDesk(client, tenantId);
  const stockLedgerId = await ensureStockLedger(client, tenantId);
  const capitalLedgerId = await ensureOpeningCapitalLedger(client, tenantId);
  return insertVoucher(client, tenantId, {
    voucherType: 'journal',
    voucherDate: opts.asOfDate,
    voucherNumber: null,
    partyLedgerId: stockLedgerId,
    contraLedgerId: capitalLedgerId,
    amount: amt,
    narration: `Opening stock — ${opts.productName}`,
    externalRef: `ops:openstock:${opts.productId}`,
    entries: [
      { ledgerId: stockLedgerId, debit: amt, credit: 0 },
      { ledgerId: capitalLedgerId, debit: 0, credit: amt },
    ],
  });
}

/** Supplier payment → Dr Supplier, Cr Cash/Bank. */
export async function postSupplierPaymentToBooks(
  client: PoolClient,
  tenantId: string,
  payment: {
    id: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string | null;
    notes?: string | null;
    supplierId?: string | null;
    supplierName: string;
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(payment.amount);
  if (!(amt > 0)) return null;
  const supplierLedgerId = await resolveSupplierLedgerId(client, tenantId, payment.supplierId, payment.supplierName);
  const cashLedgerId = await resolveCashBankLedger(client, tenantId, payment.paymentMethod);
  return insertVoucher(client, tenantId, {
    voucherType: 'payment',
    voucherDate: payment.paymentDate,
    voucherNumber: payment.referenceNumber || null,
    partyLedgerId: supplierLedgerId,
    contraLedgerId: cashLedgerId,
    amount: amt,
    narration: payment.notes || `Ops supplier payment ${payment.id}`,
    externalRef: `ops:sp:${payment.id}`,
    entries: [
      { ledgerId: supplierLedgerId, debit: amt, credit: 0 },
      { ledgerId: cashLedgerId, debit: 0, credit: amt },
    ],
  });
}

/** Vendor / dealer payment → Dr Cash/Bank, Cr Party (receipt).
 * Retail purchase path → Dr Party, Cr Cash/Bank (payment against AP). */
export async function postVendorPaymentToBooks(
  client: PoolClient,
  tenantId: string,
  payment: {
    id: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string | null;
    notes?: string | null;
    vendorId?: string | null;
    vendorName: string;
    /** Force AP payment posting; default = retail business type. */
    asPurchasePayment?: boolean;
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(payment.amount);
  if (!(amt > 0)) return null;
  const partyLedgerId = await resolvePartyLedgerId(client, tenantId, payment.vendorId, payment.vendorName);
  const cashLedgerId = await resolveCashBankLedger(client, tenantId, payment.paymentMethod);

  let asPurchasePayment = payment.asPurchasePayment;
  if (asPurchasePayment === undefined) {
    const bt = (await client.query(`SELECT business_type FROM tenants WHERE id = $1`, [tenantId])).rows[0] as
      { business_type?: string } | undefined;
    asPurchasePayment = bt?.business_type === 'retail';
  }

  if (asPurchasePayment) {
    return insertVoucher(client, tenantId, {
      voucherType: 'payment',
      voucherDate: payment.paymentDate,
      voucherNumber: payment.referenceNumber || null,
      partyLedgerId,
      contraLedgerId: cashLedgerId,
      amount: amt,
      narration: payment.notes || `Ops purchase payment ${payment.id}`,
      externalRef: `ops:vp:${payment.id}`,
      entries: [
        { ledgerId: partyLedgerId, debit: amt, credit: 0 },
        { ledgerId: cashLedgerId, debit: 0, credit: amt },
      ],
    });
  }

  return insertVoucher(client, tenantId, {
    voucherType: 'receipt',
    voucherDate: payment.paymentDate,
    voucherNumber: payment.referenceNumber || null,
    partyLedgerId,
    contraLedgerId: cashLedgerId,
    amount: amt,
    narration: payment.notes || `Ops vendor payment ${payment.id}`,
    externalRef: `ops:vp:${payment.id}`,
    entries: [
      { ledgerId: cashLedgerId, debit: amt, credit: 0 },
      { ledgerId: partyLedgerId, debit: 0, credit: amt },
    ],
  });
}

/** Barcode sale → Dr Cash, Cr Sales Income. */
export async function postSaleToBooks(
  client: PoolClient,
  tenantId: string,
  sale: {
    id: string;
    amount: number;
    saleDate: string;
    customerName?: string | null;
    paymentMethod?: string | null;
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(sale.amount);
  if (!(amt > 0)) return null;
  const cashLedgerId = await resolveCashBankLedger(client, tenantId, sale.paymentMethod || 'Cash');
  const salesLedgerId = await resolveSalesIncomeLedger(client, tenantId);
  return insertVoucher(client, tenantId, {
    voucherType: 'sales',
    voucherDate: sale.saleDate,
    voucherNumber: null,
    partyLedgerId: cashLedgerId,
    contraLedgerId: salesLedgerId,
    amount: amt,
    narration: sale.customerName ? `Sale — ${sale.customerName}` : `Ops sale ${sale.id}`,
    externalRef: `ops:sale:${sale.id}`,
    entries: [
      { ledgerId: cashLedgerId, debit: amt, credit: 0 },
      { ledgerId: salesLedgerId, debit: 0, credit: amt },
    ],
  });
}

/** Staff payment → Dr Salary/Expense ledger, Cr Cash. */
export async function postStaffPaymentToBooks(
  client: PoolClient,
  tenantId: string,
  payment: {
    id: string;
    amount: number;
    paymentDate: string;
    staffName: string;
    paymentType: string;
    paymentMethod?: string | null;
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(Math.abs(payment.amount));
  if (!(amt > 0)) return null;
  const category =
    payment.paymentType === 'advance'
      ? 'Staff Advance'
      : payment.paymentType === 'bonus'
        ? 'Staff Bonus'
        : 'Staff Salary';
  const expenseLedgerId = await resolveExpenseLedger(client, tenantId, category);
  const cashLedgerId = await resolveCashBankLedger(client, tenantId, payment.paymentMethod || 'Cash');
  return insertVoucher(client, tenantId, {
    voucherType: 'payment',
    voucherDate: payment.paymentDate,
    voucherNumber: null,
    partyLedgerId: expenseLedgerId,
    contraLedgerId: cashLedgerId,
    amount: amt,
    narration: `${category} — ${payment.staffName}`,
    externalRef: `ops:sp:${payment.id}`,
    entries: [
      { ledgerId: expenseLedgerId, debit: amt, credit: 0 },
      { ledgerId: cashLedgerId, debit: 0, credit: amt },
    ],
  });
}
