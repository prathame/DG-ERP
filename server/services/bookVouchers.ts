/**
 * Manual Books voucher create — Miracle-shaped desk (receipt / payment / journal / contra).
 * Persists to book_vouchers + book_voucher_entries.
 * Receipt/payment dual-write to Invoice Finance when party ledger maps to a vendor.
 */
import type { PoolClient } from 'pg';
import { uid } from '../utils/helpers';
import { resolveMiraclePaymentMethod } from './miracleImport';
import { allocatePartyReceipt, resolveVendorForBookLedger, upsertVendorPayment } from './partyCashOps';

export const BOOK_VOUCHER_TYPES = [
  'receipt',
  'payment',
  'journal',
  'contra',
  'sales',
  'credit_note',
  'debit_note',
] as const;
export type BookVoucherType = (typeof BOOK_VOUCHER_TYPES)[number];

export interface BookVoucherEntryInput {
  ledgerId: string;
  debit?: number;
  credit?: number;
  narration?: string | null;
}

export interface CreateBookVoucherInput {
  voucherType: BookVoucherType;
  voucherDate: string;
  voucherNumber?: string | null;
  narration?: string | null;
  /** Two-ledger vouchers: party (or “to”) ledger */
  partyLedgerId?: string | null;
  /** Two-ledger vouchers: cash/bank (or “from”) ledger */
  contraLedgerId?: string | null;
  amount?: number;
  /** Journal: explicit lines (must balance). Ignored for simple types if amount+ledgers given. */
  entries?: BookVoucherEntryInput[];
}

export class BookVoucherValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BookVoucherValidationError';
  }
}

export class BookVoucherNotFoundError extends Error {
  readonly status = 404;
  constructor(message = 'Voucher not found') {
    super(message);
    this.name = 'BookVoucherNotFoundError';
  }
}

