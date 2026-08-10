/**
 * Miracle Accounting (RKIT) CMP folder → Books tables + Dhandho ops tables.
 * Expects extracted company folder (CMP0001/) containing version.txt + YRxx year DBFs.
 *
 * Ops dual-write (idempotent via external_ref / idempotency_key):
 *   PR ledgers → vendors
 *   products   → products
 *   SP/SE sales → standalone_invoices
 *   CB party R/P → invoice_payments (receipts FIFO) and/or vendor_payments
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { PoolClient } from 'pg';
import { uid } from '../utils/helpers';
import { dateStr, findDbf, num, readDbf, str, type DbfRecord } from '../utils/dbf';
import { logger } from '../utils/logger';

const execFileAsync = promisify(execFile);

/** Source → imported → skipped for one ops category (shown in Masters Import UI). */
export interface MiracleImportCoverageBucket {
  source: number;
  imported: number;
  skipped: number;
  /** Why rows were skipped (when skipped > 0). */
  skipReason?: string;
}

export interface MiracleImportCoverage {
  parties: MiracleImportCoverageBucket;
  products: MiracleImportCoverageBucket;
  salesInvoices: MiracleImportCoverageBucket;
  /** CB receipts posted to income ledgers (job work, scrap, etc.) → paid invoices */
  cashIncomeInvoices: MiracleImportCoverageBucket;
  /** CB receipts/payments involving a trading/liability party */
  partyCash: MiracleImportCoverageBucket;
  /** Expense/capital/FA/etc. cash — kept in Books only */
  nonPartyCashSkipped: number;
  /** Journals — Books only (not ops) */
  journalsBooksOnly: number;
}

export interface MiracleImportSummary {
  companyName: string;
  miracleVersion: string;
  financialYear: string;
  groups: number;
  ledgers: number;
  products: number;
  vouchers: number;
  voucherEntries: number;
  voucherItems: number;
  /** Dhandho ops dual-write counts */
  vendors: number;
  opsProducts: number;
  invoices: number;
  vendorPayments: number;
  invoicePayments: number;
  /** Post-import breakdown for UI */
  coverage: MiracleImportCoverage;
}

/** Miracle ledger types treated as Dhandho parties (vendors). PR = trading, LI = liability/loan person. */
export function isOpsPartyLedgerType(ledgerType: string | null | undefined): boolean {
  const t = (ledgerType || '').toUpperCase();
  return t === 'PR' || t === 'LI';
}

/** Income ledgers that receive cash without a party → cash-sale invoices. */
export function isCashIncomeLedgerType(ledgerType: string | null | undefined): boolean {
  const t = (ledgerType || '').toUpperCase();
  return t === 'JP' || t === 'IN';
}

function emptyCoverage(): MiracleImportCoverage {
  return {
    parties: { source: 0, imported: 0, skipped: 0 },
    products: { source: 0, imported: 0, skipped: 0 },
    salesInvoices: { source: 0, imported: 0, skipped: 0 },
    cashIncomeInvoices: { source: 0, imported: 0, skipped: 0 },
    partyCash: { source: 0, imported: 0, skipped: 0 },
    nonPartyCashSkipped: 0,
    journalsBooksOnly: 0,
  };
}

export interface MiracleImportIssue {
  stage: string;
  message: string;
  externalRef?: string;
  row?: number;
}

export interface MiracleImportResult {
  summary: MiracleImportSummary;
  errors: MiracleImportIssue[];
  warnings: MiracleImportIssue[];
}

/** Client-facing validation failure (bad archive / missing masters). */
export class MiracleImportValidationError extends Error {
  readonly status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'MiracleImportValidationError';
  }
}

const MAX_ISSUES = 50;

function createIssueBag() {
  const errors: MiracleImportIssue[] = [];
  const warnings: MiracleImportIssue[] = [];
  let errorExtra = 0;
  let warningExtra = 0;

  return {
    error(issue: MiracleImportIssue) {
      if (errors.length < MAX_ISSUES) errors.push(issue);
      else errorExtra++;
    },
    warn(issue: MiracleImportIssue) {
      if (warnings.length < MAX_ISSUES) warnings.push(issue);
      else warningExtra++;
    },
    finalize(): { errors: MiracleImportIssue[]; warnings: MiracleImportIssue[] } {
      if (errorExtra > 0) {
        errors.push({ stage: 'import', message: `…and ${errorExtra} more` });
      }
      if (warningExtra > 0) {
        warnings.push({ stage: 'import', message: `…and ${warningExtra} more` });
      }
      return { errors, warnings };
    },
  };
}

function mapVoucherType(miracleType: string, subtype: string): string {
  const t = miracleType.toUpperCase();
  const s = subtype.toUpperCase();
  if (t === 'CB' && s === 'R') return 'receipt';
  if (t === 'CB' && s === 'P') return 'payment';
  if (t === 'JR' || s === 'J') return 'journal';
  if (t === 'SP' || s === 'D') return 'sales';
  if (t === 'SE') return 'sales';
  return 'other';
}

function findYearDir(companyDir: string): { code: string; dir: string } | null {
  const entries = fs.readdirSync(companyDir, { withFileTypes: true });
  const years = entries
    .filter(e => e.isDirectory() && /^YR\d{2}$/i.test(e.name))
    .map(e => e.name)
    .sort();
  if (!years.length) return null;
  const code = years[years.length - 1];
  return { code: code.toUpperCase(), dir: path.join(companyDir, code) };
}

