/**
 * Ops → Books dual-write (invoice / payment / expense / distribution / vendor payment).
 * Idempotent via book_vouchers.external_ref.
 * Native tenants get a minimal COA on first use — Miracle import is optional data, not a gate.
 * Does not call createBookVoucher receipt dual-write (would loop into invoice_payments).
 */
import type { PoolClient } from 'pg';
import { uid } from '../utils/helpers';
import { round2 } from './bookReports';

/**
 * Ensure Cash / Bank / Sales Income (+ party ledgers for existing clients) exist.
 * Safe to call on every Books list/summary and before ops dual-write.
 */
export async function ensureNativeBooksDesk(client: PoolClient, tenantId: string): Promise<void> {
  await ensureLedger(client, tenantId, 'ops:CASH', 'Cash Account', 'B', 'CS', 'ops:G-CASH', 'Cash-in-Hand');
  await ensureLedger(client, tenantId, 'ops:BANK', 'Bank Account', 'B', 'BK', 'ops:G-BANK', 'Bank Accounts');
  await ensureLedger(client, tenantId, 'ops:SALES_INCOME', 'Sales Income', 'I', 'IN', 'ops:G-INCOME', 'Income');
  await ensureOutputGstLedgers(client, tenantId);
  const vendors = (
    await client.query(`SELECT id, name FROM vendors WHERE tenant_id = $1 ORDER BY name LIMIT 500`, [tenantId])
  ).rows as { id: string; name: string }[];
  for (const v of vendors) {
    await resolvePartyLedgerId(client, tenantId, v.id, v.name);
  }
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

/** Delete all Books rows for a tenant, then re-seed Cash / Bank / Sales + party ledgers. */
export async function wipeNativeBooksDesk(
  client: PoolClient,
  tenantId: string,
): Promise<{ deleted: Record<string, number> }> {
  const deleted: Record<string, number> = {};
  const tables = [
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

async function resolveCashBankLedger(client: PoolClient, tenantId: string, paymentMethod: string): Promise<string> {
  const method = (paymentMethod || 'Cash').toLowerCase();
  const wantBank = /bank|neft|rtgs|upi|cheque|card|online|transfer/.test(method);
  if (wantBank) {
    const bank = (
      await client.query(
        `SELECT id FROM book_ledgers WHERE tenant_id = $1 AND ledger_type = 'BK' ORDER BY name LIMIT 1`,
        [tenantId],
      )
    ).rows[0] as { id: string } | undefined;
    if (bank) return bank.id;
    return ensureLedger(client, tenantId, 'ops:BANK', 'Bank Account', 'B', 'BK', 'ops:G-BANK', 'Bank Accounts');
  }
  const cash = (
    await client.query(
      `SELECT id FROM book_ledgers WHERE tenant_id = $1 AND ledger_type = 'CS' ORDER BY name LIMIT 1`,
      [tenantId],
    )
  ).rows[0] as { id: string } | undefined;
  if (cash) return cash.id;
  return ensureLedger(client, tenantId, 'ops:CASH', 'Cash Account', 'B', 'CS', 'ops:G-CASH', 'Cash-in-Hand');
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
 * Distribution / dispatch batch → Dr Party (vendor), Cr Sales Income.
 * Manufacturer / dealer / retail / silver path (billable units to a party).
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
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(batch.billValue);
  if (!(amt > 0)) return null;
  const partyLedgerId = await resolvePartyLedgerId(client, tenantId, batch.vendorId, batch.vendorName);
  const salesLedgerId = await resolveSalesIncomeLedger(client, tenantId);
  return insertVoucher(client, tenantId, {
    voucherType: 'sales',
    voucherDate: batch.distributionDate,
    voucherNumber: batch.batchId,
    partyLedgerId,
    contraLedgerId: salesLedgerId,
    amount: amt,
    narration: batch.notes || `Ops distribution ${batch.batchId}`,
    externalRef: `ops:dist:${batch.batchId}`,
    entries: [
      { ledgerId: partyLedgerId, debit: amt, credit: 0 },
      { ledgerId: salesLedgerId, debit: 0, credit: amt },
    ],
  });
}

/** Vendor / dealer payment → Dr Cash/Bank, Cr Party (receipt). */
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
  },
): Promise<string | null> {
  await ensureNativeBooksDesk(client, tenantId);
  const amt = round2(payment.amount);
  if (!(amt > 0)) return null;
  const partyLedgerId = await resolvePartyLedgerId(client, tenantId, payment.vendorId, payment.vendorName);
  const cashLedgerId = await resolveCashBankLedger(client, tenantId, payment.paymentMethod);
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
