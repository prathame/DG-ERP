/**
 * Books chart of accounts — ledger group + ledger CRUD and opening balances.
 * Complements Miracle import / ops dual-write so tenants can maintain COA natively.
 */
import type { PoolClient } from 'pg';
import { uid } from '../utils/helpers';

export const BOOK_NATURES = ['A', 'L', 'I', 'E', 'B'] as const;
export type BookNature = (typeof BOOK_NATURES)[number];

/** Common Miracle / desk ledger types (free-form TEXT in DB; these are suggested). */
export const BOOK_LEDGER_TYPES = ['CS', 'BK', 'PR', 'IN', 'EX', 'LI', 'GL'] as const;

export class BookCoaValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'BookCoaValidationError';
  }
}

export class BookCoaNotFoundError extends Error {
  readonly status = 404;
  constructor(message: string) {
    super(message);
    this.name = 'BookCoaNotFoundError';
  }
}

export interface BookGroupInput {
  name: string;
  nature?: string | null;
  parentId?: string | null;
  groupCode?: string | null;
}

export interface BookLedgerInput {
  name: string;
  groupId?: string | null;
  nature?: string | null;
  ledgerType?: string | null;
  gstin?: string | null;
  openingBalance?: number | null;
  openingSide?: string | null;
  /** Optional party contact fields → book_ledger_details */
  contactPerson?: string | null;
  city?: string | null;
  state?: string | null;
  mobile?: string | null;
  phone?: string | null;
  email?: string | null;
  address1?: string | null;
}

function normalizeName(name: unknown): string {
  const n = String(name || '').trim();
  if (!n) throw new BookCoaValidationError('Name is required');
  if (n.length > 200) throw new BookCoaValidationError('Name is too long');
  return n;
}

function normalizeNature(nature: unknown): string | null {
  if (nature == null || nature === '') return null;
  const n = String(nature).trim().toUpperCase();
  if (!(BOOK_NATURES as readonly string[]).includes(n)) {
    throw new BookCoaValidationError(`nature must be one of: ${BOOK_NATURES.join(', ')}`);
  }
  return n;
}

function normalizeOpeningSide(side: unknown): string | null {
  if (side == null || side === '') return null;
  const s = String(side).trim().toUpperCase();
  if (s === 'D' || s === 'DR' || s === 'DEBIT') return 'D';
  if (s === 'C' || s === 'CR' || s === 'CREDIT') return 'C';
  throw new BookCoaValidationError('openingSide must be D (debit) or C (credit)');
}

function normalizeOpeningBalance(raw: unknown): number {
  if (raw == null || raw === '') return 0;
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new BookCoaValidationError('openingBalance must be a number');
  return Math.round(Math.abs(n) * 100) / 100;
}

async function assertGroupExists(client: PoolClient, tenantId: string, groupId: string): Promise<void> {
  const row = (
    await client.query(`SELECT id FROM book_account_groups WHERE tenant_id = $1 AND id = $2`, [tenantId, groupId])
  ).rows[0];
  if (!row) throw new BookCoaValidationError('Account group not found');
}

async function assertParentOk(
  client: PoolClient,
  tenantId: string,
  parentId: string | null,
  selfId?: string,
): Promise<void> {
  if (!parentId) return;
  if (selfId && parentId === selfId) {
    throw new BookCoaValidationError('Group cannot be its own parent');
  }
  await assertGroupExists(client, tenantId, parentId);
}

export async function listBookGroups(client: PoolClient, tenantId: string) {
  const { rows } = await client.query(
    `SELECT g.*, p.name AS parent_name,
            (SELECT COUNT(*)::int FROM book_ledgers l WHERE l.tenant_id = g.tenant_id AND l.group_id = g.id) AS ledger_count
     FROM book_account_groups g
     LEFT JOIN book_account_groups p ON p.id = g.parent_id AND p.tenant_id = g.tenant_id
     WHERE g.tenant_id = $1
     ORDER BY g.name`,
    [tenantId],
  );
  return rows.map(r => ({
    id: r.id as string,
    name: r.name as string,
    nature: (r.nature as string) || null,
    parentId: (r.parent_id as string) || null,
    parentName: (r.parent_name as string) || null,
    groupCode: (r.group_code as string) || null,
    externalRef: (r.external_ref as string) || null,
    ledgerCount: Number(r.ledger_count || 0),
  }));
}