function parseVersionTxt(companyDir: string): { companyName: string; miracleVersion: string } {
  const vp = fs.existsSync(path.join(companyDir, 'version.txt'))
    ? path.join(companyDir, 'version.txt')
    : fs.existsSync(path.join(companyDir, 'VERSION.TXT'))
      ? path.join(companyDir, 'VERSION.TXT')
      : null;
  let companyName = 'Miracle Company';
  let miracleVersion = '';
  if (vp) {
    const text = fs.readFileSync(vp, 'latin1');
    const cn = text.match(/Company Name\s*:\s*(.+)/i);
    const mv = text.match(/Miracle Version\s*:\s*(.+)/i);
    if (cn) companyName = cn[1].trim();
    if (mv) miracleVersion = mv[1].trim();
  }
  // Prefer company master memo if present
  const mm = findDbf(companyDir, 'rkcmpmm.dbf');
  if (mm) {
    try {
      const { records } = readDbf(mm);
      const info = records.find(r => str(r.FIELD01) === 'CMP_LINFO');
      const memo = str(info?.FIELD02);
      if (memo) {
        const first = memo.split(/~CC~/i)[0]?.trim();
        if (first) companyName = first;
      }
    } catch {
      /* ignore */
    }
  }
  return { companyName, miracleVersion };
}

/** Locate CMP root inside an extracted archive. */
export function locateCompanyDir(root: string): string {
  if (!fs.existsSync(root)) {
    throw new MiracleImportValidationError(`Miracle extract path not found: ${root}`);
  }
  const versionHere = fs.existsSync(path.join(root, 'version.txt')) || fs.existsSync(path.join(root, 'VERSION.TXT'));
  if (versionHere && findYearDir(root)) return root;

  const kids = fs.readdirSync(root, { withFileTypes: true }).filter(d => d.isDirectory());
  for (const k of kids) {
    const p = path.join(root, k.name);
    if ((fs.existsSync(path.join(p, 'version.txt')) || fs.existsSync(path.join(p, 'VERSION.TXT'))) && findYearDir(p)) {
      return p;
    }
    // nested CMP0001/CMP0001
    try {
      return locateCompanyDir(p);
    } catch {
      /* continue */
    }
  }
  throw new MiracleImportValidationError('Could not find Miracle company folder (version.txt + year folder YRxx)');
}

export async function extractArchive(archivePath: string): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-import-'));
  const lower = archivePath.toLowerCase();
  try {
    if (lower.endsWith('.zip')) {
      await execFileAsync('unzip', ['-q', archivePath, '-d', tmp]);
    } else if (lower.endsWith('.rar')) {
      // macOS bsdtar can read many RAR v4 archives; fall back to unrar if present
      try {
        await execFileAsync('bsdtar', ['-xf', archivePath, '-C', tmp]);
      } catch {
        await execFileAsync('unrar', ['x', '-o+', archivePath, tmp]);
      }
    } else {
      throw new MiracleImportValidationError('Unsupported archive — upload .rar or .zip of the Miracle CMP folder');
    }
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    if (err instanceof MiracleImportValidationError) throw err;
    const detail = err instanceof Error ? err.message : String(err);
    throw new MiracleImportValidationError(`Failed to extract Miracle archive: ${detail}`);
  }
  return tmp;
}

async function upsertGroup(
  client: PoolClient,
  tenantId: string,
  externalRef: string,
  name: string,
  nature: string | null,
  groupCode: string | null,
  parentExternal: string | null,
  idByExt: Map<string, string>,
): Promise<string> {
  const existing = idByExt.get(externalRef);
  if (existing) return existing;
  const id = uid('BG');
  const parentId = parentExternal ? idByExt.get(parentExternal) || null : null;
  await client.query(
    `INSERT INTO book_account_groups (id, tenant_id, name, parent_id, nature, group_code, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     ON CONFLICT (tenant_id, external_ref) DO UPDATE SET name = EXCLUDED.name, nature = EXCLUDED.nature
     RETURNING id`,
    [id, tenantId, name || externalRef, parentId, nature, groupCode, externalRef],
  );
  const row = (
    await client.query(`SELECT id FROM book_account_groups WHERE tenant_id = $1 AND external_ref = $2`, [
      tenantId,
      externalRef,
    ])
  ).rows[0] as { id: string };
  idByExt.set(externalRef, row.id);
  return row.id;
}

function formatAddress(parts: Array<string | null | undefined>): string | null {
  const joined = parts
    .map(p => (p || '').trim())
    .filter(Boolean)
    .join(', ');
  return joined || null;
}

async function upsertOpsVendor(
  client: PoolClient,
  tenantId: string,
  externalRef: string,
  name: string,
  contactPerson: string | null,
  phone: string | null,
  email: string | null,
  address: string | null,
  gstNumber: string | null,
  vendorIds: Map<string, string>,
): Promise<string> {
  const id = uid('V');
  await client.query(
    `INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email, address, gst_number, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     ON CONFLICT (tenant_id, external_ref) WHERE external_ref IS NOT NULL DO UPDATE SET
       name = EXCLUDED.name,
       contact_person = COALESCE(EXCLUDED.contact_person, vendors.contact_person),
       phone = COALESCE(EXCLUDED.phone, vendors.phone),
       email = COALESCE(EXCLUDED.email, vendors.email),
       address = COALESCE(EXCLUDED.address, vendors.address),
       gst_number = COALESCE(EXCLUDED.gst_number, vendors.gst_number)`,
    [id, tenantId, name, contactPerson, phone, email, address, gstNumber, externalRef],
  );
  const row = (
    await client.query(`SELECT id FROM vendors WHERE tenant_id = $1 AND external_ref = $2`, [tenantId, externalRef])
  ).rows[0] as { id: string };
  vendorIds.set(externalRef, row.id);
  return row.id;
}

