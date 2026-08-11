/**
 * Miracle Accounting (RKIT) CMP folder → Books tables + Dhandho ops tables.
 * Expects extracted company folder (CMP0001/) containing version.txt + YRxx year DBFs.
 *
 * Ops dual-write (idempotent via external_ref / idempotency_key):
 *   PR ledgers → vendors
 *   products   → products
 *   SP/SE/SS/QS sales → standalone_invoices
 *   CN / sales return → credit_debit_notes (credit)
 *   DN / purchase return → credit_debit_notes (debit)
 *   CB party R/P → invoice_payments (bill-ref then FIFO) and/or vendor_payments
 *   PU purchase / CT contra → typed Books vouchers (ops purchase stock dual-write later)
 *   payment_method inferred from contra cash/bank ledger + cheque/instrument fields
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
import { allocatePartyReceipt, normalizeDocNumber, upsertVendorPayment } from './partyCashOps';

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
  creditNotes: MiracleImportCoverageBucket;
  debitNotes: MiracleImportCoverageBucket;
  /** Expense/capital/FA/etc. cash — kept in Books only */
  nonPartyCashSkipped: number;
  /** Journals — Books only (not ops) */
  journalsBooksOnly: number;
  /** Purchase / purchase-return / contra — typed in Books; ops stock dual-write later */
  purchasesBooksOnly: number;
  contraBooksOnly: number;
  /** Receipt slices matched via Miracle bill / invoice number (not FIFO) */
  billMatchedPayments: number;
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
  creditDebitNotes: number;
  /** Count of ops payments by inferred method (Cash / Bank Transfer / …) */
  paymentsByMethod: Record<string, number>;
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

/** Ops payment methods shown in Invoice / Vendor Finance. */
export type MiracleOpsPaymentMethod = 'Cash' | 'Bank Transfer' | 'UPI' | 'Cheque' | 'Other';

/**
 * Infer Dhandho payment method from Miracle cash/bank book contra ledger + instrument ref.
 * Miracle has no dedicated mode enum — mode is the cash/bank ledger on the voucher.
 */
export function resolveMiraclePaymentMethod(input: {
  contraLedgerType?: string | null;
  contraLedgerName?: string | null;
  contraGroupName?: string | null;
  instrumentRef?: string | null;
}): MiracleOpsPaymentMethod {
  const type = (input.contraLedgerType || '').toUpperCase();
  const name = `${input.contraLedgerName || ''} ${input.contraGroupName || ''}`.toLowerCase();
  const ref = (input.instrumentRef || '').trim();
  const refLower = ref.toLowerCase();

  if (/upi|gpay|google pay|phonepe|paytm|bhim/.test(name) || /upi|gpay|phonepe|paytm/.test(refLower)) {
    return 'UPI';
  }
  if (ref && /chq|cheque|chk\b/.test(refLower)) return 'Cheque';

  const looksBank =
    type === 'BK' ||
    type === 'BN' ||
    /\bbank\b|hdfc|icici|sbi\b|axis|kotak|yes bank|pnb|canara|union bank|boi\b|idfc|indusind|federal bank|bandhan/.test(
      name,
    );
  const looksCash = type === 'CS' || /\bcash\b|cash[- ]?in[- ]?hand|petty cash/.test(name);

  if (looksCash && !looksBank) return 'Cash';
  if (looksBank) {
    // Numeric instrument on bank ledger is usually a cheque number
    if (ref && /^\d{5,}$/.test(ref)) return 'Cheque';
    return 'Bank Transfer';
  }
  if (ref) return 'Bank Transfer';
  return 'Other';
}

/** First non-empty instrument / voucher reference from CB header (+ optional cheque register). */
export function pickMiraclePaymentReference(header: DbfRecord, chequeRegisterRef?: string | null): string | null {
  const candidates = [
    chequeRegisterRef,
    str(header.FIELD10),
    str(header.FIELD82),
    str(header.FIELD80),
    str(header.FIELD81),
    str(header.T41F08),
    str(header.FIELD12),
    str(header.T41FVNO),
  ];
  for (const c of candidates) {
    const t = (c || '').trim();
    if (t) return t;
  }
  return null;
}

