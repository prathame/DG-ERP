/**
 * Manual Books voucher create — Miracle-shaped desk (receipt / payment / journal / contra).
 * Persists to book_vouchers + book_voucher_entries.
 * Receipt/payment dual-write to Invoice Finance when party ledger maps to a vendor.
 */
import type { PoolClient } from 'pg';
import { uid } from '../utils/helpers';
import { resolveMiraclePaymentMethod } from './miracleImport';
import { allocatePartyReceipt, resolveVendorForBookLedger, upsertVendorPayment } from './partyCashOps';

export const BOOK_VOUCHER_TYPES = ['receipt', 'payment', 'journal', 'contra', 'sales'] as const;
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
  voucherType: 'receipt' | 'payment' | 'contra' | 'sales',
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
  if (voucherType === 'sales') {
    // Debit party (AR), Credit sales income
    return [
      { ledgerId: partyLedgerId, debit: amt, credit: 0 },
      { ledgerId: contraLedgerId, debit: 0, credit: amt },
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
          : input.voucherType === 'sales'
            ? 'Party and sales income ledgers are required'
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