export async function createBookGroup(client: PoolClient, tenantId: string, input: BookGroupInput) {
  const name = normalizeName(input.name);
  const nature = normalizeNature(input.nature);
  const parentId = input.parentId?.trim() || null;
  const groupCode = input.groupCode?.trim() || null;
  await assertParentOk(client, tenantId, parentId);

  const dup = (
    await client.query(`SELECT id FROM book_account_groups WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
      tenantId,
      name,
    ])
  ).rows[0];
  if (dup) throw new BookCoaValidationError(`Group "${name}" already exists`);

  const id = uid('BG');
  await client.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, parent_id, nature, group_code, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [id, tenantId, name, parentId, nature, groupCode, `manual:${id}`],
  );
  return id;
}

export async function updateBookGroup(client: PoolClient, tenantId: string, id: string, input: BookGroupInput) {
  const existing = (
    await client.query(`SELECT id FROM book_account_groups WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
  ).rows[0];
  if (!existing) throw new BookCoaNotFoundError('Account group not found');

  const name = normalizeName(input.name);
  const nature = normalizeNature(input.nature);
  const parentId = input.parentId?.trim() || null;
  const groupCode = input.groupCode?.trim() || null;
  await assertParentOk(client, tenantId, parentId, id);

  const dup = (
    await client.query(
      `SELECT id FROM book_account_groups
       WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3 LIMIT 1`,
      [tenantId, name, id],
    )
  ).rows[0];
  if (dup) throw new BookCoaValidationError(`Group "${name}" already exists`);

  await client.query(
    `UPDATE book_account_groups
     SET name = $3, parent_id = $4, nature = $5, group_code = $6
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id, name, parentId, nature, groupCode],
  );
}

export async function deleteBookGroup(client: PoolClient, tenantId: string, id: string) {
  const existing = (
    await client.query(`SELECT id FROM book_account_groups WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
  ).rows[0];
  if (!existing) throw new BookCoaNotFoundError('Account group not found');

  const ledgers = (
    await client.query(`SELECT COUNT(*)::int AS c FROM book_ledgers WHERE tenant_id = $1 AND group_id = $2`, [
      tenantId,
      id,
    ])
  ).rows[0] as { c: number };
  if (ledgers.c > 0) {
    throw new BookCoaValidationError('Cannot delete group that still has ledgers — move or delete them first');
  }

  const children = (
    await client.query(`SELECT COUNT(*)::int AS c FROM book_account_groups WHERE tenant_id = $1 AND parent_id = $2`, [
      tenantId,
      id,
    ])
  ).rows[0] as { c: number };
  if (children.c > 0) {
    throw new BookCoaValidationError('Cannot delete group that has child groups');
  }

  await client.query(`DELETE FROM book_account_groups WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
}

async function upsertLedgerDetails(
  client: PoolClient,
  tenantId: string,
  ledgerId: string,
  input: BookLedgerInput,
): Promise<void> {
  const hasAny = [
    input.contactPerson,
    input.city,
    input.state,
    input.mobile,
    input.phone,
    input.email,
    input.address1,
  ].some(v => v != null && String(v).trim() !== '');
  if (!hasAny) return;

  await client.query(
    `INSERT INTO book_ledger_details
       (ledger_id, tenant_id, contact_person, city, state, mobile, phone, email, address1)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (ledger_id, tenant_id) DO UPDATE SET
       contact_person = COALESCE(EXCLUDED.contact_person, book_ledger_details.contact_person),
       city = COALESCE(EXCLUDED.city, book_ledger_details.city),
       state = COALESCE(EXCLUDED.state, book_ledger_details.state),
       mobile = COALESCE(EXCLUDED.mobile, book_ledger_details.mobile),
       phone = COALESCE(EXCLUDED.phone, book_ledger_details.phone),
       email = COALESCE(EXCLUDED.email, book_ledger_details.email),
       address1 = COALESCE(EXCLUDED.address1, book_ledger_details.address1)`,
    [
      ledgerId,
      tenantId,
      input.contactPerson?.trim() || null,
      input.city?.trim() || null,
      input.state?.trim() || null,
      input.mobile?.trim() || null,
      input.phone?.trim() || null,
      input.email?.trim() || null,
      input.address1?.trim() || null,
    ],
  );
}

export async function createBookLedger(client: PoolClient, tenantId: string, input: BookLedgerInput) {
  const name = normalizeName(input.name);
  const groupId = input.groupId?.trim() || null;
  if (groupId) await assertGroupExists(client, tenantId, groupId);
  const nature = normalizeNature(input.nature);
  const ledgerType = input.ledgerType?.trim().toUpperCase() || null;
  const gstin = input.gstin?.trim() || null;
  const openingBalance = normalizeOpeningBalance(input.openingBalance);
  const openingSide = normalizeOpeningSide(input.openingSide) || (openingBalance > 0 ? 'D' : null);

  const dup = (
    await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1`, [
      tenantId,
      name,
    ])
  ).rows[0];
  if (dup) throw new BookCoaValidationError(`Ledger "${name}" already exists`);

  const id = uid('BL');
  await client.query(
    `INSERT INTO book_ledgers
       (id, tenant_id, name, group_id, nature, ledger_type, gstin, opening_balance, opening_side, is_system, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10)`,
    [id, tenantId, name, groupId, nature, ledgerType, gstin, openingBalance, openingSide, `manual:${id}`],
  );
  await upsertLedgerDetails(client, tenantId, id, input);
  return id;
}