async function upsertOpsProduct(
  client: PoolClient,
  tenantId: string,
  externalRef: string,
  name: string,
  unit: string | null,
  hsn: string | null,
  price: number,
  opsProductIds: Map<string, string>,
): Promise<string> {
  const id = uid('P');
  const description = unit ? `Unit: ${unit}` : null;
  await client.query(
    `INSERT INTO products
       (id, tenant_id, name, barcode, description, reward_points_value, status, warranty_months,
        warranty_applicable, price, stock, hsn_code, gst_rate, pack_size, pack_name, external_ref)
     VALUES ($1,$2,$3,NULL,$4,0,'Active',0,false,$5,0,$6,0,1,$7,$8)
     ON CONFLICT (tenant_id, external_ref) WHERE external_ref IS NOT NULL DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       price = EXCLUDED.price,
       hsn_code = COALESCE(EXCLUDED.hsn_code, products.hsn_code),
       pack_name = EXCLUDED.pack_name`,
    [id, tenantId, name, description, price, hsn, unit || 'Piece', externalRef],
  );
  const row = (
    await client.query(`SELECT id FROM products WHERE tenant_id = $1 AND external_ref = $2`, [tenantId, externalRef])
  ).rows[0] as { id: string };
  opsProductIds.set(externalRef, row.id);
  return row.id;
}

async function upsertOpsInvoice(
  client: PoolClient,
  tenantId: string,
  externalRef: string,
  invoiceNumber: string,
  customerName: string,
  customerGstin: string | null,
  customerAddress: string | null,
  customerPhone: string | null,
  vendorId: string | null,
  items: Array<{
    description: string;
    hsnSac?: string | null;
    qty: number;
    rate: number;
    gstPercent: number;
    discountPercent: number;
    productId?: string | null;
    taxable: number;
    tax: number;
    total: number;
  }>,
  invoiceDate: string,
  notes: string | null,
  status: 'sent' | 'paid' = 'sent',
): Promise<string> {
  const subtotal = items.reduce((s, it) => s + it.taxable, 0);
  const taxTotal = items.reduce((s, it) => s + it.tax, 0);
  const grandTotal = subtotal + taxTotal;
  const id = uid('INV');
  // Prefer stable Miracle number; fall back to MIR-<ext>. On re-import keep external_ref unique.
  // If invoice_number conflicts with a different row, append short ext suffix.
  let number = invoiceNumber.trim() || `MIR-${externalRef}`;
  const clash = (
    await client.query(
      `SELECT id FROM standalone_invoices
       WHERE tenant_id = $1 AND invoice_number = $2
         AND (external_ref IS NULL OR external_ref <> $3)
       LIMIT 1`,
      [tenantId, number, externalRef],
    )
  ).rows[0];
  if (clash) number = `${number}-${externalRef.slice(-6)}`;

  await client.query(
    `INSERT INTO standalone_invoices
       (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address, customer_phone,
        party_type, party_id, items, subtotal, tax_total, grand_total, notes, status, invoice_date,
        tax_cgst, tax_sgst, tax_igst, is_interstate, gst_enabled, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,0,0,0,false,false,$17)
     ON CONFLICT (tenant_id, external_ref) WHERE external_ref IS NOT NULL DO UPDATE SET
       invoice_number = EXCLUDED.invoice_number,
       customer_name = EXCLUDED.customer_name,
       customer_gstin = EXCLUDED.customer_gstin,
       customer_address = EXCLUDED.customer_address,
       customer_phone = EXCLUDED.customer_phone,
       party_type = EXCLUDED.party_type,
       party_id = EXCLUDED.party_id,
       items = EXCLUDED.items,
       subtotal = EXCLUDED.subtotal,
       tax_total = EXCLUDED.tax_total,
       grand_total = EXCLUDED.grand_total,
       notes = EXCLUDED.notes,
       status = EXCLUDED.status,
       invoice_date = EXCLUDED.invoice_date,
       updated_at = NOW()`,
    [
      id,
      tenantId,
      number,
      customerName,
      customerGstin,
      customerAddress,
      customerPhone,
      vendorId ? 'vendor' : null,
      vendorId,
      JSON.stringify(items),
      subtotal,
      taxTotal,
      grandTotal,
      notes,
      status,
      invoiceDate,
      externalRef,
    ],
  );
  const row = (
    await client.query(`SELECT id FROM standalone_invoices WHERE tenant_id = $1 AND external_ref = $2`, [
      tenantId,
      externalRef,
    ])
  ).rows[0] as { id: string };
  return row.id;
}