function bumpPaymentMethod(counts: Record<string, number>, method: string, n = 1): void {
  counts[method] = (counts[method] || 0) + n;
}

function emptyCoverage(): MiracleImportCoverage {
  return {
    parties: { source: 0, imported: 0, skipped: 0 },
    products: { source: 0, imported: 0, skipped: 0 },
    salesInvoices: { source: 0, imported: 0, skipped: 0 },
    cashIncomeInvoices: { source: 0, imported: 0, skipped: 0 },
    partyCash: { source: 0, imported: 0, skipped: 0 },
    creditNotes: { source: 0, imported: 0, skipped: 0 },
    debitNotes: { source: 0, imported: 0, skipped: 0 },
    nonPartyCashSkipped: 0,
    journalsBooksOnly: 0,
    purchasesBooksOnly: 0,
    contraBooksOnly: 0,
    billMatchedPayments: 0,
  };
}

/** Collapse Miracle padded doc nos (`GT/     1` → `GT/1`). */
export const normalizeMiracleDocNumber = normalizeDocNumber;

/**
 * Map Miracle header type/subtype (+ FIELD98 shortcut) → Books voucher_type.
 * FIELD98 mirrors UI voucher shortcuts: SS sales, CR/CP cash, PU purchase, CN/DN notes, QS estimate.
 */
export function mapVoucherType(miracleType: string, subtype: string, field98 = ''): string {
  const t = miracleType.toUpperCase();
  const s = subtype.toUpperCase();
  const f = field98.toUpperCase();

  if ((t === 'CB' && s === 'R') || f === 'CR') return 'receipt';
  if ((t === 'CB' && s === 'P') || f === 'CP') return 'payment';
  if (t === 'JR' || s === 'J' || f === 'JR') return 'journal';
  if (t === 'CT' || f === 'CT') return 'contra';
  if (t === 'CN' || f === 'CN' || t === 'SR' || f === 'SR') return 'credit_note';
  if (t === 'DN' || f === 'DN') return 'debit_note';
  if (t === 'PU' || f === 'PU' || t === 'PH') return 'purchase';
  if (t === 'QR' || f === 'QR') return 'purchase_return';
  if (t === 'SP' || s === 'D' || f === 'SS') return 'sales';
  if (t === 'SE' || f === 'QS') return 'sales';
  return 'other';
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

/** Resolve archive member path under dest; reject `..` / absolute escapes. */
function safeExtractPath(destDir: string, entryName: string): string | null {
  const rel = entryName.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rel || rel.includes('\0')) return null;
  const resolved = path.resolve(destDir, rel);
  const root = path.resolve(destDir);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

/**
 * Pure-JS RAR extract (Emscripten unrar) — used on Render/online where `unrar` is not installed.
 */
export async function extractRarJs(archivePath: string, destDir: string): Promise<void> {
  const { createExtractorFromData } = await import('node-unrar-js');
  const data = Uint8Array.from(fs.readFileSync(archivePath)).buffer;
  const extractor = await createExtractorFromData({ data });
  const { files } = extractor.extract();
  for (const file of files) {
    const out = safeExtractPath(destDir, file.fileHeader.name);
    if (!out) continue;
    if (file.fileHeader.flags.directory) {
      fs.mkdirSync(out, { recursive: true });
      continue;
    }
    if (!file.extraction) continue;
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, Buffer.from(file.extraction));
  }
}

