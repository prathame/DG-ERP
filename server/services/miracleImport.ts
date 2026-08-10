/**
 * Miracle Accounting (RKIT) CMP folder → Books tables.
 * Expects extracted company folder (CMP0001/) containing version.txt + YRxx year DBFs.
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
    throw new Error(`Miracle extract path not found: ${root}`);
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
  throw new Error('Could not find Miracle company folder (version.txt + year folder YRxx)');
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
      throw new Error('Unsupported archive — upload .rar or .zip of the Miracle CMP folder');
    }
  } catch (err) {
    fs.rmSync(tmp, { recursive: true, force: true });
    throw err;
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

export async function importMiracleCompany(
  client: PoolClient,
  tenantId: string,
  companyDir: string,
  jobId: string,
): Promise<MiracleImportSummary> {
  const { companyName, miracleVersion } = parseVersionTxt(companyDir);
  const year = findYearDir(companyDir);
  if (!year) throw new Error('No YR** financial year folder found in Miracle company data');

  const yrDir = year.dir;
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

  // Groups — rkaccm11
  const groupsPath = findDbf(yrDir, 'rkaccm11.dbf');
  if (groupsPath) {
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
  if (!ledgersPath) throw new Error('Missing account master RKACCM01.DBF');
  const ledgerRows = readDbf(ledgersPath).records;
  const addrPath = findDbf(yrDir, 'rkaccm02.dbf');
  const addrById = new Map<string, DbfRecord>();
  if (addrPath) {
    for (const r of readDbf(addrPath).records) {
      const id = str(r.FIELD01);
      if (id) addrById.set(id, r);
    }
  }

  for (const r of ledgerRows) {
    const ext = str(r.FIELD01);
    if (!ext) continue;
    const name = str(r.FIELD02) || ext;
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
    if (a) {
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
  if (prodPath) {
    for (const r of readDbf(prodPath).records) {
      const ext = str(r.FIELD01);
      if (!ext) continue;
      const rt = rates.get(ext);
      const id = uid('BP');
      await client.query(
        `INSERT INTO book_products
          (id, tenant_id, name, code, unit, hsn_code, sale_rate, purchase_rate, mrp, tax_class, external_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT (tenant_id, external_ref) DO UPDATE SET
           name = EXCLUDED.name, sale_rate = EXCLUDED.sale_rate, unit = EXCLUDED.unit`,
        [
          id,
          tenantId,
          str(r.FIELD02) || ext,
          str(r.FIELD04) || null,
          str(r.FIELD05) || null,
          str(r.FIELD40) || null,
          num(rt?.M29F03),
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
  if (!hdrPath) throw new Error('Missing voucher header RKACCT41.DBF');
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
    for (const it of items) {
      const prodExt = str(it.FIELD03);
      const productId = prodExt ? productIds.get(prodExt) || null : null;
      itemNo++;
      await client.query(
        `INSERT INTO book_voucher_items
          (id, tenant_id, voucher_id, line_no, product_id, qty, rate, amount, external_ref)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          uid('BI'),
          tenantId,
          ourVoucherId,
          itemNo,
          productId,
          num(it.FIELD06),
          num(it.FIELD07),
          num(it.FIELD08),
          `${ext}:I${itemNo}`,
        ],
      );
      summary.voucherItems++;
    }
  }

  await client.query(
    `UPDATE book_import_jobs
     SET status = 'completed', summary = $1::jsonb, finished_at = NOW(), error_message = NULL
     WHERE id = $2 AND tenant_id = $3`,
    [JSON.stringify(summary), jobId, tenantId],
  );

  logger.info('Miracle import completed', { tenantId, jobId, ...summary });
  return summary;
}