async function upsertVendorPayment(
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

async function allocateReceiptToInvoices(
  client: PoolClient,
  tenantId: string,
  vendorId: string,
  amount: number,
  paymentDate: string,
  paymentMethod: string,
  referenceNumber: string | null,
  miracleExt: string,
  narration: string | null,
): Promise<{ invoicePayments: number; vendorPayments: number }> {
  // Clear prior allocations for this Miracle voucher (re-import safe)
  await client.query(`DELETE FROM invoice_payments WHERE tenant_id = $1 AND idempotency_key LIKE $2`, [
    tenantId,
    `miracle:${miracleExt}:%`,
  ]);
  await client.query(`DELETE FROM vendor_payments WHERE tenant_id = $1 AND idempotency_key = $2`, [
    tenantId,
    `miracle:${miracleExt}`,
  ]);

  const open = (
    await client.query(
      `SELECT si.id, si.grand_total::float AS grand_total,
              COALESCE((SELECT SUM(ip.amount)::float FROM invoice_payments ip
                        WHERE ip.tenant_id = si.tenant_id AND ip.invoice_id = si.id), 0) AS paid
       FROM standalone_invoices si
       WHERE si.tenant_id = $1 AND si.party_type = 'vendor' AND si.party_id = $2
         AND si.status IS DISTINCT FROM 'cancelled'
       ORDER BY si.invoice_date ASC NULLS LAST, si.created_at ASC NULLS LAST, si.id ASC`,
      [tenantId, vendorId],
    )
  ).rows as Array<{ id: string; grand_total: number; paid: number }>;

  let remaining = Math.round(amount * 100) / 100;
  let invoicePayments = 0;
  let slice = 0;
  for (const inv of open) {
    if (remaining <= 0.009) break;
    const due = Math.round((Number(inv.grand_total) - Number(inv.paid)) * 100) / 100;
    if (due <= 0.009) continue;
    const apply = Math.min(remaining, due);
    const key = `miracle:${miracleExt}:${slice++}`;
    const id = uid('IP');
    await client.query(
      `INSERT INTO invoice_payments
         (id, tenant_id, invoice_id, amount, payment_date, payment_method, reference_number, notes, idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id,
        tenantId,
        inv.id,
        apply,
        paymentDate,
        paymentMethod,
        referenceNumber,
        narration ? `Miracle receipt: ${narration}` : `Miracle receipt ${miracleExt}`,
        key,
      ],
    );
    invoicePayments++;
    if (Number(inv.paid) + apply >= Number(inv.grand_total) - 0.001) {
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
      narration ? `Miracle receipt (unallocated): ${narration}` : `Miracle receipt ${miracleExt} (unallocated)`,
      `miracle:${miracleExt}`,
    );
    if (ok) vendorPayments = 1;
  }
  return { invoicePayments, vendorPayments };
}

export async function importMiracleCompany(
  client: PoolClient,
  tenantId: string,
  companyDir: string,
  jobId: string,
): Promise<MiracleImportResult> {
  const issues = createIssueBag();
  const { companyName, miracleVersion } = parseVersionTxt(companyDir);
  const year = findYearDir(companyDir);
  if (!year) {
    throw new MiracleImportValidationError('No YRxx financial year folder found in Miracle company data');
  }

  const yrDir = year.dir;
  const coverage = emptyCoverage();
  const summary: MiracleImportSummary = {
    companyName,
    miracleVersion,
    financialYear: year.code,
    groups: 0,
    ledgers: 0,
    products: 0,
    vouchers: 0,
    voucherEntries: 0,
    voucherItems: 0,
    vendors: 0,
    opsProducts: 0,
    invoices: 0,
    vendorPayments: 0,
    invoicePayments: 0,
    coverage,
  };

  await client.query(
    `UPDATE book_import_jobs SET company_name = $1, miracle_version = $2, status = 'running' WHERE id = $3 AND tenant_id = $4`,
    [companyName, miracleVersion, jobId, tenantId],
  );

  // Financial year
  const fyId = uid('BF');
  await client.query(
    `INSERT INTO book_financial_years (id, tenant_id, code, label, is_active, external_ref)
     VALUES ($1,$2,$3,$4,true,$3)
     ON CONFLICT (tenant_id, code) DO UPDATE SET is_active = true
     RETURNING id`,
    [fyId, tenantId, year.code, `FY ${year.code}`],
  );
  const fyRow = (
    await client.query(`SELECT id FROM book_financial_years WHERE tenant_id = $1 AND code = $2`, [tenantId, year.code])
  ).rows[0] as { id: string };
  const financialYearId = fyRow.id;

  const groupIds = new Map<string, string>();
  const ledgerIds = new Map<string, string>();
  const productIds = new Map<string, string>();
  const vendorIds = new Map<string, string>();
  const opsProductIds = new Map<string, string>();
  const opsProductNames = new Map<string, string>();
  const ledgerMeta = new Map<
    string,
    { name: string; gstin: string | null; phone: string | null; address: string | null; ledgerType: string }
  >();
  const ledgerTypes = new Map<string, string>();

  // Groups — rkaccm11
  const groupsPath = findDbf(yrDir, 'rkaccm11.dbf');
  if (!groupsPath) {
    issues.warn({ stage: 'groups', message: 'Account group master rkaccm11.dbf not found' });
  } else {
    const { records } = readDbf(groupsPath);
    // Two passes for parent links
    for (const r of records) {
      const ext = str(r.FIELD01);
      if (!ext) continue;
      await upsertGroup(
        client,
        tenantId,
        ext,
        str(r.FIELD02) || str(r.FIELD11) || ext,
        str(r.FIELD06) || str(r.FIELD09) || null,
        str(r.FIELD08) || null,
        null,
        groupIds,
      );
      summary.groups++;
    }
    for (const r of records) {
      const ext = str(r.FIELD01);
      const parent = str(r.FIELD04) || str(r.FIELD05);
      if (!ext || !parent || parent === ext) continue;
      const id = groupIds.get(ext);
      const parentId = groupIds.get(parent);
      if (id && parentId) {
        await client.query(`UPDATE book_account_groups SET parent_id = $1 WHERE id = $2 AND tenant_id = $3`, [
          parentId,
          id,
          tenantId,
        ]);
      }
    }
  }

  // Ledgers — RKACCM01 + address rkaccm02
  const ledgersPath = findDbf(yrDir, 'RKACCM01.DBF') || findDbf(yrDir, 'rkaccm01.dbf');
  if (!ledgersPath) {
    throw new MiracleImportValidationError(
      'Missing required account master RKACCM01.DBF — cannot import ledgers or parties',
    );
  }
  const ledgerRows = readDbf(ledgersPath).records;
  const addrById = new Map<string, DbfRecord>();
  if (findDbf(yrDir, 'rkaccm02.dbf')) {
    for (const r of readDbf(findDbf(yrDir, 'rkaccm02.dbf')!).records) {
      const id = str(r.FIELD01);
      if (id) addrById.set(id, r);
    }
  }

  let ledgerRow = 0;
  for (const r of ledgerRows) {
    ledgerRow++;
    const ext = str(r.FIELD01);
    if (!ext) continue;
    const rawName = str(r.FIELD02).trim();
    const name = rawName || ext;
    const nature = str(r.FIELD04) || null;
    const ledgerType = str(r.FIELD07) || null;
    const groupExt = str(r.FIELD05) || str(r.FIELD06);
    let groupId: string | null = null;
    if (groupExt) {
      groupId = groupIds.get(groupExt) || null;
      if (!groupId) {
        groupId = await upsertGroup(client, tenantId, groupExt, groupExt, null, null, null, groupIds);
      }
    }
    const opening = num(r.FIELD10);
    const gstin = str(r.FIELD40) || null;
    const id = uid('BL');
    await client.query(
      `INSERT INTO book_ledgers
        (id, tenant_id, name, group_id, nature, ledger_type, gstin, opening_balance, opening_side, is_system, external_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       ON CONFLICT (tenant_id, external_ref) DO UPDATE SET
         name = EXCLUDED.name,
         group_id = EXCLUDED.group_id,
         nature = EXCLUDED.nature,
         ledger_type = EXCLUDED.ledger_type,
         gstin = EXCLUDED.gstin,
         opening_balance = EXCLUDED.opening_balance
       RETURNING id`,
      [
        id,
        tenantId,
        name,
        groupId,
        nature,
        ledgerType,
        gstin,
        opening,
        opening >= 0 ? 'D' : 'C',
        ['PROFLOSS', 'CL_STOCK', 'TRADEACC', 'ACASHACT'].includes(ext),
        ext,
      ],
    );
    const row = (
      await client.query(`SELECT id FROM book_ledgers WHERE tenant_id = $1 AND external_ref = $2`, [tenantId, ext])
    ).rows[0] as { id: string };
    ledgerIds.set(ext, row.id);
    summary.ledgers++;

    const a = addrById.get(ext);
    let phone: string | null = str(r.M01F15) || str(r.M01F05) || null;
    let email: string | null = str(r.M01F18) || null;
    let contactPerson: string | null = null;
    let address = formatAddress([str(r.FIELD31), str(r.FIELD32), str(r.FIELD33), str(r.FIELD34)]);
    if (a) {
      phone = str(a.M02F71) || phone;
      email = str(a.M02F77) || email;
      contactPerson = str(a.FIELD61) || null;
      address =
        formatAddress([
          str(a.FIELD02) || str(r.FIELD31),
          str(a.FIELD03) || str(r.FIELD32),
          str(a.FIELD04),
          str(a.FIELD05) || str(r.FIELD33),
          str(a.FIELD53),
          str(a.FIELD21) || str(r.FIELD34),
        ]) || address;
      await client.query(
        `INSERT INTO book_ledger_details
          (ledger_id, tenant_id, address1, address2, address3, city, state, state_code, pincode, phone, mobile, email, contact_person)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
         ON CONFLICT (ledger_id, tenant_id) DO UPDATE SET
           address1 = EXCLUDED.address1, city = EXCLUDED.city, state = EXCLUDED.state,
           contact_person = EXCLUDED.contact_person, mobile = EXCLUDED.mobile`,
        [
          row.id,
          tenantId,
          str(a.FIELD02) || str(r.FIELD31) || null,
          str(a.FIELD03) || str(r.FIELD32) || null,
          str(a.FIELD04) || null,
          str(a.FIELD05) || str(r.FIELD33) || null,
          str(a.FIELD53) || null,
          str(a.M02F74) || null,
          str(a.FIELD21) || str(r.FIELD34) || null,
          str(a.M02F71) || str(r.M01F05) || null,
          str(r.M01F15) || null,
          str(a.M02F77) || str(r.M01F18) || null,
          str(a.FIELD61) || null,
        ],
      );
    }

    const typeUpper = (ledgerType || '').toUpperCase();
    ledgerTypes.set(ext, typeUpper);
    ledgerMeta.set(ext, { name, gstin, phone, address, ledgerType: typeUpper });

    // Trading parties (PR) + liability persons (LI) → Dhandho vendors
    if (isOpsPartyLedgerType(typeUpper)) {
      coverage.parties.source++;
      if (!rawName) {
        coverage.parties.skipped++;
        coverage.parties.skipReason = 'Party/vendor missing name';
        issues.error({
          stage: 'vendors',
          message: 'Party/vendor missing name — skipped ops import',
          externalRef: ext,
          row: ledgerRow,
        });
      } else {
        await upsertOpsVendor(
          client,
          tenantId,
          ext,
          name,
          contactPerson || name,
          phone,
          email,
          address,
          gstin,
          vendorIds,
        );
        summary.vendors++;
        coverage.parties.imported++;
      }
    }
  }

  // Products — rkaccm21 + rates rkaccm29
  const prodPath = findDbf(yrDir, 'rkaccm21.dbf');
  const ratePath = findDbf(yrDir, 'rkaccm29.dbf');
  const rates = new Map<string, DbfRecord>();
  if (ratePath) {
    for (const r of readDbf(ratePath).records) {
      const id = str(r.M29F01);
      if (id) rates.set(id, r);
    }
  }
  if (!prodPath) {
    issues.warn({ stage: 'products', message: 'Product master rkaccm21.dbf not found — no products imported' });
  } else {
    let prodRow = 0;
    for (const r of readDbf(prodPath).records) {
      prodRow++;
      const ext = str(r.FIELD01);
      if (!ext) continue;
      const rt = rates.get(ext);
      const id = uid('BP');
      const saleRate = num(rt?.M29F03);
      const unit = str(r.FIELD05) || null;
      const hsn = str(r.FIELD40) || null;
      const rawProdName = str(r.FIELD02).trim();
      const prodName = rawProdName || ext;
      await client.query(
        `INSERT INTO book_products
          (id, tenant_id, name, code, unit, hsn_code, sale_rate, purchase_rate, mrp, tax_class, external_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, external_ref) DO UPDATE SET
           name = EXCLUDED.name, sale_rate = EXCLUDED.sale_rate, unit = EXCLUDED.unit`,
        [
          id,
          tenantId,
          prodName,
          str(r.FIELD04) || null,
          unit,
          hsn,
          saleRate,
          num(rt?.M29F10) || num(rt?.M29F11),
          num(rt?.M29F02),
          str(r.FIELD20) || null,
          ext,
        ],
      );
      const row = (
        await client.query(`SELECT id FROM book_products WHERE tenant_id = $1 AND external_ref = $2`, [tenantId, ext])
      ).rows[0] as { id: string };
      productIds.set(ext, row.id);
      summary.products++;
      coverage.products.source++;

      if (!rawProdName) {
        coverage.products.skipped++;
        coverage.products.skipReason = 'Product missing name';
        issues.error({
          stage: 'products',
          message: 'Product missing name — skipped ops import',
          externalRef: ext,
          row: prodRow,
        });
      } else {
        await upsertOpsProduct(client, tenantId, ext, prodName, unit, hsn, saleRate, opsProductIds);
        opsProductNames.set(ext, prodName);
        summary.opsProducts++;
        coverage.products.imported++;
      }
    }
  }

  // Narrations — RKACCT40
  const narrPath = findDbf(yrDir, 'RKACCT40.DBF') || findDbf(yrDir, 'rkacct40.dbf');
  const narrations = new Map<string, string>();
  if (narrPath) {
    for (const r of readDbf(narrPath).records) {
      const id = str(r.T40F01);
      const text = str(r.T40F02);
      if (id && text) narrations.set(id, text);
    }
  }

  // Voucher headers — RKACCT41
  const hdrPath = findDbf(yrDir, 'RKACCT41.DBF') || findDbf(yrDir, 'rkacct41.dbf');
  if (!hdrPath) {
    throw new MiracleImportValidationError(
      'Missing required voucher header RKACCT41.DBF — cannot import vouchers or invoices',
    );
  }
  const headers = readDbf(hdrPath).records;

  // Entries — RKACCT01
  const entPath = findDbf(yrDir, 'RKACCT01.DBF') || findDbf(yrDir, 'rkacct01.dbf');
  const entriesByVoucher = new Map<string, DbfRecord[]>();
  if (entPath) {
    for (const r of readDbf(entPath).records) {
      const vid = str(r.FIELD01);
      if (!vid) continue;
      const list = entriesByVoucher.get(vid) || [];
      list.push(r);
      entriesByVoucher.set(vid, list);
    }
  }

  // Items — RKACCT02
  const itemPath = findDbf(yrDir, 'RKACCT02.DBF') || findDbf(yrDir, 'rkacct02.dbf');
  const itemsByVoucher = new Map<string, DbfRecord[]>();
  if (itemPath) {
    for (const r of readDbf(itemPath).records) {
      const vid = str(r.FIELD01);
      if (!vid) continue;
      const list = itemsByVoucher.get(vid) || [];
      list.push(r);
      itemsByVoucher.set(vid, list);
    }
  }

  // First pass: books vouchers + sales invoices (so receipts can allocate later)
  type PendingCash = {
    ext: string;
    voucherType: 'receipt' | 'payment';
    vDate: string;
    amount: number;
    partyExt: string;
    contraExt: string;
    vNumber: string | null;
    narration: string | null;
  };
  const pendingCash: PendingCash[] = [];

  for (const h of headers) {
    const ext = str(h.FIELD01);
    if (!ext) continue;
    const miracleType = str(h.FIELD74) || str(h.FIELD98) || '';
    const subtype = str(h.FIELD16) || '';
    const voucherType = mapVoucherType(miracleType, subtype);
    const vDate = dateStr(h.FIELD02) || '2025-04-01';
    const vNumber = str(h.FIELD12) || str(h.T41FVNO) || null;
    const partyExt = str(h.FIELD04);
    const contraExt = str(h.FIELD05);
    const amount = num(h.FIELD06) || num(h.FIELD07);
    const narration = narrations.get(ext) || null;
    const voucherId = uid('BV');

    await client.query(
      `INSERT INTO book_vouchers
        (id, tenant_id, financial_year_id, voucher_type, voucher_date, voucher_number,
         party_ledger_id, contra_ledger_id, amount, narration, miracle_type, miracle_subtype, external_ref)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (tenant_id, external_ref) DO UPDATE SET
         voucher_type = EXCLUDED.voucher_type,
         voucher_date = EXCLUDED.voucher_date,
         amount = EXCLUDED.amount,
         narration = EXCLUDED.narration`,
      [
        voucherId,
        tenantId,
        financialYearId,
        voucherType,
        vDate,
        vNumber,
        partyExt ? ledgerIds.get(partyExt) || null : null,
        contraExt ? ledgerIds.get(contraExt) || null : null,
        amount,
        narration,
        miracleType || null,
        subtype || null,
        ext,
      ],
    );
    const vRow = (
      await client.query(`SELECT id FROM book_vouchers WHERE tenant_id = $1 AND external_ref = $2`, [tenantId, ext])
    ).rows[0] as { id: string };
    const ourVoucherId = vRow.id;
    summary.vouchers++;

    // Replace lines on re-import
    await client.query(`DELETE FROM book_voucher_entries WHERE tenant_id = $1 AND voucher_id = $2`, [
      tenantId,
      ourVoucherId,
    ]);
    await client.query(`DELETE FROM book_voucher_items WHERE tenant_id = $1 AND voucher_id = $2`, [
      tenantId,
      ourVoucherId,
    ]);

    const ents = entriesByVoucher.get(ext) || [];
    let lineNo = 0;
    for (const e of ents) {
      const ledgerExt = str(e.FIELD03);
      const contraExtLine = str(e.FIELD04);
      const ledgerId = ledgerExt ? ledgerIds.get(ledgerExt) : null;
      if (!ledgerId) continue;
      const amt = num(e.FIELD05);
      const side = str(e.FIELD06).toUpperCase();
      const debit = side === 'D' ? amt : 0;
      const credit = side === 'C' ? amt : 0;
      lineNo++;
      await client.query(
        `INSERT INTO book_voucher_entries
          (id, tenant_id, voucher_id, line_no, ledger_id, contra_ledger_id, debit, credit, external_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          uid('BE'),
          tenantId,
          ourVoucherId,
          lineNo,
          ledgerId,
          contraExtLine ? ledgerIds.get(contraExtLine) || null : null,
          debit,
          credit,
          `${ext}:${lineNo}`,
        ],
      );
      summary.voucherEntries++;
    }

    const items = itemsByVoucher.get(ext) || [];
    let itemNo = 0;
    const opsLineItems: Array<{
      description: string;
      hsnSac?: string | null;
      qty: number;
      rate: number;
      gstPercent: number;
      discountPercent: number;
      productId?: string | null;
      taxable: number;
      tax: number;
      total: number;
    }> = [];
    for (const it of items) {
      const prodExt = str(it.FIELD03);
      const productId = prodExt ? productIds.get(prodExt) || null : null;
      const opsProductId = prodExt ? opsProductIds.get(prodExt) || null : null;
      const qty = num(it.FIELD06) || 1;
      const rate = num(it.FIELD07);
      const lineAmt = num(it.FIELD08) || qty * rate;
      itemNo++;
      await client.query(
        `INSERT INTO book_voucher_items
          (id, tenant_id, voucher_id, line_no, product_id, qty, rate, amount, external_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [uid('BI'), tenantId, ourVoucherId, itemNo, productId, qty, rate, lineAmt, `${ext}:I${itemNo}`],
      );
      summary.voucherItems++;
      const prodName = (prodExt && opsProductNames.get(prodExt)) || prodExt || 'Item';
      opsLineItems.push({
        description: String(prodName),
        hsnSac: null,
        qty,
        rate,
        gstPercent: 0,
        discountPercent: 0,
        productId: opsProductId,
        taxable: lineAmt,
        tax: 0,
        total: lineAmt,
      });
    }

    if (voucherType === 'sales') {
      coverage.salesInvoices.source++;
      // Resolve party: header party, else first ops-party ledger on entries
      let partyKey = partyExt && vendorIds.has(partyExt) ? partyExt : '';
      if (!partyKey) {
        for (const e of ents) {
          const le = str(e.FIELD03);
          if (le && vendorIds.has(le)) {
            partyKey = le;
            break;
          }
        }
      }
      const meta = partyKey ? ledgerMeta.get(partyKey) : null;
      const vendorId = partyKey ? vendorIds.get(partyKey) || null : null;
      if (!partyKey || !vendorId) {
        coverage.salesInvoices.skipped++;
        coverage.salesInvoices.skipReason = 'Sales voucher missing trading party';
        issues.error({
          stage: 'invoices',
          message: 'Sales voucher missing trading party — skipped ops invoice',
          externalRef: ext,
        });
      } else if (!(amount > 0) && opsLineItems.length === 0) {
        coverage.salesInvoices.skipped++;
        coverage.salesInvoices.skipReason = 'Sales voucher has invalid amount';
        issues.error({
          stage: 'invoices',
          message: 'Sales voucher has invalid amount — skipped ops invoice',
          externalRef: ext,
        });
      } else {
        const lineItems =
          opsLineItems.length > 0
            ? opsLineItems
            : [
                {
                  description: narration || 'Miracle sale',
                  hsnSac: null,
                  qty: 1,
                  rate: amount,
                  gstPercent: 0,
                  discountPercent: 0,
                  productId: null,
                  taxable: amount,
                  tax: 0,
                  total: amount,
                },
              ];
        await upsertOpsInvoice(
          client,
          tenantId,
          ext,
          vNumber || `MIR-${ext}`,
          meta?.name || partyKey,
          meta?.gstin || null,
          meta?.address || null,
          meta?.phone || null,
          vendorId,
          lineItems,
          vDate,
          narration,
        );
        summary.invoices++;
        coverage.salesInvoices.imported++;
      }
    } else if (voucherType === 'receipt' || voucherType === 'payment') {
      pendingCash.push({
        ext,
        voucherType,
        vDate,
        amount,
        partyExt,
        contraExt,
        vNumber,
        narration,
      });
    } else if (voucherType === 'journal') {
      coverage.journalsBooksOnly++;
    }
  }

  // Second pass: cash book → payments / cash-income invoices (after sales invoices exist)
  for (const cash of pendingCash) {
    // Party may be on FIELD04 or FIELD05 depending on side
    const partyKey = vendorIds.has(cash.partyExt) ? cash.partyExt : vendorIds.has(cash.contraExt) ? cash.contraExt : '';
    const incomeExt = [cash.partyExt, cash.contraExt].find(x => isCashIncomeLedgerType(ledgerTypes.get(x)));
    const incomeMeta = incomeExt ? ledgerMeta.get(incomeExt) : null;

    if (partyKey) {
      coverage.partyCash.source++;
      if (!(cash.amount > 0)) {
        coverage.partyCash.skipped++;
        coverage.partyCash.skipReason = 'Invalid amount';
        issues.error({
          stage: 'payments',
          message: `${cash.voucherType} has invalid amount — skipped`,
          externalRef: cash.ext,
        });
        continue;
      }
      const vendorId = vendorIds.get(partyKey)!;
      const method = 'Cash';
      if (cash.voucherType === 'receipt') {
        const allocated = await allocateReceiptToInvoices(
          client,
          tenantId,
          vendorId,
          cash.amount,
          cash.vDate,
          method,
          cash.vNumber,
          cash.ext,
          cash.narration,
        );
        summary.invoicePayments += allocated.invoicePayments;
        summary.vendorPayments += allocated.vendorPayments;
      } else {
        const ok = await upsertVendorPayment(
          client,
          tenantId,
          vendorId,
          cash.amount,
          cash.vDate,
          method,
          cash.vNumber,
          cash.narration ? `Miracle payment: ${cash.narration}` : `Miracle payment ${cash.ext}`,
          `miracle:${cash.ext}`,
        );
        if (ok) summary.vendorPayments++;
      }
      coverage.partyCash.imported++;
      continue;
    }

    // Cash receipt to income ledger (job work / scrap etc.) → paid invoice (no party)
    if (cash.voucherType === 'receipt' && incomeExt && incomeMeta) {
      coverage.cashIncomeInvoices.source++;
      if (!(cash.amount > 0)) {
        coverage.cashIncomeInvoices.skipped++;
        coverage.cashIncomeInvoices.skipReason = 'Invalid amount';
        issues.error({
          stage: 'invoices',
          message: 'Cash income receipt has invalid amount — skipped',
          externalRef: cash.ext,
        });
        continue;
      }
      const incomeName = incomeMeta.name || incomeExt;
      const invId = await upsertOpsInvoice(
        client,
        tenantId,
        cash.ext,
        cash.vNumber || `MIR-CASH-${cash.ext}`,
        incomeName,
        null,
        null,
        null,
        null,
        [
          {
            description: cash.narration || incomeName,
            hsnSac: null,
            qty: 1,
            rate: cash.amount,
            gstPercent: 0,
            discountPercent: 0,
            productId: null,
            taxable: cash.amount,
            tax: 0,
            total: cash.amount,
          },
        ],
        cash.vDate,
        cash.narration ? `Miracle cash income: ${cash.narration}` : `Miracle cash income ${cash.ext}`,
        'paid',
      );
      // Record payment against the invoice for Finance totals
      await client.query(`DELETE FROM invoice_payments WHERE tenant_id = $1 AND idempotency_key = $2`, [
        tenantId,
        `miracle:${cash.ext}:cash`,
      ]);
      await client.query(
        `INSERT INTO invoice_payments
           (id, tenant_id, invoice_id, amount, payment_date, payment_method, reference_number, notes, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          uid('IP'),
          tenantId,
          invId,
          cash.amount,
          cash.vDate,
          'Cash',
          cash.vNumber,
          cash.narration ? `Miracle cash income: ${cash.narration}` : `Miracle cash income ${cash.ext}`,
          `miracle:${cash.ext}:cash`,
        ],
      );
      summary.invoices++;
      summary.invoicePayments++;
      coverage.cashIncomeInvoices.imported++;
      continue;
    }

    // Expense / capital / FA / other non-ops cash — Books only
    coverage.nonPartyCashSkipped++;
  }

  const { errors, warnings } = issues.finalize();
  const persisted = { ...summary, errors, warnings };

  await client.query(
    `UPDATE book_import_jobs
     SET status = 'completed', summary = $1::jsonb, finished_at = NOW(), error_message = NULL
     WHERE id = $2 AND tenant_id = $3`,
    [JSON.stringify(persisted), jobId, tenantId],
  );

  logger.info('Miracle import completed', {
    tenantId,
    jobId,
    ...summary,
    errorCount: errors.length,
    warningCount: warnings.length,
  });
  return { summary, errors, warnings };
}