export interface BookVoucherOpsResult {
  dualWrite: 'receipt' | 'payment' | 'skipped';
  reason?: string;
  vendorId?: string;
  vendorName?: string;
  paymentMethod?: string;
  invoicePayments?: number;
  vendorPayments?: number;
  billMatched?: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
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
  // Indian FY label: Apr–Mar
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

async function assertLedgersExist(client: PoolClient, tenantId: string, ledgerIds: string[]): Promise<void> {
  const unique = [...new Set(ledgerIds.filter(Boolean))];
  if (!unique.length) throw new BookVoucherValidationError('At least one ledger is required');
  const { rows } = await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND id = ANY($2::text[])`, [
    tenantId,
    unique,
  ]);
  if (rows.length !== unique.length) {
    throw new BookVoucherValidationError('One or more ledgers were not found');
  }
}

function buildSimpleEntries(
  voucherType: 'receipt' | 'payment' | 'contra' | 'sales' | 'credit_note' | 'debit_note',
  partyLedgerId: string,
  contraLedgerId: string,
  amount: number,
): BookVoucherEntryInput[] {
  const amt = round2(amount);
  if (!(amt > 0)) throw new BookVoucherValidationError('Amount must be greater than zero');
  if (partyLedgerId === contraLedgerId) {
    throw new BookVoucherValidationError('Party and contra ledgers must be different');
  }
  if (voucherType === 'receipt') {
    // Debit cash/bank, Credit party
    return [
      { ledgerId: contraLedgerId, debit: amt, credit: 0 },
      { ledgerId: partyLedgerId, debit: 0, credit: amt },
    ];
  }
  if (voucherType === 'payment') {
    // Debit party, Credit cash/bank
    return [
      { ledgerId: partyLedgerId, debit: amt, credit: 0 },
      { ledgerId: contraLedgerId, debit: 0, credit: amt },
    ];
  }
  if (voucherType === 'sales' || voucherType === 'debit_note') {
    // Debit party (AR), Credit sales / income (DN = additional charge)
    return [
      { ledgerId: partyLedgerId, debit: amt, credit: 0 },
      { ledgerId: contraLedgerId, debit: 0, credit: amt },
    ];
  }
  if (voucherType === 'credit_note') {
    // Sales return / CN: Debit sales (or return), Credit party
    return [
      { ledgerId: contraLedgerId, debit: amt, credit: 0 },
      { ledgerId: partyLedgerId, debit: 0, credit: amt },
    ];
  }
  // contra: transfer from contra (credit) → party/to (debit)
  return [
    { ledgerId: partyLedgerId, debit: amt, credit: 0 },
    { ledgerId: contraLedgerId, debit: 0, credit: amt },
  ];
}

function normalizeEntries(entries: BookVoucherEntryInput[]): Array<{
  ledgerId: string;
  debit: number;
  credit: number;
  narration: string | null;
}> {
  const out = entries.map(e => {
    const debit = round2(Math.max(0, Number(e.debit) || 0));
    const credit = round2(Math.max(0, Number(e.credit) || 0));
    if (debit > 0 && credit > 0) {
      throw new BookVoucherValidationError('A line cannot have both debit and credit');
    }
    if (debit <= 0 && credit <= 0) {
      throw new BookVoucherValidationError('Each line needs a debit or credit amount');
    }
    if (!e.ledgerId) throw new BookVoucherValidationError('Each line needs a ledger');
    return {
      ledgerId: e.ledgerId,
      debit,
      credit,
      narration: e.narration?.trim() || null,
    };
  });
  if (out.length < 2) throw new BookVoucherValidationError('At least two ledger lines are required');
  const debits = round2(out.reduce((s, e) => s + e.debit, 0));
  const credits = round2(out.reduce((s, e) => s + e.credit, 0));
  if (Math.abs(debits - credits) > 0.009) {
    throw new BookVoucherValidationError(`Voucher is not balanced (debit ₹${debits} ≠ credit ₹${credits})`);
  }
  return out;
}

async function dualWritePartyCash(
  client: PoolClient,
  tenantId: string,
  voucherId: string,
  voucherType: 'receipt' | 'payment',
  partyLedgerId: string | null,
  contraLedgerId: string | null,
  amount: number,
  voucherDate: string,
  voucherNumber: string | null,
  narration: string | null,
): Promise<BookVoucherOpsResult> {
  if (!partyLedgerId) {
    return { dualWrite: 'skipped', reason: 'No party ledger' };
  }
  const vendor = await resolveVendorForBookLedger(client, tenantId, partyLedgerId);
  if (!vendor) {
    return { dualWrite: 'skipped', reason: 'Party ledger is not linked to a vendor' };
  }

  let contraType: string | null = null;
  let contraName: string | null = null;
  let contraGroup: string | null = null;
  if (contraLedgerId) {
    const contra = (
      await client.query(
        `SELECT l.name, l.ledger_type, g.name AS group_name
         FROM book_ledgers l
         LEFT JOIN book_account_groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
         WHERE l.tenant_id = $1 AND l.id = $2`,
        [tenantId, contraLedgerId],
      )
    ).rows[0] as { name: string; ledger_type: string | null; group_name: string | null } | undefined;
    if (contra) {
      contraType = contra.ledger_type;
      contraName = contra.name;
      contraGroup = contra.group_name;
    }
  }

  const paymentMethod = resolveMiraclePaymentMethod({
    contraLedgerType: contraType,
    contraLedgerName: contraName,
    contraGroupName: contraGroup,
    instrumentRef: voucherNumber,
  });
  const idempotencyBase = `books:${voucherId}`;
  const via = contraName ? ` via ${contraName}` : '';
  const noteBody = narration ? `${narration}${via}` : null;

  if (voucherType === 'receipt') {
    const allocated = await allocatePartyReceipt(
      client,
      tenantId,
      vendor.vendorId,
      amount,
      voucherDate,
      paymentMethod,
      voucherNumber,
      idempotencyBase,
      noteBody || `Books receipt${via}`,
      [],
      'Books receipt',
    );
    return {
      dualWrite: 'receipt',
      vendorId: vendor.vendorId,
      vendorName: vendor.vendorName,
      paymentMethod,
      invoicePayments: allocated.invoicePayments,
      vendorPayments: allocated.vendorPayments,
      billMatched: allocated.billMatched,
    };
  }

  const ok = await upsertVendorPayment(
    client,
    tenantId,
    vendor.vendorId,
    amount,
    voucherDate,
    paymentMethod,
    voucherNumber,
    noteBody ? `Books payment: ${noteBody}` : `Books payment${via}`,
    idempotencyBase,
  );
  return {
    dualWrite: 'payment',
    vendorId: vendor.vendorId,
    vendorName: vendor.vendorName,
    paymentMethod,
    vendorPayments: ok ? 1 : 0,
  };
}

export async function createBookVoucher(
  client: PoolClient,
  tenantId: string,
  input: CreateBookVoucherInput,
): Promise<{ id: string; voucherType: string; amount: number; ops: BookVoucherOpsResult }> {
  if (!BOOK_VOUCHER_TYPES.includes(input.voucherType)) {
    throw new BookVoucherValidationError(`Unsupported voucher type: ${input.voucherType}`);
  }
  const voucherDate = (input.voucherDate || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(voucherDate)) {
    throw new BookVoucherValidationError('voucherDate must be YYYY-MM-DD');
  }

  let lines: ReturnType<typeof normalizeEntries>;
  let partyLedgerId: string | null = input.partyLedgerId || null;
  let contraLedgerId: string | null = input.contraLedgerId || null;
  let amount = round2(Number(input.amount) || 0);

  if (input.voucherType === 'journal') {
    if (!input.entries?.length) {
      throw new BookVoucherValidationError('Journal vouchers require entry lines');
    }
    lines = normalizeEntries(input.entries);
    amount = round2(lines.reduce((s, e) => s + e.debit, 0));
    partyLedgerId = lines[0]?.ledgerId || null;
    contraLedgerId = lines[1]?.ledgerId || null;
  } else {
    if (!partyLedgerId || !contraLedgerId) {
      throw new BookVoucherValidationError(
        input.voucherType === 'contra'
          ? 'Contra requires from (contra) and to (party) ledgers'
          : input.voucherType === 'sales' || input.voucherType === 'credit_note' || input.voucherType === 'debit_note'
            ? 'Party and sales/return ledgers are required'
            : 'Party and cash/bank ledgers are required',
      );
    }
    if (input.entries?.length) {
      lines = normalizeEntries(input.entries);
      amount = round2(lines.reduce((s, e) => s + e.debit, 0));
    } else {
      lines = normalizeEntries(buildSimpleEntries(input.voucherType, partyLedgerId, contraLedgerId, amount));
    }
  }

  await assertLedgersExist(
    client,
    tenantId,
    lines.map(l => l.ledgerId),
  );

  const financialYearId = await resolveFinancialYearId(client, tenantId, voucherDate);
  const voucherId = uid('BV');
  const externalRef = `manual:${voucherId}`;

  await client.query(
    `INSERT INTO book_vouchers
       (id, tenant_id, financial_year_id, voucher_type, voucher_date, voucher_number,
        party_ledger_id, contra_ledger_id, amount, narration, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
    [
      voucherId,
      tenantId,
      financialYearId,
      input.voucherType,
      voucherDate,
      input.voucherNumber?.trim() || null,
      partyLedgerId,
      contraLedgerId,
      amount,
      input.narration?.trim() || null,
      externalRef,
    ],
  );

  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    await client.query(
      `INSERT INTO book_voucher_entries
         (id, tenant_id, voucher_id, line_no, ledger_id, debit, credit, narration, external_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uid('BE'),
        tenantId,
        voucherId,
        lineNo,
        line.ledgerId,
        line.debit,
        line.credit,
        line.narration,
        `${externalRef}:${lineNo}`,
      ],
    );
  }

  let ops: BookVoucherOpsResult = { dualWrite: 'skipped', reason: 'Not a receipt/payment voucher' };
  if (input.voucherType === 'receipt' || input.voucherType === 'payment') {
    ops = await dualWritePartyCash(
      client,
      tenantId,
      voucherId,
      input.voucherType,
      partyLedgerId,
      contraLedgerId,
      amount,
      voucherDate,
      input.voucherNumber?.trim() || null,
      input.narration?.trim() || null,
    );
  }

  return { id: voucherId, voucherType: input.voucherType, amount, ops };
}

async function clearBooksDualWritePayments(client: PoolClient, tenantId: string, voucherId: string): Promise<void> {
  const base = `books:${voucherId}`;
  const removed = await client.query(
    `DELETE FROM invoice_payments WHERE tenant_id = $1 AND idempotency_key LIKE $2 RETURNING invoice_id`,
    [tenantId, `${base}:%`],
  );
  await client.query(`DELETE FROM vendor_payments WHERE tenant_id = $1 AND idempotency_key = $2`, [tenantId, base]);
  const invoiceIds = [...new Set((removed.rows as { invoice_id: string }[]).map(r => r.invoice_id))];
  for (const invoiceId of invoiceIds) {
    const paid = Number(
      (
        await client.query(
          `SELECT COALESCE(SUM(amount),0)::float AS paid FROM invoice_payments WHERE tenant_id = $1 AND invoice_id = $2`,
          [tenantId, invoiceId],
        )
      ).rows[0]?.paid || 0,
    );
    const grand = Number(
      (
        await client.query(`SELECT grand_total::float AS g FROM standalone_invoices WHERE tenant_id = $1 AND id = $2`, [
          tenantId,
          invoiceId,
        ])
      ).rows[0]?.g || 0,
    );
    const status = paid >= grand - 0.001 && grand > 0 ? 'paid' : 'sent';
    await client.query(
      `UPDATE standalone_invoices SET status = $1, updated_at = NOW() WHERE tenant_id = $2 AND id = $3`,
      [status, tenantId, invoiceId],
    );
  }
}

async function loadVoucherRow(client: PoolClient, tenantId: string, voucherId: string) {
  const row = (
    await client.query(
      `SELECT id, voucher_type, voucher_date, voucher_number, party_ledger_id, contra_ledger_id,
              amount::float AS amount, narration, external_ref, financial_year_id
       FROM book_vouchers WHERE tenant_id = $1 AND id = $2`,
      [tenantId, voucherId],
    )
  ).rows[0] as
    | {
        id: string;
        voucher_type: string;
        voucher_date: string | Date;
        voucher_number: string | null;
        party_ledger_id: string | null;
        contra_ledger_id: string | null;
        amount: number;
        narration: string | null;
        external_ref: string | null;
        financial_year_id: string | null;
      }
    | undefined;
  if (!row) throw new BookVoucherNotFoundError();
  return row;
}

function asIsoDate(value: string | Date): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value || '');
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

function isManualVoucher(externalRef: string | null | undefined): boolean {
  return String(externalRef || '').startsWith('manual:');
}

export async function deleteBookVoucher(
  client: PoolClient,
  tenantId: string,
  voucherId: string,
): Promise<{ id: string; voucherType: string }> {
  const row = await loadVoucherRow(client, tenantId, voucherId);
  if (isManualVoucher(row.external_ref) && (row.voucher_type === 'receipt' || row.voucher_type === 'payment')) {
    await clearBooksDualWritePayments(client, tenantId, voucherId);
  }

  await client.query(
    `DELETE FROM book_bank_recon_marks
     WHERE tenant_id = $1 AND entry_id IN (
       SELECT id FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2
     )`,
    [tenantId, voucherId],
  );
  await client.query(`DELETE FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2`, [
    tenantId,
    voucherId,
  ]);
  await client.query(`DELETE FROM book_voucher_items WHERE tenant_id = $1 AND voucher_id = $2`, [tenantId, voucherId]);
  await client.query(`DELETE FROM book_vouchers WHERE tenant_id = $1 AND id = $2`, [tenantId, voucherId]);
  return { id: voucherId, voucherType: row.voucher_type };
}

export type UpdateBookVoucherInput = {
  voucherDate?: string;
  voucherNumber?: string | null;
  narration?: string | null;
  partyLedgerId?: string | null;
  contraLedgerId?: string | null;
  amount?: number;
  entries?: BookVoucherEntryInput[];
};

export async function updateBookVoucher(
  client: PoolClient,
  tenantId: string,
  voucherId: string,
  input: UpdateBookVoucherInput,
): Promise<{ id: string; voucherType: string; amount: number; ops: BookVoucherOpsResult }> {
  const row = await loadVoucherRow(client, tenantId, voucherId);
  const voucherType = row.voucher_type;
  const manual = isManualVoucher(row.external_ref);
  const bodyEditRequested =
    input.partyLedgerId !== undefined ||
    input.contraLedgerId !== undefined ||
    input.amount !== undefined ||
    input.entries !== undefined;

  if (bodyEditRequested && !manual) {
    throw new BookVoucherValidationError('Ops dual-write vouchers only allow date / number / narration edits');
  }
  if (bodyEditRequested && !BOOK_VOUCHER_TYPES.includes(voucherType as BookVoucherType)) {
    throw new BookVoucherValidationError(`Cannot rebuild entries for voucher type: ${voucherType}`);
  }

  const voucherDateRaw =
    input.voucherDate !== undefined ? String(input.voucherDate || '').trim() : asIsoDate(row.voucher_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(voucherDateRaw)) {
    throw new BookVoucherValidationError('voucherDate must be YYYY-MM-DD');
  }

  const voucherNumber = input.voucherNumber !== undefined ? input.voucherNumber?.trim() || null : row.voucher_number;
  const narration = input.narration !== undefined ? input.narration?.trim() || null : row.narration;

  if (!bodyEditRequested) {
    const financialYearId = await resolveFinancialYearId(client, tenantId, voucherDateRaw);
    await client.query(
      `UPDATE book_vouchers
       SET voucher_date = $1, voucher_number = $2, narration = $3, financial_year_id = $4
       WHERE tenant_id = $5 AND id = $6`,
      [voucherDateRaw, voucherNumber, narration, financialYearId, tenantId, voucherId],
    );
    return {
      id: voucherId,
      voucherType,
      amount: round2(Number(row.amount) || 0),
      ops: { dualWrite: 'skipped', reason: 'Header-only update' },
    };
  }

  // Rebuild body (manual vouchers only)
  let lines: ReturnType<typeof normalizeEntries>;
  let partyLedgerId: string | null =
    input.partyLedgerId !== undefined ? input.partyLedgerId || null : row.party_ledger_id;
  let contraLedgerId: string | null =
    input.contraLedgerId !== undefined ? input.contraLedgerId || null : row.contra_ledger_id;
  let amount = input.amount !== undefined ? round2(Number(input.amount) || 0) : round2(Number(row.amount) || 0);

  if (voucherType === 'journal') {
    if (!input.entries?.length) {
      throw new BookVoucherValidationError('Journal vouchers require entry lines');
    }
    lines = normalizeEntries(input.entries);
    amount = round2(lines.reduce((s, e) => s + e.debit, 0));
    partyLedgerId = lines[0]?.ledgerId || null;
    contraLedgerId = lines[1]?.ledgerId || null;
  } else {
    if (!partyLedgerId || !contraLedgerId) {
      throw new BookVoucherValidationError('Party and contra ledgers are required');
    }
    if (input.entries?.length) {
      lines = normalizeEntries(input.entries);
      amount = round2(lines.reduce((s, e) => s + e.debit, 0));
    } else {
      lines = normalizeEntries(
        buildSimpleEntries(
          voucherType as 'receipt' | 'payment' | 'contra' | 'sales' | 'credit_note' | 'debit_note',
          partyLedgerId,
          contraLedgerId,
          amount,
        ),
      );
    }
  }

  await assertLedgersExist(
    client,
    tenantId,
    lines.map(l => l.ledgerId),
  );

  if (voucherType === 'receipt' || voucherType === 'payment') {
    await clearBooksDualWritePayments(client, tenantId, voucherId);
  }

  await client.query(
    `DELETE FROM book_bank_recon_marks
     WHERE tenant_id = $1 AND entry_id IN (
       SELECT id FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2
     )`,
    [tenantId, voucherId],
  );
  await client.query(`DELETE FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2`, [
    tenantId,
    voucherId,
  ]);

  const financialYearId = await resolveFinancialYearId(client, tenantId, voucherDateRaw);
  await client.query(
    `UPDATE book_vouchers
     SET voucher_date = $1, voucher_number = $2, narration = $3, financial_year_id = $4,
         party_ledger_id = $5, contra_ledger_id = $6, amount = $7
     WHERE tenant_id = $8 AND id = $9`,
    [
      voucherDateRaw,
      voucherNumber,
      narration,
      financialYearId,
      partyLedgerId,
      contraLedgerId,
      amount,
      tenantId,
      voucherId,
    ],
  );

  const externalRef = row.external_ref || `manual:${voucherId}`;
  let lineNo = 0;
  for (const line of lines) {
    lineNo++;
    await client.query(
      `INSERT INTO book_voucher_entries
         (id, tenant_id, voucher_id, line_no, ledger_id, debit, credit, narration, external_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        uid('BE'),
        tenantId,
        voucherId,
        lineNo,
        line.ledgerId,
        line.debit,
        line.credit,
        line.narration,
        `${externalRef}:${lineNo}`,
      ],
    );
  }

  let ops: BookVoucherOpsResult = { dualWrite: 'skipped', reason: 'Not a receipt/payment voucher' };
  if (voucherType === 'receipt' || voucherType === 'payment') {
    ops = await dualWritePartyCash(
      client,
      tenantId,
      voucherId,
      voucherType,
      partyLedgerId,
      contraLedgerId,
      amount,
      voucherDateRaw,
      voucherNumber,
      narration,
    );
  }

  return { id: voucherId, voucherType, amount, ops };
}