async function extractRarArchive(archivePath: string, destDir: string): Promise<void> {
  // 1) bsdtar (macOS)  2) system unrar  3) pure JS (Render / Linux without unrar)
  try {
    await execFileAsync('bsdtar', ['-xf', archivePath, '-C', destDir]);
    return;
  } catch {
    /* try next */
  }
  try {
    await execFileAsync('unrar', ['x', '-o+', archivePath, destDir]);
    return;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/ENOENT|not found|spawn/i.test(msg)) {
      // unrar present but failed — still try JS before giving up
      try {
        await extractRarJs(archivePath, destDir);
        return;
      } catch {
        throw err;
      }
    }
  }
  await extractRarJs(archivePath, destDir);
}

/**
 * Extract Miracle CMP .zip / .rar.
 * `originalName` is required when the on-disk path has no extension (multer `dest` uploads).
 */
export async function extractArchive(archivePath: string, originalName?: string): Promise<string> {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-import-'));
  const lower = (originalName || archivePath).toLowerCase();
  try {
    if (lower.endsWith('.zip')) {
      await execFileAsync('unzip', ['-q', archivePath, '-d', tmp]);
    } else if (lower.endsWith('.rar')) {
      await extractRarArchive(archivePath, tmp);
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

async function upsertOpsNote(
  client: PoolClient,
  tenantId: string,
  externalRef: string,
  noteType: 'credit' | 'debit',
  noteNumber: string,
  vendorId: string | null,
  vendorName: string,
  noteDate: string,
  reason: string | null,
  items: Array<{ description: string; quantity: number; price: number; lineNet: number; lineTotal: number }>,
  referenceInvoice: string | null,
): Promise<boolean> {
  const subtotal = items.reduce((s, it) => s + it.lineNet, 0);
  const total = items.reduce((s, it) => s + it.lineTotal, 0);
  const resolvedItems = items.map(it => ({
    description: it.description,
    quantity: it.quantity,
    price: it.price,
    withGst: false,
    lineNet: it.lineNet,
    lineGst: 0,
    lineTotal: it.lineTotal,
  }));
  const itemsJson = JSON.stringify(resolvedItems);
  const existing = (
    await client.query(`SELECT id FROM credit_debit_notes WHERE tenant_id = $1 AND external_ref = $2`, [
      tenantId,
      externalRef,
    ])
  ).rows[0] as { id: string } | undefined;
  if (existing) {
    await client.query(
      `UPDATE credit_debit_notes SET
         note_number = $3, note_type = $4, vendor_id = $5, vendor_name = $6, customer_name = $7,
         note_date = $8, reason = $9, items = $10::jsonb, subtotal = $11, gst_rate = 0, gst_amount = 0,
         total = $12, reference_invoice = $13, status = 'Active'
       WHERE id = $1 AND tenant_id = $2`,
      [
        existing.id,
        tenantId,
        noteNumber,
        noteType,
        vendorId,
        vendorName,
        vendorName,
        noteDate,
        reason,
        itemsJson,
        subtotal,
        total,
        referenceInvoice,
      ],
    );
    return true;
  }
  const id = uid(noteType === 'credit' ? 'CN' : 'DN');
  await client.query(
    `INSERT INTO credit_debit_notes
       (id, tenant_id, note_number, note_type, vendor_id, vendor_name, customer_name, note_date,
        reason, items, subtotal, gst_rate, gst_amount, total, reference_invoice, status, external_ref)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,0,0,$12,$13,'Active',$14)`,
    [
      id,
      tenantId,
      noteNumber,
      noteType,
      vendorId,
      vendorName,
      vendorName,
      noteDate,
      reason,
      itemsJson,
      subtotal,
      total,
      referenceInvoice,
      externalRef,
    ],
  );
  return true;
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
    creditDebitNotes: 0,
    paymentsByMethod: {},
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
  const ledgerGroupExt = new Map<string, string>();
  const groupNames = new Map<string, string>();

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
      const gName = str(r.FIELD02) || str(r.FIELD11) || ext;
      groupNames.set(ext, gName);
      await upsertGroup(
        client,
        tenantId,
        ext,
        gName,
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
    if (groupExt) ledgerGroupExt.set(ext, groupExt);

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

  // Cheque / instrument register (when present) — keyed by voucher external ref
  const chequeRefByVoucher = new Map<string, string>();
  const chequePath = findDbf(yrDir, 'RKACCT05.DBF') || findDbf(yrDir, 'rkacct05.dbf');
  if (chequePath) {
    for (const r of readDbf(chequePath).records) {
      const vid = str(r.FIELD01) || str(r.T05F01);
      const chq = str(r.FIELD07) || str(r.FIELD21) || str(r.FIELD23) || str(r.T05F07);
      if (vid && chq) chequeRefByVoucher.set(vid, chq);
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
    paymentMethod: MiracleOpsPaymentMethod;
    referenceNumber: string | null;
    contraName: string | null;
    /** Bill-wise invoice numbers from entry FIELD12 / T41FVNO */
    billRefs: string[];
  };
  const pendingCash: PendingCash[] = [];

  for (const h of headers) {
    const ext = str(h.FIELD01);
    if (!ext) continue;
    const field98 = str(h.FIELD98) || '';
    const miracleType = str(h.FIELD74) || field98 || '';
    const subtype = str(h.FIELD16) || '';
    const voucherType = mapVoucherType(miracleType, subtype, field98);
    const vDate = dateStr(h.FIELD02) || '2025-04-01';
    const vNumberRaw = str(h.FIELD12) || str(h.T41FVNO) || '';
    const vNumber = normalizeMiracleDocNumber(vNumberRaw) || null;
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

    const resolvePartyKey = (): string => {
      let partyKey = partyExt && vendorIds.has(partyExt) ? partyExt : '';
      if (!partyKey && contraExt && vendorIds.has(contraExt)) partyKey = contraExt;
      if (!partyKey) {
        for (const e of ents) {
          const le = str(e.FIELD03);
          if (le && vendorIds.has(le)) {
            partyKey = le;
            break;
          }
        }
      }
      return partyKey;
    };

    if (voucherType === 'sales') {
      coverage.salesInvoices.source++;
      const partyKey = resolvePartyKey();
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
    } else if (voucherType === 'credit_note' || voucherType === 'debit_note' || voucherType === 'purchase_return') {
      const noteType: 'credit' | 'debit' =
        voucherType === 'debit_note' || voucherType === 'purchase_return' ? 'debit' : 'credit';
      const bucket = noteType === 'credit' ? coverage.creditNotes : coverage.debitNotes;
      bucket.source++;
      const partyKey = resolvePartyKey();
      const meta = partyKey ? ledgerMeta.get(partyKey) : null;
      const vendorId = partyKey ? vendorIds.get(partyKey) || null : null;
      if (!partyKey || !vendorId) {
        bucket.skipped++;
        bucket.skipReason = 'Note missing trading party';
        issues.error({
          stage: 'notes',
          message: `${noteType} note missing trading party — skipped`,
          externalRef: ext,
        });
      } else if (!(amount > 0) && opsLineItems.length === 0) {
        bucket.skipped++;
        bucket.skipReason = 'Note has invalid amount';
        issues.error({
          stage: 'notes',
          message: `${noteType} note has invalid amount — skipped`,
          externalRef: ext,
        });
      } else {
        const noteItems =
          opsLineItems.length > 0
            ? opsLineItems.map(it => ({
                description: it.description,
                quantity: it.qty,
                price: it.rate,
                lineNet: it.taxable,
                lineTotal: it.total,
              }))
            : [
                {
                  description: narration || `Miracle ${noteType} note`,
                  quantity: 1,
                  price: amount,
                  lineNet: amount,
                  lineTotal: amount,
                },
              ];
        const prefix = noteType === 'credit' ? 'CN' : 'DN';
        await upsertOpsNote(
          client,
          tenantId,
          ext,
          noteType,
          vNumber || `${prefix}-${ext}`,
          vendorId,
          meta?.name || partyKey,
          vDate,
          narration,
          noteItems,
          null,
        );
        summary.creditDebitNotes++;
        bucket.imported++;
      }
    } else if (voucherType === 'receipt' || voucherType === 'payment') {
      // Contra = cash/bank side (FIELD05 usually; flip when party is on FIELD05)
      const partyOn04 = isOpsPartyLedgerType(ledgerTypes.get(partyExt));
      const partyOn05 = isOpsPartyLedgerType(ledgerTypes.get(contraExt));
      const cashBankExt =
        partyOn04 && !partyOn05 ? contraExt : !partyOn04 && partyOn05 ? partyExt : contraExt || partyExt;
      const contraMeta = cashBankExt ? ledgerMeta.get(cashBankExt) : null;
      const contraGroup = cashBankExt ? groupNames.get(ledgerGroupExt.get(cashBankExt) || '') : null;
      const referenceNumber = pickMiraclePaymentReference(h, chequeRefByVoucher.get(ext) || null);
      const paymentMethod = resolveMiraclePaymentMethod({
        contraLedgerType: contraMeta?.ledgerType || ledgerTypes.get(cashBankExt || '') || null,
        contraLedgerName: contraMeta?.name || null,
        contraGroupName: contraGroup || null,
        instrumentRef: referenceNumber,
      });
      const billRefs: string[] = [];
      const seenBill = new Set<string>();
      for (const e of ents) {
        for (const raw of [str(e.FIELD12), str(e.T41FVNO)]) {
          const n = normalizeMiracleDocNumber(raw);
          if (!n || seenBill.has(n)) continue;
          seenBill.add(n);
          billRefs.push(n);
        }
      }
      pendingCash.push({
        ext,
        voucherType,
        vDate,
        amount,
        partyExt,
        contraExt,
        vNumber,
        narration,
        paymentMethod,
        referenceNumber: referenceNumber || vNumber,
        contraName: contraMeta?.name || null,
        billRefs,
      });
    } else if (voucherType === 'journal') {
      coverage.journalsBooksOnly++;
    } else if (voucherType === 'purchase') {
      coverage.purchasesBooksOnly++;
    } else if (voucherType === 'contra') {
      coverage.contraBooksOnly++;
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
      const method = cash.paymentMethod;
      const via = cash.contraName ? ` via ${cash.contraName}` : '';
      const ref = cash.referenceNumber;
      if (cash.voucherType === 'receipt') {
        const allocated = await allocatePartyReceipt(
          client,
          tenantId,
          vendorId,
          cash.amount,
          cash.vDate,
          method,
          ref,
          `miracle:${cash.ext}`,
          cash.narration ? `${cash.narration}${via}` : `Miracle receipt${via}`,
          cash.billRefs,
          'Miracle receipt',
        );
        summary.invoicePayments += allocated.invoicePayments;
        summary.vendorPayments += allocated.vendorPayments;
        coverage.billMatchedPayments += allocated.billMatched;
        bumpPaymentMethod(summary.paymentsByMethod, method, allocated.invoicePayments + allocated.vendorPayments);
      } else {
        const ok = await upsertVendorPayment(
          client,
          tenantId,
          vendorId,
          cash.amount,
          cash.vDate,
          method,
          ref,
          cash.narration ? `Miracle payment: ${cash.narration}${via}` : `Miracle payment ${cash.ext}${via}`,
          `miracle:${cash.ext}`,
        );
        if (ok) {
          summary.vendorPayments++;
          bumpPaymentMethod(summary.paymentsByMethod, method);
        }
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
      const via = cash.contraName ? ` via ${cash.contraName}` : '';
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
          cash.paymentMethod,
          cash.referenceNumber,
          cash.narration ? `Miracle cash income: ${cash.narration}${via}` : `Miracle cash income ${cash.ext}${via}`,
          `miracle:${cash.ext}:cash`,
        ],
      );
      summary.invoices++;
      summary.invoicePayments++;
      bumpPaymentMethod(summary.paymentsByMethod, cash.paymentMethod);
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