export async function updateBookLedger(client: PoolClient, tenantId: string, id: string, input: BookLedgerInput) {
  const existing = (
    await client.query(`SELECT id, is_system FROM book_ledgers WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
  ).rows[0] as { id: string; is_system: boolean } | undefined;
  if (!existing) throw new BookCoaNotFoundError('Ledger not found');

  const name = normalizeName(input.name);
  const groupId = input.groupId?.trim() || null;
  if (groupId) await assertGroupExists(client, tenantId, groupId);
  const nature = normalizeNature(input.nature);
  const ledgerType = input.ledgerType?.trim().toUpperCase() || null;
  const gstin = input.gstin?.trim() || null;
  const openingBalance = normalizeOpeningBalance(input.openingBalance);
  const openingSide = normalizeOpeningSide(input.openingSide) || (openingBalance > 0 ? 'D' : null);

  const dup = (
    await client.query(
      `SELECT id FROM book_ledgers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND id <> $3 LIMIT 1`,
      [tenantId, name, id],
    )
  ).rows[0];
  if (dup) throw new BookCoaValidationError(`Ledger "${name}" already exists`);

  await client.query(
    `UPDATE book_ledgers
     SET name = $3, group_id = $4, nature = $5, ledger_type = $6, gstin = $7,
         opening_balance = $8, opening_side = $9
     WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id, name, groupId, nature, ledgerType, gstin, openingBalance, openingSide],
  );
  await upsertLedgerDetails(client, tenantId, id, input);
}

export async function setBookLedgerOpening(
  client: PoolClient,
  tenantId: string,
  id: string,
  openingBalance: number,
  openingSide?: string | null,
) {
  const existing = (await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND id = $2`, [tenantId, id]))
    .rows[0];
  if (!existing) throw new BookCoaNotFoundError('Ledger not found');

  const bal = normalizeOpeningBalance(openingBalance);
  const side = normalizeOpeningSide(openingSide) || (bal > 0 ? 'D' : null);
  await client.query(
    `UPDATE book_ledgers SET opening_balance = $3, opening_side = $4 WHERE tenant_id = $1 AND id = $2`,
    [tenantId, id, bal, side],
  );
}

export async function deleteBookLedger(client: PoolClient, tenantId: string, id: string) {
  const existing = (
    await client.query(`SELECT id, is_system, name FROM book_ledgers WHERE tenant_id = $1 AND id = $2`, [tenantId, id])
  ).rows[0] as { id: string; is_system: boolean; name: string } | undefined;
  if (!existing) throw new BookCoaNotFoundError('Ledger not found');
  if (existing.is_system) {
    throw new BookCoaValidationError(`Cannot delete system ledger "${existing.name}"`);
  }

  const used = (
    await client.query(`SELECT COUNT(*)::int AS c FROM book_voucher_entries WHERE tenant_id = $1 AND ledger_id = $2`, [
      tenantId,
      id,
    ])
  ).rows[0] as { c: number };
  if (used.c > 0) {
    throw new BookCoaValidationError('Cannot delete ledger that appears on vouchers');
  }

  const asParty = (
    await client.query(
      `SELECT COUNT(*)::int AS c FROM book_vouchers
       WHERE tenant_id = $1 AND (party_ledger_id = $2 OR contra_ledger_id = $2)`,
      [tenantId, id],
    )
  ).rows[0] as { c: number };
  if (asParty.c > 0) {
    throw new BookCoaValidationError('Cannot delete ledger that is used as party/contra on vouchers');
  }

  await client.query(`DELETE FROM book_ledger_details WHERE tenant_id = $1 AND ledger_id = $2`, [tenantId, id]);
  await client.query(`DELETE FROM book_ledgers WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
}
