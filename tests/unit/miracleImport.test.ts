/**
 * Coverage for Miracle DBF import (server/services/miracleImport + dbf helpers).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { findDbf, num, readDbf, str, dateStr } from '../../server/utils/dbf';
import {
  extractArchive,
  expandPurchaseStockUnits,
  importMiracleCompany,
  isCashIncomeLedgerType,
  isOpsPartyLedgerType,
  locateCompanyDir,
  mapVoucherType,
  normalizeMiracleDocNumber,
  pickMiraclePaymentReference,
  resolveMiraclePaymentMethod,
  sumPurchaseInputGst,
} from '../../server/services/miracleImport';

const TENANT = 'T-TEST-MIRACLE';

type FieldDef = { name: string; type: 'C' | 'N' | 'F' | 'D' | 'L'; length: number; decimals?: number };

function writeDbf(filePath: string, fields: FieldDef[], rows: Record<string, string | number | boolean | null>[]) {
  const headerLen = 32 + fields.length * 32 + 1;
  const recordLen = 1 + fields.reduce((s, f) => s + f.length, 0);
  const buf = Buffer.alloc(headerLen + rows.length * recordLen + 1, 0);
  buf[0] = 0x03;
  buf.writeUInt32LE(rows.length, 4);
  buf.writeUInt16LE(headerLen, 8);
  buf.writeUInt16LE(recordLen, 10);
  fields.forEach((f, i) => {
    const off = 32 + i * 32;
    buf.write(f.name.slice(0, 11), off, 'ascii');
    buf[off + 11] = f.type.charCodeAt(0);
    buf[off + 16] = f.length;
    buf[off + 17] = f.decimals || 0;
  });
  buf[headerLen - 1] = 0x0d;
  let offset = headerLen;
  for (const row of rows) {
    buf[offset] = 0x20;
    offset += 1;
    for (const f of fields) {
      const raw = row[f.name];
      let cell = '';
      if (f.type === 'C')
        cell = String(raw ?? '')
          .padEnd(f.length)
          .slice(0, f.length);
      else if (f.type === 'N' || f.type === 'F') {
        const n = raw == null || raw === '' ? '' : String(raw);
        cell = n.padStart(f.length).slice(-f.length);
      } else if (f.type === 'D') {
        const s = String(raw ?? '').replace(/-/g, '');
        cell = (s || '').padEnd(8).slice(0, 8);
      } else if (f.type === 'L') {
        cell = raw === true ? 'T' : raw === false ? 'F' : ' ';
      }
      buf.write(cell, offset, 'ascii');
      offset += f.length;
    }
  }
  buf[offset] = 0x1a;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buf);
}

function buildMiracleCompany(root: string): string {
  const company = path.join(root, 'CMP0001');
  const yr = path.join(company, 'YR25');
  fs.mkdirSync(yr, { recursive: true });
  fs.writeFileSync(
    path.join(company, 'version.txt'),
    'Company Name : FIXTURE ENGINEERING\nMiracle Version : 9.0  Rel (7.0)   Build : 1\n',
  );

  writeDbf(
    path.join(yr, 'rkaccm11.dbf'),
    [
      { name: 'FIELD01', type: 'C', length: 8 },
      { name: 'FIELD02', type: 'C', length: 40 },
      { name: 'FIELD04', type: 'C', length: 8 },
      { name: 'FIELD05', type: 'C', length: 8 },
      { name: 'FIELD06', type: 'C', length: 1 },
      { name: 'FIELD08', type: 'C', length: 2 },
      { name: 'FIELD09', type: 'C', length: 1 },
      { name: 'FIELD11', type: 'C', length: 40 },
    ],
    [
      {
        FIELD01: 'G0000001',
        FIELD02: 'Current Assets',
        FIELD04: '',
        FIELD05: 'G0000001',
        FIELD06: 'B',
        FIELD08: 'CA',
        FIELD09: 'A',
        FIELD11: 'Current Assets',
      },
      {
        FIELD01: 'G0000002',
        FIELD02: 'Sundry Debtors',
        FIELD04: 'G0000001',
        FIELD05: 'G0000001',
        FIELD06: 'B',
        FIELD08: 'SD',
        FIELD09: 'A',
        FIELD11: 'Sundry Debtors',
      },
    ],
  );

  writeDbf(
    path.join(yr, 'RKACCM01.DBF'),
    [
      { name: 'FIELD01', type: 'C', length: 8 },
      { name: 'FIELD02', type: 'C', length: 40 },
      { name: 'FIELD04', type: 'C', length: 1 },
      { name: 'FIELD05', type: 'C', length: 8 },
      { name: 'FIELD06', type: 'C', length: 8 },
      { name: 'FIELD07', type: 'C', length: 2 },
      { name: 'FIELD10', type: 'N', length: 14, decimals: 2 },
      { name: 'FIELD31', type: 'C', length: 25 },
      { name: 'FIELD40', type: 'C', length: 15 },
      { name: 'M01F05', type: 'C', length: 15 },
      { name: 'M01F15', type: 'C', length: 15 },
      { name: 'M01F18', type: 'C', length: 21 },
    ],
    [
      {
        FIELD01: 'ACASHACT',
        FIELD02: 'Cash Account',
        FIELD04: 'B',
        FIELD05: 'G0000001',
        FIELD06: 'G0000001',
        FIELD07: 'CS',
        FIELD10: 0,
        FIELD31: '',
        FIELD40: '',
        M01F05: '',
        M01F15: '',
        M01F18: '',
      },
      {
        FIELD01: 'AGPARTY1',
        FIELD02: 'MITULBHAI',
        FIELD04: 'B',
        FIELD05: 'G0000002',
        FIELD06: 'G0000002',
        FIELD07: 'PR',
        FIELD10: 1000,
        FIELD31: 'Rajkot',
        FIELD40: '24AAAAA0000A1Z5',
        M01F05: '9876543210',
        M01F15: '9876543210',
        M01F18: 'a@b.com',
      },
      {
        FIELD01: 'AGO5S34X',
        FIELD02: 'JOB WORK',
        FIELD04: 'T',
        FIELD05: 'G0000001',
        FIELD06: 'G0000001',
        FIELD07: 'TS',
        FIELD10: 0,
        FIELD31: '',
        FIELD40: '',
        M01F05: '',
        M01F15: '',
        M01F18: '',
      },
      {
        FIELD01: 'AORPHAN1',
        FIELD02: 'Orphan Ledger',
        FIELD04: 'B',
        FIELD05: 'GORPHAN1',
        FIELD06: '',
        FIELD07: 'GL',
        FIELD10: 0,
        FIELD31: '',
        FIELD40: '',
        M01F05: '',
        M01F15: '',
        M01F18: '',
      },
      {
        FIELD01: 'ALIABIL1',
        FIELD02: 'MANOJBHAI LOAN',
        FIELD04: 'L',
        FIELD05: 'G0000001',
        FIELD06: 'G0000001',
        FIELD07: 'LI',
        FIELD10: 0,
        FIELD31: '',
        FIELD40: '',
        M01F05: '',
        M01F15: '',
        M01F18: '',
      },
      {
        FIELD01: 'AINCOME1',
        FIELD02: 'JOB WORK INCOME',
        FIELD04: 'I',
        FIELD05: 'G0000001',
        FIELD06: 'G0000001',
        FIELD07: 'IN',
        FIELD10: 0,
        FIELD31: '',
        FIELD40: '',
        M01F05: '',
        M01F15: '',
        M01F18: '',
      },
    ],
  );

  writeDbf(
    path.join(yr, 'rkaccm02.dbf'),
    [
      { name: 'FIELD01', type: 'C', length: 8 },
      { name: 'FIELD02', type: 'C', length: 40 },
      { name: 'FIELD05', type: 'C', length: 25 },
      { name: 'FIELD53', type: 'C', length: 30 },
      { name: 'FIELD61', type: 'C', length: 40 },
      { name: 'M02F74', type: 'C', length: 2 },
      { name: 'FIELD21', type: 'C', length: 15 },
      { name: 'M02F71', type: 'C', length: 15 },
      { name: 'M02F77', type: 'C', length: 21 },
    ],
    [
      {
        FIELD01: 'AGPARTY1',
        FIELD02: 'Plot 1',
        FIELD05: 'Rajkot',
        FIELD53: 'Gujarat',
        FIELD61: 'MITULBHAI',
        M02F74: '24',
        FIELD21: '360001',
        M02F71: '9876543210',
        M02F77: 'a@b.com',
      },
    ],
  );

  writeDbf(
    path.join(yr, 'rkaccm21.dbf'),
    [
      { name: 'FIELD01', type: 'C', length: 8 },
      { name: 'FIELD02', type: 'C', length: 40 },
      { name: 'FIELD04', type: 'C', length: 10 },
      { name: 'FIELD05', type: 'C', length: 20 },
      { name: 'FIELD20', type: 'C', length: 8 },
      { name: 'FIELD40', type: 'C', length: 15 },
    ],
    [
      {
        FIELD01: 'PGITEM01',
        FIELD02: 'LUNCH BOX DIE',
        FIELD04: 'LB1',
        FIELD05: 'Numbers',
        FIELD20: 'VIB00001',
        FIELD40: '8480',
      },
    ],
  );

  writeDbf(
    path.join(yr, 'rkaccm29.dbf'),
    [
      { name: 'M29F01', type: 'C', length: 8 },
      { name: 'M29F02', type: 'N', length: 12, decimals: 2 },
      { name: 'M29F03', type: 'N', length: 12, decimals: 2 },
      { name: 'M29F10', type: 'N', length: 14, decimals: 2 },
    ],
    [{ M29F01: 'PGITEM01', M29F02: 0, M29F03: 560000, M29F10: 500000 }],
  );

  writeDbf(
    path.join(yr, 'RKACCT40.DBF'),
    [
      { name: 'T40F01', type: 'C', length: 12 },
      { name: 'T40F09', type: 'C', length: 4 },
      { name: 'T40F02', type: 'C', length: 40 },
    ],
    [{ T40F01: 'SSVOUCHER01', T40F09: 'XXXX', T40F02: 'TEST SALE' }],
  );

  writeDbf(
    path.join(yr, 'RKACCT41.DBF'),
    [
      { name: 'FIELD01', type: 'C', length: 12 },
      { name: 'FIELD02', type: 'D', length: 8 },
      { name: 'FIELD04', type: 'C', length: 8 },
      { name: 'FIELD05', type: 'C', length: 8 },
      { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
      { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
      { name: 'FIELD12', type: 'C', length: 25 },
      { name: 'FIELD16', type: 'C', length: 1 },
      { name: 'FIELD74', type: 'C', length: 2 },
      { name: 'T41FVNO', type: 'C', length: 25 },
    ],
    [
      {
        FIELD01: 'SSVOUCHER01',
        FIELD02: '20250501',
        FIELD04: 'AGPARTY1',
        FIELD05: 'AGO5S34X',
        FIELD06: 560000,
        FIELD07: 560000,
        FIELD12: 'GT/1',
        FIELD16: 'D',
        FIELD74: 'SP',
        T41FVNO: 'GT/1',
      },
      {
        FIELD01: 'CRVOUCHER02',
        FIELD02: '20250502',
        FIELD04: 'AGPARTY1',
        FIELD05: 'ACASHACT',
        FIELD06: 10000,
        FIELD07: 10000,
        FIELD12: '',
        FIELD16: 'R',
        FIELD74: 'CB',
        T41FVNO: '',
      },
      {
        FIELD01: 'CPVOUCHER03',
        FIELD02: '20250503',
        FIELD04: 'ACASHACT',
        FIELD05: 'AGPARTY1',
        FIELD06: 5000,
        FIELD07: 5000,
        FIELD12: '',
        FIELD16: 'P',
        FIELD74: 'CB',
        T41FVNO: '',
      },
      {
        FIELD01: 'JRVOUCHER04',
        FIELD02: '20250504',
        FIELD04: 'AGPARTY1',
        FIELD05: 'AGO5S34X',
        FIELD06: 100,
        FIELD07: 100,
        FIELD12: 'JV/1',
        FIELD16: 'J',
        FIELD74: 'JR',
        T41FVNO: 'JV/1',
      },
      {
        FIELD01: 'SEVOUCHER05',
        FIELD02: '20250505',
        FIELD04: 'AGPARTY1',
        FIELD05: 'AGO5S34X',
        FIELD06: 50,
        FIELD07: 50,
        FIELD12: 'SE/1',
        FIELD16: 'D',
        FIELD74: 'SE',
        T41FVNO: 'SE/1',
      },
    ],
  );

  writeDbf(
    path.join(yr, 'RKACCT01.DBF'),
    [
      { name: 'FIELD01', type: 'C', length: 12 },
      { name: 'FIELD03', type: 'C', length: 8 },
      { name: 'FIELD04', type: 'C', length: 8 },
      { name: 'FIELD05', type: 'N', length: 17, decimals: 2 },
      { name: 'FIELD06', type: 'C', length: 1 },
    ],
    [
      { FIELD01: 'SSVOUCHER01', FIELD03: 'AGPARTY1', FIELD04: 'AGO5S34X', FIELD05: 560000, FIELD06: 'D' },
      { FIELD01: 'SSVOUCHER01', FIELD03: 'AGO5S34X', FIELD04: 'AGPARTY1', FIELD05: 560000, FIELD06: 'C' },
      // SE intentionally has no ledger rows — importer must synthesize
    ],
  );

  writeDbf(
    path.join(yr, 'RKACCT02.DBF'),
    [
      { name: 'FIELD01', type: 'C', length: 12 },
      { name: 'FIELD03', type: 'C', length: 8 },
      { name: 'FIELD06', type: 'N', length: 14, decimals: 2 },
      { name: 'FIELD07', type: 'N', length: 12, decimals: 2 },
      { name: 'FIELD08', type: 'N', length: 17, decimals: 2 },
    ],
    [
      { FIELD01: 'SSVOUCHER01', FIELD03: 'PGITEM01', FIELD06: 1, FIELD07: 560000, FIELD08: 560000 },
      { FIELD01: 'SEVOUCHER05', FIELD03: 'PGITEM01', FIELD06: 1, FIELD07: 50, FIELD08: 50 },
    ],
  );

  return company;
}

beforeAll(async () => {
  await cleanupTestData(TENANT);
  // book + ops import tables may not be in cleanup yet
  for (const t of [
    'invoice_payments',
    'vendor_payments',
    'standalone_invoices',
    'products',
    'vendors',
    'book_voucher_items',
    'book_voucher_entries',
    'book_vouchers',
    'book_products',
    'book_ledger_details',
    'book_ledgers',
    'book_account_groups',
    'book_financial_years',
    'book_import_jobs',
  ]) {
    await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT]).catch(() => {});
  }
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
     VALUES ($1, 'Miracle Fixture', 'miracle-fix', 'm@test.com', 'M', 'active', 'manufacturer')
     ON CONFLICT (id) DO UPDATE SET business_type = 'manufacturer'`,
    [TENANT],
  );
});

afterAll(async () => {
  for (const t of [
    'invoice_payments',
    'vendor_payments',
    'standalone_invoices',
    'products',
    'vendors',
    'book_voucher_items',
    'book_voucher_entries',
    'book_vouchers',
    'book_products',
    'book_ledger_details',
    'book_ledgers',
    'book_account_groups',
    'book_financial_years',
    'book_import_jobs',
  ]) {
    await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT]).catch(() => {});
  }
  await cleanupTestData(TENANT);
});

describe('dbf helpers', () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  it('reads N/D/L fields and skips deleted rows', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbf-types-'));
    tmpDirs.push(dir);
    const file = path.join(dir, 'mixed.dbf');
    const fields: FieldDef[] = [
      { name: 'NAME', type: 'C', length: 10 },
      { name: 'AMT', type: 'N', length: 8, decimals: 2 },
      { name: 'DT', type: 'D', length: 8 },
      { name: 'OK', type: 'L', length: 1 },
    ];
    // write then mark first record deleted
    writeDbf(file, fields, [
      { NAME: 'gone', AMT: 1, DT: '20250101', OK: true },
      { NAME: 'keep', AMT: 12.5, DT: '20250615', OK: false },
    ]);
    const buf = fs.readFileSync(file);
    buf[32 + fields.length * 32 + 1] = 0x2a; // delete flag on first record — headerLen
    // headerLen = 32 + 4*32 + 1 = 161; first record starts at 161
    buf[161] = 0x2a;
    fs.writeFileSync(file, buf);

    const { records } = readDbf(file);
    expect(records).toHaveLength(1);
    expect(str(records[0].NAME)).toBe('keep');
    expect(num(records[0].AMT)).toBe(12.5);
    expect(dateStr(records[0].DT)).toBe('2025-06-15');
    expect(records[0].OK).toBe(false);
    expect(findDbf(dir, 'MIXED.DBF')).toBeTruthy();
  });

  it('str/num/dateStr edge cases', () => {
    expect(str(null)).toBe('');
    expect(str(new Date('2025-01-02T00:00:00Z'))).toBe('2025-01-02');
    expect(num(null)).toBe(0);
    expect(num('')).toBe(0);
    expect(num(3)).toBe(3);
    expect(num('x')).toBe(0);
    expect(dateStr(null)).toBeNull();
    expect(dateStr('')).toBeNull();
    expect(dateStr('2025-07-01T12:00:00Z')).toBe('2025-07-01');
    expect(dateStr(new Date('2025-03-04T00:00:00Z'))).toBe('2025-03-04');
    expect(dateStr('not-a-date')).toBeNull();
  });

  it('reads float and memo fields and rejects tiny files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbf-memo-'));
    tmpDirs.push(dir);
    expect(() => readDbf(path.join(dir, 'missing.dbf'))).toThrow();

    const tiny = path.join(dir, 'tiny.dbf');
    fs.writeFileSync(tiny, Buffer.alloc(10));
    expect(() => readDbf(tiny)).toThrow(/too small/);

    // Memo + float table
    const fields: FieldDef[] = [
      { name: 'CODE', type: 'C', length: 4 },
      { name: 'RATE', type: 'F', length: 10, decimals: 2 },
      { name: 'NOTE', type: 'C', length: 4 }, // write as C then patch type to M
    ];
    const file = path.join(dir, 'memo.dbf');
    writeDbf(file, fields, [{ CODE: 'A1', RATE: 1.5, NOTE: '   1' }]);
    const buf = fs.readFileSync(file);
    // field NOTE type at 32 + 2*32 + 11 = 107
    buf[32 + 2 * 32 + 11] = 0x4d; // 'M'
    fs.writeFileSync(file, buf);

    const fpt = Buffer.alloc(512 + 64, 0);
    fpt.writeUInt16BE(64, 6);
    fpt.writeInt32BE(1, 64);
    fpt.writeUInt32BE(11, 68);
    fpt.write('MEMO HELLO!', 72, 'ascii');
    fs.writeFileSync(path.join(dir, 'memo.fpt'), fpt);

    const { records } = readDbf(file);
    expect(num(records[0].RATE)).toBe(1.5);
    expect(str(records[0].NOTE)).toContain('MEMO');
  });

  it('covers invalid dates, unknown field types, and missing dirs', () => {
    expect(findDbf('/tmp/miracle-dbf-missing-dir-xyz', 'x.dbf')).toBeNull();

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dbf-edge-'));
    tmpDirs.push(dir);
    const fields: FieldDef[] = [
      { name: 'DT', type: 'D', length: 8 },
      { name: 'AMT', type: 'N', length: 6, decimals: 0 },
      { name: 'FLG', type: 'L', length: 1 },
      { name: 'X', type: 'C', length: 3 },
    ];
    const file = path.join(dir, 'edge.dbf');
    writeDbf(file, fields, [
      { DT: 'bad', AMT: null, FLG: null, X: 'ok' },
      { DT: '20250101', AMT: 5, FLG: true, X: 'yy' },
    ]);
    const buf = fs.readFileSync(file);
    // patch field X type to unknown 'Z'
    buf[32 + 3 * 32 + 11] = 0x5a;
    // second record FLG = Y
    const headerLen = 32 + fields.length * 32 + 1;
    const recordLen = 1 + fields.reduce((s, f) => s + f.length, 0);
    buf[headerLen + recordLen + 1 + 8 + 6] = 0x59; // 'Y'
    fs.writeFileSync(file, buf);

    const { records } = readDbf(file);
    expect(records[0].DT).toBeNull();
    expect(records[0].AMT).toBeNull();
    expect(records[0].FLG).toBeNull();
    expect(str(records[0].X)).toBe('ok');
    expect(records[1].FLG).toBe(true);
  });
});

describe('miracleImport', () => {
  const tmpDirs: string[] = [];
  afterEach(() => {
    for (const d of tmpDirs) fs.rmSync(d, { recursive: true, force: true });
    tmpDirs.length = 0;
  });

  it('imports ledgers, products, and vouchers from a synthetic CMP folder', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-imp-'));
    tmpDirs.push(root);
    const company = buildMiracleCompany(root);

    for (const t of [
      'invoice_payments',
      'vendor_payments',
      'standalone_invoices',
      'products',
      'vendors',
      'book_voucher_items',
      'book_voucher_entries',
      'book_vouchers',
      'book_products',
      'book_ledger_details',
      'book_ledgers',
      'book_account_groups',
      'book_financial_years',
      'book_import_jobs',
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT]);
    }

    const jobId = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [jobId, TENANT],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { summary, errors, warnings } = await importMiracleCompany(client, TENANT, company, jobId);
      await client.query('COMMIT');
      expect(summary.companyName).toContain('FIXTURE');
      expect(summary.ledgers).toBe(6);
      expect(summary.products).toBe(1);
      expect(summary.vouchers).toBe(5);
      expect(summary.voucherEntries).toBe(4); // SP 2 lines + SE synthesized 2
      expect(summary.voucherItems).toBe(2); // SP + SE items
      expect(summary.groups).toBe(2);
      // Ops dual-write — PR trading + LI liability person
      expect(summary.vendors).toBe(2);
      expect(summary.opsProducts).toBe(1);
      expect(summary.invoices).toBeGreaterThanOrEqual(2); // SP + SE sales
      expect(summary.vendorPayments + summary.invoicePayments).toBeGreaterThanOrEqual(1);
      expect(summary.coverage.parties).toEqual({ source: 2, imported: 2, skipped: 0 });
      expect(summary.coverage.products).toEqual({ source: 1, imported: 1, skipped: 0 });
      expect(summary.coverage.salesInvoices.imported).toBe(summary.coverage.salesInvoices.source);
      expect(summary.coverage.journalsBooksOnly).toBe(1);
      expect(errors).toEqual([]);
      expect(warnings.some(w => w.stage === 'journals' && /Books only/i.test(w.message))).toBe(true);
      expect(warnings.some(w => /synthesized/i.test(w.message))).toBe(true);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const ledgers = await pool.query(`SELECT name, ledger_type FROM book_ledgers WHERE tenant_id = $1 ORDER BY name`, [
      TENANT,
    ]);
    expect(ledgers.rows.map(r => r.name)).toContain('MITULBHAI');
    const vouchers = await pool.query(`SELECT voucher_type FROM book_vouchers WHERE tenant_id = $1`, [TENANT]);
    const types = vouchers.rows.map(r => r.voucher_type);
    expect(types).toContain('sales');
    expect(types).toContain('receipt');
    expect(types).toContain('payment');
    expect(types).toContain('journal');

    // Party → vendor (PR + LI)
    const vendors = await pool.query(
      `SELECT name, gst_number, phone, external_ref FROM vendors WHERE tenant_id = $1 ORDER BY external_ref`,
      [TENANT],
    );
    expect(vendors.rows).toHaveLength(2);
    expect(vendors.rows.map(r => r.external_ref).sort()).toEqual(['AGPARTY1', 'ALIABIL1']);
    const mitul = vendors.rows.find(r => r.external_ref === 'AGPARTY1');
    expect(mitul?.name).toBe('MITULBHAI');
    expect(mitul?.gst_number).toBe('24AAAAA0000A1Z5');

    // Product → products
    const opsProducts = await pool.query(
      `SELECT name, price::float AS price, hsn_code, barcode, external_ref FROM products WHERE tenant_id = $1`,
      [TENANT],
    );
    expect(opsProducts.rows).toHaveLength(1);
    expect(opsProducts.rows[0].name).toBe('LUNCH BOX DIE');
    expect(opsProducts.rows[0].price).toBe(560000);
    expect(opsProducts.rows[0].hsn_code).toBe('8480');
    expect(opsProducts.rows[0].barcode).toBeNull();
    expect(opsProducts.rows[0].external_ref).toBe('PGITEM01');

    // Sales voucher → standalone invoice
    const invoices = await pool.query(
      `SELECT invoice_number, customer_name, grand_total::float AS grand_total, party_type, external_ref
       FROM standalone_invoices WHERE tenant_id = $1 ORDER BY invoice_number`,
      [TENANT],
    );
    expect(invoices.rows.some(r => r.invoice_number === 'GT/1')).toBe(true);
    const sale = invoices.rows.find(r => r.external_ref === 'SSVOUCHER01');
    expect(sale?.customer_name).toBe('MITULBHAI');
    expect(sale?.grand_total).toBe(560000);
    expect(sale?.party_type).toBe('vendor');

    // SE with items but no RKACCT01 rows → synthesized ledger entries
    const seEntries = await pool.query(
      `SELECT e.debit::float AS debit, e.credit::float AS credit, e.narration
       FROM book_voucher_entries e
       JOIN book_vouchers v ON v.id = e.voucher_id
       WHERE e.tenant_id = $1 AND v.external_ref = 'SEVOUCHER05'
       ORDER BY e.line_no`,
      [TENANT],
    );
    expect(seEntries.rows).toHaveLength(2);
    expect(seEntries.rows.reduce((s, r) => s + Number(r.debit), 0)).toBe(50);
    expect(seEntries.rows.reduce((s, r) => s + Number(r.credit), 0)).toBe(50);
    expect(seEntries.rows.some(r => /synthesized/i.test(String(r.narration || '')))).toBe(true);

    // Cash book involving party → payments
    const vp = await pool.query(
      `SELECT amount::float AS amount, idempotency_key FROM vendor_payments WHERE tenant_id = $1`,
      [TENANT],
    );
    const ip = await pool.query(
      `SELECT amount::float AS amount, idempotency_key FROM invoice_payments WHERE tenant_id = $1`,
      [TENANT],
    );
    expect(vp.rows.length + ip.rows.length).toBeGreaterThanOrEqual(1);
    expect([...vp.rows, ...ip.rows].some(r => String(r.idempotency_key || '').startsWith('miracle:'))).toBe(true);

    // idempotent re-import
    const job2 = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [job2, TENANT],
    );
    const c2 = await pool.connect();
    try {
      await c2.query('BEGIN');
      const again = await importMiracleCompany(c2, TENANT, company, job2);
      await c2.query('COMMIT');
      expect(again.summary.ledgers).toBe(6);
      expect(again.summary.vendors).toBe(2);
      expect(again.summary.opsProducts).toBe(1);
    } finally {
      c2.release();
    }

    const vendorsAgain = await pool.query(`SELECT COUNT(*)::int AS c FROM vendors WHERE tenant_id = $1`, [TENANT]);
    expect(vendorsAgain.rows[0].c).toBe(2);
    const productsAgain = await pool.query(`SELECT COUNT(*)::int AS c FROM products WHERE tenant_id = $1`, [TENANT]);
    expect(productsAgain.rows[0].c).toBe(1);
    const invAgain = await pool.query(
      `SELECT COUNT(*)::int AS c FROM standalone_invoices WHERE tenant_id = $1 AND external_ref IS NOT NULL`,
      [TENANT],
    );
    expect(invAgain.rows[0].c).toBe(invoices.rows.length);
  });

  it('extracts zip archives and locateCompanyDir rejects missing paths', async () => {
    expect(() => locateCompanyDir('/tmp/definitely-missing-miracle-xyz')).toThrow(/not found/);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-zip-'));
    tmpDirs.push(root);
    buildMiracleCompany(root);
    const zipPath = path.join(root, 'cmp.zip');
    execFileSync('zip', ['-qr', zipPath, 'CMP0001'], { cwd: root });

    const extracted = await extractArchive(zipPath);
    tmpDirs.push(extracted);
    const company = locateCompanyDir(extracted);
    expect(path.basename(company)).toBe('CMP0001');

    // Multer `dest` saves without an extension — use originalName for format detection
    const multerPath = path.join(root, 'upload-no-ext');
    fs.copyFileSync(zipPath, multerPath);
    const extractedMulter = await extractArchive(multerPath, 'CMP0001.zip');
    tmpDirs.push(extractedMulter);
    expect(path.basename(locateCompanyDir(extractedMulter))).toBe('CMP0001');

    await expect(extractArchive(path.join(root, 'nope.txt'))).rejects.toThrow(/Unsupported/);
    await expect(extractArchive(multerPath)).rejects.toThrow(/Unsupported/);
  });

  it('fails when year folder or ledger master is missing', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-bad-'));
    tmpDirs.push(root);
    const company = path.join(root, 'BAD');
    fs.mkdirSync(company);
    fs.writeFileSync(path.join(company, 'version.txt'), 'Company Name : X\n');
    const jobId = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [jobId, TENANT],
    );
    const client = await pool.connect();
    try {
      await expect(importMiracleCompany(client, TENANT, company, jobId)).rejects.toThrow(/YR/);
    } finally {
      client.release();
    }

    fs.mkdirSync(path.join(company, 'YR25'));
    const job3 = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [job3, TENANT],
    );
    const c3 = await pool.connect();
    try {
      await expect(importMiracleCompany(c3, TENANT, company, job3)).rejects.toThrow(/RKACCM01/);
    } finally {
      c3.release();
    }
  });

  it('locateCompanyDir accepts company root directly and rejects empty extract', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-empty-'));
    tmpDirs.push(root);
    expect(() => locateCompanyDir(root)).toThrow(/Could not find Miracle/);

    const company = buildMiracleCompany(root);
    expect(locateCompanyDir(company)).toBe(company);
  });

  it('skips ops product with empty name and collects an error', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-empty-prod-'));
    tmpDirs.push(root);
    const company = buildMiracleCompany(root);
    const yr = path.join(company, 'YR25');

    // Append a product row with blank name
    writeDbf(
      path.join(yr, 'rkaccm21.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD04', type: 'C', length: 10 },
        { name: 'FIELD05', type: 'C', length: 20 },
        { name: 'FIELD20', type: 'C', length: 8 },
        { name: 'FIELD40', type: 'C', length: 15 },
      ],
      [
        {
          FIELD01: 'PGITEM01',
          FIELD02: 'LUNCH BOX DIE',
          FIELD04: 'LB1',
          FIELD05: 'Numbers',
          FIELD20: 'VIB00001',
          FIELD40: '8480',
        },
        {
          FIELD01: 'PGBLANK1',
          FIELD02: '',
          FIELD04: '',
          FIELD05: '',
          FIELD20: '',
          FIELD40: '',
        },
      ],
    );

    for (const t of [
      'invoice_payments',
      'vendor_payments',
      'standalone_invoices',
      'products',
      'vendors',
      'book_voucher_items',
      'book_voucher_entries',
      'book_vouchers',
      'book_products',
      'book_ledger_details',
      'book_ledgers',
      'book_account_groups',
      'book_financial_years',
      'book_import_jobs',
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT]);
    }

    const jobId = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [jobId, TENANT],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { summary, errors } = await importMiracleCompany(client, TENANT, company, jobId);
      await client.query('COMMIT');
      expect(summary.products).toBe(2); // books still gets both
      expect(summary.opsProducts).toBe(1); // blank name skipped for ops
      expect(errors.some(e => e.stage === 'products' && e.externalRef === 'PGBLANK1')).toBe(true);
      expect(errors.find(e => e.externalRef === 'PGBLANK1')?.message).toMatch(/missing name/i);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const opsProducts = await pool.query(
      `SELECT name, external_ref FROM products WHERE tenant_id = $1 ORDER BY external_ref`,
      [TENANT],
    );
    expect(opsProducts.rows.map(r => r.external_ref)).toEqual(['PGITEM01']);
  });

  it('skips cash/sales vouchers missing a trading party or with invalid amount', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-cash-skip-'));
    tmpDirs.push(root);
    const company = buildMiracleCompany(root);
    const yr = path.join(company, 'YR25');

    // Happy-path sale + skip cases:
    // - CB between cash ↔ sales A/c (no party, not income) → intentional Books-only skip
    // - CB receipt on PR with amount 0 → error
    // - SP with non-PR header party (and no PR on entries) → error
    // - SP with PR party but zero amount and no line items → error
    writeDbf(
      path.join(yr, 'RKACCT41.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD02', type: 'D', length: 8 },
        { name: 'FIELD04', type: 'C', length: 8 },
        { name: 'FIELD05', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD12', type: 'C', length: 25 },
        { name: 'FIELD16', type: 'C', length: 1 },
        { name: 'FIELD74', type: 'C', length: 2 },
        { name: 'T41FVNO', type: 'C', length: 25 },
      ],
      [
        {
          FIELD01: 'SSVOUCHER01',
          FIELD02: '20250501',
          FIELD04: 'AGPARTY1',
          FIELD05: 'AGO5S34X',
          FIELD06: 560000,
          FIELD07: 560000,
          FIELD12: 'GT/1',
          FIELD16: 'D',
          FIELD74: 'SP',
          T41FVNO: 'GT/1',
        },
        {
          FIELD01: 'CRNOPARTY',
          FIELD02: '20250506',
          FIELD04: 'ACASHACT',
          FIELD05: 'AGO5S34X',
          FIELD06: 2500,
          FIELD07: 2500,
          FIELD12: '',
          FIELD16: 'R',
          FIELD74: 'CB',
          T41FVNO: '',
        },
        {
          FIELD01: 'CRZEROAMT',
          FIELD02: '20250507',
          FIELD04: 'AGPARTY1',
          FIELD05: 'ACASHACT',
          FIELD06: 0,
          FIELD07: 0,
          FIELD12: '',
          FIELD16: 'R',
          FIELD74: 'CB',
          T41FVNO: '',
        },
        {
          FIELD01: 'SSNOPARTY',
          FIELD02: '20250508',
          FIELD04: 'ACASHACT',
          FIELD05: 'AGO5S34X',
          FIELD06: 100,
          FIELD07: 100,
          FIELD12: 'GT/NP',
          FIELD16: 'D',
          FIELD74: 'SP',
          T41FVNO: 'GT/NP',
        },
        {
          FIELD01: 'SSZEROAMT',
          FIELD02: '20250509',
          FIELD04: 'AGPARTY1',
          FIELD05: 'AGO5S34X',
          FIELD06: 0,
          FIELD07: 0,
          FIELD12: 'GT/Z',
          FIELD16: 'D',
          FIELD74: 'SP',
          T41FVNO: 'GT/Z',
        },
      ],
    );

    for (const t of [
      'invoice_payments',
      'vendor_payments',
      'standalone_invoices',
      'products',
      'vendors',
      'book_voucher_items',
      'book_voucher_entries',
      'book_vouchers',
      'book_products',
      'book_ledger_details',
      'book_ledgers',
      'book_account_groups',
      'book_financial_years',
      'book_import_jobs',
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT]);
    }

    const jobId = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [jobId, TENANT],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { summary, errors, warnings } = await importMiracleCompany(client, TENANT, company, jobId);
      await client.query('COMMIT');
      // Non-party cash (sales A/c) is intentional Books-only — warned, not an error
      expect(summary.coverage.nonPartyCashSkipped).toBeGreaterThanOrEqual(1);
      expect(warnings.some(w => w.stage === 'non_party_cash')).toBe(true);
      expect(errors.some(e => e.externalRef === 'CRNOPARTY')).toBe(false);
      expect(errors.some(e => e.externalRef === 'CRZEROAMT' && /invalid amount/i.test(e.message))).toBe(true);
      expect(errors.some(e => e.externalRef === 'SSNOPARTY' && /missing trading party/i.test(e.message))).toBe(true);
      expect(errors.some(e => e.externalRef === 'SSZEROAMT' && /invalid amount/i.test(e.message))).toBe(true);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  it('imports LI liability parties and cash-income receipts as paid invoices', async () => {
    expect(isOpsPartyLedgerType('PR')).toBe(true);
    expect(isOpsPartyLedgerType('LI')).toBe(true);
    expect(isOpsPartyLedgerType('PT')).toBe(false);
    expect(isCashIncomeLedgerType('IN')).toBe(true);
    expect(isCashIncomeLedgerType('JP')).toBe(true);
    expect(isCashIncomeLedgerType('TS')).toBe(false);

    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-li-income-'));
    tmpDirs.push(root);
    const company = buildMiracleCompany(root);
    const yr = path.join(company, 'YR25');

    writeDbf(
      path.join(yr, 'RKACCT41.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD02', type: 'D', length: 8 },
        { name: 'FIELD04', type: 'C', length: 8 },
        { name: 'FIELD05', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD12', type: 'C', length: 25 },
        { name: 'FIELD16', type: 'C', length: 1 },
        { name: 'FIELD74', type: 'C', length: 2 },
        { name: 'T41FVNO', type: 'C', length: 25 },
      ],
      [
        {
          FIELD01: 'CPLIABIL1',
          FIELD02: '20250510',
          FIELD04: 'ALIABIL1',
          FIELD05: 'ACASHACT',
          FIELD06: 150000,
          FIELD07: 150000,
          FIELD12: '',
          FIELD16: 'P',
          FIELD74: 'CB',
          T41FVNO: '',
        },
        {
          FIELD01: 'CRINCOME1',
          FIELD02: '20250511',
          FIELD04: 'AINCOME1',
          FIELD05: 'ACASHACT',
          FIELD06: 12000,
          FIELD07: 12000,
          FIELD12: '',
          FIELD16: 'R',
          FIELD74: 'CB',
          T41FVNO: '',
        },
      ],
    );

    for (const t of [
      'invoice_payments',
      'vendor_payments',
      'standalone_invoices',
      'products',
      'vendors',
      'book_voucher_items',
      'book_voucher_entries',
      'book_vouchers',
      'book_products',
      'book_ledger_details',
      'book_ledgers',
      'book_account_groups',
      'book_financial_years',
      'book_import_jobs',
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT]);
    }

    const jobId = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [jobId, TENANT],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { summary, errors } = await importMiracleCompany(client, TENANT, company, jobId);
      await client.query('COMMIT');
      expect(errors).toEqual([]);
      expect(summary.coverage.partyCash).toMatchObject({ source: 1, imported: 1, skipped: 0 });
      expect(summary.coverage.cashIncomeInvoices).toMatchObject({ source: 1, imported: 1, skipped: 0 });
      expect(summary.vendorPayments).toBe(1);
      expect(summary.invoices).toBe(1);
      expect(summary.invoicePayments).toBe(1);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const vp = await pool.query(
      `SELECT amount::float AS amount FROM vendor_payments WHERE tenant_id = $1 AND idempotency_key = $2`,
      [TENANT, 'miracle:CPLIABIL1'],
    );
    expect(vp.rows[0]?.amount).toBe(150000);

    const inv = await pool.query(
      `SELECT customer_name, status, grand_total::float AS grand_total, party_id, invoice_kind, invoice_number, notes
       FROM standalone_invoices WHERE tenant_id = $1 AND external_ref = $2`,
      [TENANT, 'CRINCOME1'],
    );
    expect(inv.rows[0]?.customer_name).toBe('JOB WORK INCOME');
    expect(inv.rows[0]?.status).toBe('paid');
    expect(inv.rows[0]?.invoice_kind).toBe('cash_income');
    expect(inv.rows[0]?.grand_total).toBe(12000);
    expect(inv.rows[0]?.party_id).toBeNull();
    expect(String(inv.rows[0]?.invoice_number || '')).toMatch(/^CASH-/);
    expect(String(inv.rows[0]?.notes || '')).not.toMatch(/Miracle cash income/i);
  });

  it('resolves payment method from contra ledger and instrument ref', () => {
    expect(
      resolveMiraclePaymentMethod({
        contraLedgerType: 'CS',
        contraLedgerName: 'Cash Account',
      }),
    ).toBe('Cash');
    expect(
      resolveMiraclePaymentMethod({
        contraLedgerType: 'BK',
        contraLedgerName: 'HDFC Bank Current',
      }),
    ).toBe('Bank Transfer');
    expect(
      resolveMiraclePaymentMethod({
        contraLedgerName: 'PhonePe UPI',
      }),
    ).toBe('UPI');
    expect(
      resolveMiraclePaymentMethod({
        contraLedgerType: 'BK',
        contraLedgerName: 'SBI',
        instrumentRef: '123456',
      }),
    ).toBe('Cheque');
    expect(
      resolveMiraclePaymentMethod({
        contraLedgerType: 'CS',
        instrumentRef: 'CHQ-7788',
      }),
    ).toBe('Cheque');
    expect(
      pickMiraclePaymentReference({ FIELD10: '', FIELD82: 'UTR999', FIELD12: 'V1' } as Record<string, string>, null),
    ).toBe('UTR999');
  });

  it('maps Miracle voucher codes including FIELD98 shortcuts', () => {
    expect(normalizeMiracleDocNumber('GT/     1')).toBe('GT/1');
    expect(mapVoucherType('SP', 'D', 'SS')).toBe('sales');
    expect(mapVoucherType('SE', 'D', 'QS')).toBe('sales');
    expect(mapVoucherType('CB', 'R', 'CR')).toBe('receipt');
    expect(mapVoucherType('CB', 'P', 'CP')).toBe('payment');
    expect(mapVoucherType('CN', '', 'CN')).toBe('credit_note');
    expect(mapVoucherType('DN', '', 'DN')).toBe('debit_note');
    expect(mapVoucherType('SR', '', '')).toBe('credit_note');
    expect(mapVoucherType('PU', '', 'PU')).toBe('purchase');
    expect(mapVoucherType('QR', '', 'QR')).toBe('purchase_return');
    expect(mapVoucherType('CT', '', 'CT')).toBe('contra');
    expect(mapVoucherType('JR', 'J', 'JR')).toBe('journal');
    expect(mapVoucherType('XX', '', '')).toBe('other');
  });

  it('allocates purchase GST into per-unit cost and billed', () => {
    expect(sumPurchaseInputGst([], new Map())).toBe(0);
    const tax = sumPurchaseInputGst(
      [
        { FIELD03: 'ACGST01', FIELD05: 9, FIELD06: 'D' },
        { FIELD03: 'ASGST01', FIELD05: 9, FIELD06: 'D' },
        { FIELD03: 'APURCH01', FIELD05: 100, FIELD06: 'D' },
      ] as never,
      new Map([
        ['ACGST01', { name: 'Input CGST' }],
        ['ASGST01', { name: 'Input SGST' }],
        ['APURCH01', { name: 'Purchase Account' }],
      ]),
    );
    expect(tax).toBe(18);

    const noTax = expandPurchaseStockUnits([{ productId: 'P1', qty: 2, rate: 50, amount: 100 }], 0, 100);
    expect(noTax).toHaveLength(2);
    expect(noTax.every(u => !u.gstApplied && u.costPrice === 50 && u.billedPrice === 50)).toBe(true);

    const withTax = expandPurchaseStockUnits([{ productId: 'P1', qty: 2, rate: 50, amount: 100 }], 18, 118);
    expect(withTax).toHaveLength(2);
    expect(withTax.every(u => u.gstApplied && u.costPrice === 50 && u.billedPrice === 59)).toBe(true);
    expect(withTax.reduce((s, u) => s + (u.billedPrice - u.costPrice), 0)).toBeCloseTo(18, 5);

    const inclusive = expandPurchaseStockUnits([{ productId: 'P1', qty: 1, rate: 118, amount: 118 }], 18, 118);
    expect(inclusive[0]?.gstApplied).toBe(true);
    expect(inclusive[0]?.billedPrice).toBe(118);
    expect(inclusive[0]?.costPrice).toBe(100);
  });

  it('imports credit notes and bill-matched receipts', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-cn-'));
    tmpDirs.push(root);
    const company = path.join(root, 'CMP0001');
    fs.mkdirSync(company, { recursive: true });
    fs.writeFileSync(path.join(company, 'version.txt'), 'Company Name : NOTE FIXTURE\nMiracle Version : 12.0\n');
    const yr = path.join(company, 'YR25');
    fs.mkdirSync(yr, { recursive: true });

    writeDbf(
      path.join(yr, 'rkaccm11.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD07', type: 'C', length: 2 },
      ],
      [
        { FIELD01: 'GRPPARTY', FIELD02: 'Sundry Debtors', FIELD07: 'A' },
        { FIELD01: 'GRPCASH', FIELD02: 'Cash', FIELD07: 'A' },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCM01.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD04', type: 'C', length: 1 },
        { name: 'FIELD05', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'C', length: 8 },
        { name: 'FIELD07', type: 'C', length: 2 },
        { name: 'FIELD10', type: 'N', length: 17, decimals: 2 },
      ],
      [
        {
          FIELD01: 'AGPARTY1',
          FIELD02: 'MITULBHAI',
          FIELD04: 'A',
          FIELD05: 'GRPPARTY',
          FIELD06: 'GRPPARTY',
          FIELD07: 'PR',
          FIELD10: 0,
        },
        {
          FIELD01: 'ACASHACT',
          FIELD02: 'Cash Account',
          FIELD04: 'A',
          FIELD05: 'GRPCASH',
          FIELD06: 'GRPCASH',
          FIELD07: 'CS',
          FIELD10: 0,
        },
        {
          FIELD01: 'AGO5S34X',
          FIELD02: 'Sales A/c',
          FIELD04: 'A',
          FIELD05: 'GRPPARTY',
          FIELD06: 'GRPPARTY',
          FIELD07: 'TS',
          FIELD10: 0,
        },
      ],
    );
    writeDbf(
      path.join(yr, 'rkaccm02.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
      ],
      [{ FIELD01: 'AGPARTY1', FIELD02: 'Addr' }],
    );
    writeDbf(
      path.join(yr, 'rkaccm21.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD08', type: 'C', length: 10 },
      ],
      [{ FIELD01: 'PROD0001', FIELD02: 'Widget', FIELD08: 'Nos' }],
    );
    writeDbf(
      path.join(yr, 'rkaccm29.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'M29F03', type: 'N', length: 17, decimals: 2 },
      ],
      [{ FIELD01: 'PROD0001', M29F03: 100 }],
    );
    writeDbf(
      path.join(yr, 'RKACCT40.DBF'),
      [
        { name: 'T40F01', type: 'C', length: 12 },
        { name: 'T40F09', type: 'C', length: 4 },
        { name: 'T40F02', type: 'C', length: 40 },
      ],
      [{ T40F01: 'CNVOUCHER1', T40F09: 'XXXX', T40F02: 'Post sale discount' }],
    );
    writeDbf(
      path.join(yr, 'RKACCT41.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD02', type: 'D', length: 8 },
        { name: 'FIELD04', type: 'C', length: 8 },
        { name: 'FIELD05', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD12', type: 'C', length: 25 },
        { name: 'FIELD16', type: 'C', length: 1 },
        { name: 'FIELD74', type: 'C', length: 2 },
        { name: 'FIELD98', type: 'C', length: 2 },
        { name: 'T41FVNO', type: 'C', length: 25 },
      ],
      [
        {
          FIELD01: 'SSOLDINV01',
          FIELD02: '20250501',
          FIELD04: 'AGPARTY1',
          FIELD05: 'AGO5S34X',
          FIELD06: 5000,
          FIELD07: 5000,
          FIELD12: 'GT/1',
          FIELD16: 'D',
          FIELD74: 'SP',
          FIELD98: 'SS',
          T41FVNO: 'GT/     1',
        },
        {
          FIELD01: 'SSNEWINV02',
          FIELD02: '20250510',
          FIELD04: 'AGPARTY1',
          FIELD05: 'AGO5S34X',
          FIELD06: 8000,
          FIELD07: 8000,
          FIELD12: 'GT/2',
          FIELD16: 'D',
          FIELD74: 'SP',
          FIELD98: 'SS',
          T41FVNO: 'GT/2',
        },
        {
          FIELD01: 'CNVOUCHER1',
          FIELD02: '20250512',
          FIELD04: 'AGPARTY1',
          FIELD05: 'AGO5S34X',
          FIELD06: 500,
          FIELD07: 500,
          FIELD12: 'CN/1',
          FIELD16: '',
          FIELD74: 'CN',
          FIELD98: 'CN',
          T41FVNO: 'CN/1',
        },
        {
          FIELD01: 'PUVOUCHER1',
          FIELD02: '20250513',
          FIELD04: 'AGPARTY1',
          FIELD05: 'AGO5S34X',
          FIELD06: 1200,
          FIELD07: 1200,
          FIELD12: 'PU/1',
          FIELD16: '',
          FIELD74: 'PU',
          FIELD98: 'PU',
          T41FVNO: 'PU/1',
        },
        {
          FIELD01: 'CRBILLREF1',
          FIELD02: '20250515',
          FIELD04: 'AGPARTY1',
          FIELD05: 'ACASHACT',
          FIELD06: 8000,
          FIELD07: 8000,
          FIELD12: '',
          FIELD16: 'R',
          FIELD74: 'CB',
          FIELD98: 'CR',
          T41FVNO: '',
        },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCT01.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD03', type: 'C', length: 8 },
        { name: 'FIELD04', type: 'C', length: 8 },
        { name: 'FIELD05', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD06', type: 'C', length: 1 },
        { name: 'FIELD12', type: 'C', length: 25 },
        { name: 'T41FVNO', type: 'C', length: 25 },
      ],
      [
        {
          FIELD01: 'SSOLDINV01',
          FIELD03: 'AGPARTY1',
          FIELD04: 'AGO5S34X',
          FIELD05: 5000,
          FIELD06: 'D',
          FIELD12: '',
          T41FVNO: '',
        },
        {
          FIELD01: 'SSNEWINV02',
          FIELD03: 'AGPARTY1',
          FIELD04: 'AGO5S34X',
          FIELD05: 8000,
          FIELD06: 'D',
          FIELD12: '',
          T41FVNO: '',
        },
        {
          FIELD01: 'CRBILLREF1',
          FIELD03: 'AGPARTY1',
          FIELD04: 'ACASHACT',
          FIELD05: 8000,
          FIELD06: 'D',
          FIELD12: 'GT/     2',
          T41FVNO: 'GT/2',
        },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCT02.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD03', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD08', type: 'N', length: 17, decimals: 2 },
      ],
      [
        { FIELD01: 'SSOLDINV01', FIELD03: 'PROD0001', FIELD06: 1, FIELD07: 5000, FIELD08: 5000 },
        { FIELD01: 'SSNEWINV02', FIELD03: 'PROD0001', FIELD06: 1, FIELD07: 8000, FIELD08: 8000 },
        { FIELD01: 'CNVOUCHER1', FIELD03: 'PROD0001', FIELD06: 1, FIELD07: 500, FIELD08: 500 },
      ],
    );

    for (const t of [
      'invoice_payments',
      'vendor_payments',
      'standalone_invoices',
      'credit_debit_notes',
      'products',
      'vendors',
      'book_voucher_items',
      'book_voucher_entries',
      'book_vouchers',
      'book_products',
      'book_ledger_details',
      'book_ledgers',
      'book_account_groups',
      'book_financial_years',
      'book_import_jobs',
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT]);
    }

    const jobId = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [jobId, TENANT],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { summary, errors } = await importMiracleCompany(client, TENANT, company, jobId);
      await client.query('COMMIT');
      expect(errors).toEqual([]);
      expect(summary.coverage.creditNotes).toEqual({ source: 1, imported: 1, skipped: 0 });
      expect(summary.coverage.purchases).toEqual({
        source: 1,
        imported: 0,
        skipped: 1,
        skipReason: 'Purchase has no ops product lines',
      });
      expect(summary.coverage.billMatchedPayments).toBe(1);
      expect(summary.creditDebitNotes).toBe(1);
      expect(summary.invoices).toBe(2);
      expect(summary.creditNoteStockUnits).toBe(1);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const note = await pool.query(
      `SELECT note_type, total::float AS total, note_number FROM credit_debit_notes
       WHERE tenant_id = $1 AND external_ref = $2`,
      [TENANT, 'CNVOUCHER1'],
    );
    expect(note.rows[0]?.note_type).toBe('credit');
    expect(note.rows[0]?.total).toBe(500);
    expect(note.rows[0]?.note_number).toBe('CN/1');

    const cnInv = await pool.query(
      `SELECT COUNT(*)::int AS n FROM product_inventory WHERE tenant_id=$1 AND batch_id=$2 AND status='InStock'`,
      [TENANT, 'miracle:cn:CNVOUCHER1'],
    );
    expect(cnInv.rows[0]?.n).toBe(1);

    const paid = await pool.query(
      `SELECT si.invoice_number, ip.amount::float AS amount
       FROM invoice_payments ip
       JOIN standalone_invoices si ON si.id = ip.invoice_id AND si.tenant_id = ip.tenant_id
       WHERE ip.tenant_id = $1 AND ip.idempotency_key LIKE 'miracle:CRBILLREF1:%'`,
      [TENANT],
    );
    expect(paid.rows).toHaveLength(1);
    expect(paid.rows[0]?.invoice_number).toBe('GT/2');
    expect(paid.rows[0]?.amount).toBe(8000);

    const purchaseV = await pool.query(
      `SELECT voucher_type FROM book_vouchers WHERE tenant_id = $1 AND external_ref = $2`,
      [TENANT, 'PUVOUCHER1'],
    );
    expect(purchaseV.rows[0]?.voucher_type).toBe('purchase');
  });

  it('dual-writes Miracle purchase lines into ops stock (idempotent)', async () => {
    await pool.query('ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS external_ref TEXT');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-pu-stock-'));
    tmpDirs.push(root);
    const company = path.join(root, 'CMP0001');
    fs.mkdirSync(company, { recursive: true });
    fs.writeFileSync(path.join(company, 'version.txt'), 'Company Name : PU STOCK\nMiracle Version : 12.0\n');
    const yr = path.join(company, 'YR25');
    fs.mkdirSync(yr, { recursive: true });

    writeDbf(
      path.join(yr, 'rkaccm11.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD07', type: 'C', length: 2 },
      ],
      [
        { FIELD01: 'GRPPARTY', FIELD02: 'Creditors', FIELD07: 'L' },
        { FIELD01: 'GRPPUR', FIELD02: 'Purchases', FIELD07: 'E' },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCM01.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD04', type: 'C', length: 1 },
        { name: 'FIELD05', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'C', length: 8 },
        { name: 'FIELD07', type: 'C', length: 2 },
        { name: 'FIELD10', type: 'N', length: 17, decimals: 2 },
      ],
      [
        {
          FIELD01: 'ASUPPLY1',
          FIELD02: 'SUPPLIER ONE',
          FIELD04: 'A',
          FIELD05: 'GRPPARTY',
          FIELD06: 'GRPPARTY',
          FIELD07: 'PR',
          FIELD10: 0,
        },
        {
          FIELD01: 'APURCH01',
          FIELD02: 'Purchase Account',
          FIELD04: 'A',
          FIELD05: 'GRPPUR',
          FIELD06: 'GRPPUR',
          FIELD07: 'EX',
          FIELD10: 0,
        },
      ],
    );
    writeDbf(
      path.join(yr, 'rkaccm02.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
      ],
      [{ FIELD01: 'ASUPPLY1', FIELD02: 'Surat' }],
    );
    writeDbf(
      path.join(yr, 'rkaccm21.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD08', type: 'C', length: 10 },
      ],
      [{ FIELD01: 'PRODPU01', FIELD02: 'Bolt', FIELD08: 'Nos' }],
    );
    writeDbf(
      path.join(yr, 'rkaccm29.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'M29F03', type: 'N', length: 17, decimals: 2 },
      ],
      [{ FIELD01: 'PRODPU01', M29F03: 50 }],
    );
    writeDbf(
      path.join(yr, 'RKACCT41.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD02', type: 'D', length: 8 },
        { name: 'FIELD04', type: 'C', length: 8 },
        { name: 'FIELD05', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD12', type: 'C', length: 25 },
        { name: 'FIELD16', type: 'C', length: 1 },
        { name: 'FIELD74', type: 'C', length: 2 },
        { name: 'FIELD98', type: 'C', length: 2 },
        { name: 'T41FVNO', type: 'C', length: 25 },
      ],
      [
        {
          FIELD01: 'PUSTOCK001',
          FIELD02: '20250601',
          FIELD04: 'ASUPPLY1',
          FIELD05: 'APURCH01',
          FIELD06: 150,
          FIELD07: 150,
          FIELD12: 'PU/99',
          FIELD16: '',
          FIELD74: 'PU',
          FIELD98: 'PU',
          T41FVNO: 'PU/99',
        },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCT01.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD03', type: 'C', length: 8 },
        { name: 'FIELD04', type: 'C', length: 8 },
        { name: 'FIELD05', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD06', type: 'C', length: 1 },
      ],
      [
        {
          FIELD01: 'PUSTOCK001',
          FIELD03: 'APURCH01',
          FIELD04: 'ASUPPLY1',
          FIELD05: 150,
          FIELD06: 'D',
        },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCT02.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD03', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD08', type: 'N', length: 17, decimals: 2 },
      ],
      [{ FIELD01: 'PUSTOCK001', FIELD03: 'PRODPU01', FIELD06: 3, FIELD07: 50, FIELD08: 150 }],
    );

    for (const t of [
      'product_inventory',
      'product_purchases',
      'suppliers',
      'products',
      'vendors',
      'book_voucher_items',
      'book_voucher_entries',
      'book_vouchers',
      'book_products',
      'book_ledgers',
      'book_account_groups',
      'book_financial_years',
      'book_import_jobs',
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }

    const jobId = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [jobId, TENANT],
    );

    const runOnce = async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await importMiracleCompany(client, TENANT, company, jobId);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    };

    const first = await runOnce();
    expect(first.errors).toEqual([]);
    expect(first.summary.coverage.purchases).toEqual({ source: 1, imported: 1, skipped: 0 });
    expect(first.summary.purchaseBatches).toBe(1);
    expect(first.summary.purchaseStockUnits).toBe(3);

    const stock = await pool.query(
      `SELECT stock::float AS stock FROM products WHERE tenant_id=$1 AND external_ref=$2`,
      [TENANT, 'PRODPU01'],
    );
    expect(stock.rows[0]?.stock).toBe(3);
    const inv = await pool.query(
      `SELECT COUNT(*)::int AS n FROM product_inventory WHERE tenant_id=$1 AND batch_id=$2 AND status='InStock'`,
      [TENANT, 'miracle:pur:PUSTOCK001'],
    );
    expect(inv.rows[0]?.n).toBe(3);

    const second = await runOnce();
    expect(second.summary.coverage.purchases.imported).toBe(1);
    const stock2 = await pool.query(
      `SELECT stock::float AS stock FROM products WHERE tenant_id=$1 AND external_ref=$2`,
      [TENANT, 'PRODPU01'],
    );
    expect(stock2.rows[0]?.stock).toBe(3);
    const inv2 = await pool.query(
      `SELECT COUNT(*)::int AS n FROM product_inventory WHERE tenant_id=$1 AND batch_id=$2 AND status='InStock'`,
      [TENANT, 'miracle:pur:PUSTOCK001'],
    );
    expect(inv2.rows[0]?.n).toBe(3);

    const pur = await pool.query(
      `SELECT gst_applied, cost_price::float AS cost, billed_price::float AS billed
       FROM product_purchases WHERE tenant_id=$1 AND batch_id=$2`,
      [TENANT, 'miracle:pur:PUSTOCK001'],
    );
    expect(pur.rows.length).toBe(3);
    expect(pur.rows.every((r: { gst_applied: boolean }) => r.gst_applied === false)).toBe(true);
  });

  it('sets gst_applied and billed−cost from Books purchase tax ledgers', async () => {
    await pool.query('ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS external_ref TEXT');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-pu-gst-'));
    tmpDirs.push(root);
    const company = path.join(root, 'CMP0001');
    fs.mkdirSync(company, { recursive: true });
    fs.writeFileSync(path.join(company, 'version.txt'), 'Company Name : PU GST\nMiracle Version : 12.0\n');
    const yr = path.join(company, 'YR25');
    fs.mkdirSync(yr, { recursive: true });

    writeDbf(
      path.join(yr, 'rkaccm11.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD07', type: 'C', length: 2 },
      ],
      [
        { FIELD01: 'GRPPARTY', FIELD02: 'Creditors', FIELD07: 'L' },
        { FIELD01: 'GRPPUR', FIELD02: 'Purchases', FIELD07: 'E' },
        { FIELD01: 'GRPDUTY', FIELD02: 'Duties', FIELD07: 'A' },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCM01.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD04', type: 'C', length: 1 },
        { name: 'FIELD05', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'C', length: 8 },
        { name: 'FIELD07', type: 'C', length: 2 },
        { name: 'FIELD10', type: 'N', length: 17, decimals: 2 },
      ],
      [
        {
          FIELD01: 'ASUPPLY1',
          FIELD02: 'SUPPLIER GST',
          FIELD04: 'A',
          FIELD05: 'GRPPARTY',
          FIELD06: 'GRPPARTY',
          FIELD07: 'PR',
          FIELD10: 0,
        },
        {
          FIELD01: 'APURCH01',
          FIELD02: 'Purchase Account',
          FIELD04: 'A',
          FIELD05: 'GRPPUR',
          FIELD06: 'GRPPUR',
          FIELD07: 'EX',
          FIELD10: 0,
        },
        {
          FIELD01: 'ACGST01',
          FIELD02: 'Input CGST',
          FIELD04: 'A',
          FIELD05: 'GRPDUTY',
          FIELD06: 'GRPDUTY',
          FIELD07: 'GL',
          FIELD10: 0,
        },
        {
          FIELD01: 'ASGST01',
          FIELD02: 'Input SGST',
          FIELD04: 'A',
          FIELD05: 'GRPDUTY',
          FIELD06: 'GRPDUTY',
          FIELD07: 'GL',
          FIELD10: 0,
        },
      ],
    );
    writeDbf(
      path.join(yr, 'rkaccm21.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD08', type: 'C', length: 10 },
      ],
      [{ FIELD01: 'PRODPU02', FIELD02: 'Nut', FIELD08: 'Nos' }],
    );
    writeDbf(
      path.join(yr, 'rkaccm29.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'M29F03', type: 'N', length: 17, decimals: 2 },
      ],
      [{ FIELD01: 'PRODPU02', M29F03: 50 }],
    );
    writeDbf(
      path.join(yr, 'RKACCT41.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD02', type: 'D', length: 8 },
        { name: 'FIELD04', type: 'C', length: 8 },
        { name: 'FIELD05', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD12', type: 'C', length: 25 },
        { name: 'FIELD16', type: 'C', length: 1 },
        { name: 'FIELD74', type: 'C', length: 2 },
        { name: 'FIELD98', type: 'C', length: 2 },
        { name: 'T41FVNO', type: 'C', length: 25 },
      ],
      [
        {
          FIELD01: 'PUGST0001',
          FIELD02: '20250615',
          FIELD04: 'ASUPPLY1',
          FIELD05: 'APURCH01',
          FIELD06: 118,
          FIELD07: 118,
          FIELD12: 'PU/GST1',
          FIELD16: '',
          FIELD74: 'PU',
          FIELD98: 'PU',
          T41FVNO: 'PU/GST1',
        },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCT01.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD03', type: 'C', length: 8 },
        { name: 'FIELD04', type: 'C', length: 8 },
        { name: 'FIELD05', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD06', type: 'C', length: 1 },
      ],
      [
        { FIELD01: 'PUGST0001', FIELD03: 'APURCH01', FIELD04: 'ASUPPLY1', FIELD05: 100, FIELD06: 'D' },
        { FIELD01: 'PUGST0001', FIELD03: 'ACGST01', FIELD04: 'ASUPPLY1', FIELD05: 9, FIELD06: 'D' },
        { FIELD01: 'PUGST0001', FIELD03: 'ASGST01', FIELD04: 'ASUPPLY1', FIELD05: 9, FIELD06: 'D' },
        { FIELD01: 'PUGST0001', FIELD03: 'ASUPPLY1', FIELD04: 'APURCH01', FIELD05: 118, FIELD06: 'C' },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCT02.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD03', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD08', type: 'N', length: 17, decimals: 2 },
      ],
      [{ FIELD01: 'PUGST0001', FIELD03: 'PRODPU02', FIELD06: 2, FIELD07: 50, FIELD08: 100 }],
    );

    for (const t of [
      'product_inventory',
      'product_purchases',
      'suppliers',
      'products',
      'vendors',
      'book_voucher_items',
      'book_voucher_entries',
      'book_vouchers',
      'book_products',
      'book_ledgers',
      'book_account_groups',
      'book_financial_years',
      'book_import_jobs',
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }

    const jobId = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [jobId, TENANT],
    );

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await importMiracleCompany(client, TENANT, company, jobId);
      await client.query('COMMIT');
      expect(result.errors).toEqual([]);
      expect(result.summary.coverage.purchases.imported).toBe(1);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const rows = await pool.query(
      `SELECT gst_applied, cost_price::float AS cost, billed_price::float AS billed
       FROM product_purchases WHERE tenant_id=$1 AND batch_id=$2 ORDER BY id`,
      [TENANT, 'miracle:pur:PUGST0001'],
    );
    expect(rows.rows.length).toBe(2);
    expect(rows.rows.every((r: { gst_applied: boolean }) => r.gst_applied === true)).toBe(true);
    expect(rows.rows[0]?.cost).toBe(50);
    expect(rows.rows[0]?.billed).toBe(59);
    const taxSum = rows.rows.reduce(
      (s: number, r: { billed: number; cost: number }) => s + (Number(r.billed) - Number(r.cost)),
      0,
    );
    expect(taxSum).toBeCloseTo(18, 5);
  });

  it('dual-writes Miracle credit-note product lines into ops stock (idempotent); DN skips stock', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-cn-stock-'));
    tmpDirs.push(root);
    const company = path.join(root, 'CMP0001');
    fs.mkdirSync(company, { recursive: true });
    fs.writeFileSync(path.join(company, 'version.txt'), 'Company Name : CN STOCK\nMiracle Version : 12.0\n');
    const yr = path.join(company, 'YR25');
    fs.mkdirSync(yr, { recursive: true });

    writeDbf(
      path.join(yr, 'rkaccm11.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD07', type: 'C', length: 2 },
      ],
      [
        { FIELD01: 'GRPPARTY', FIELD02: 'Sundry Debtors', FIELD07: 'A' },
        { FIELD01: 'GRPSALES', FIELD02: 'Sales', FIELD07: 'I' },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCM01.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD04', type: 'C', length: 1 },
        { name: 'FIELD05', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'C', length: 8 },
        { name: 'FIELD07', type: 'C', length: 2 },
        { name: 'FIELD10', type: 'N', length: 17, decimals: 2 },
      ],
      [
        {
          FIELD01: 'APARTY01',
          FIELD02: 'CUSTOMER ONE',
          FIELD04: 'A',
          FIELD05: 'GRPPARTY',
          FIELD06: 'GRPPARTY',
          FIELD07: 'PR',
          FIELD10: 0,
        },
        {
          FIELD01: 'ASALES01',
          FIELD02: 'Sales Account',
          FIELD04: 'A',
          FIELD05: 'GRPSALES',
          FIELD06: 'GRPSALES',
          FIELD07: 'IN',
          FIELD10: 0,
        },
      ],
    );
    writeDbf(
      path.join(yr, 'rkaccm21.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'FIELD02', type: 'C', length: 40 },
        { name: 'FIELD08', type: 'C', length: 10 },
      ],
      [{ FIELD01: 'PRODCN01', FIELD02: 'Returned Bolt', FIELD08: 'Nos' }],
    );
    writeDbf(
      path.join(yr, 'rkaccm29.dbf'),
      [
        { name: 'FIELD01', type: 'C', length: 8 },
        { name: 'M29F03', type: 'N', length: 17, decimals: 2 },
      ],
      [{ FIELD01: 'PRODCN01', M29F03: 40 }],
    );
    writeDbf(
      path.join(yr, 'RKACCT41.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD02', type: 'D', length: 8 },
        { name: 'FIELD04', type: 'C', length: 8 },
        { name: 'FIELD05', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD12', type: 'C', length: 25 },
        { name: 'FIELD16', type: 'C', length: 1 },
        { name: 'FIELD74', type: 'C', length: 2 },
        { name: 'FIELD98', type: 'C', length: 2 },
        { name: 'T41FVNO', type: 'C', length: 25 },
      ],
      [
        {
          FIELD01: 'CNSTOCK001',
          FIELD02: '20250620',
          FIELD04: 'APARTY01',
          FIELD05: 'ASALES01',
          FIELD06: 120,
          FIELD07: 120,
          FIELD12: 'CN/88',
          FIELD16: '',
          FIELD74: 'CN',
          FIELD98: 'CN',
          T41FVNO: 'CN/88',
        },
        {
          FIELD01: 'DNSTOCK001',
          FIELD02: '20250621',
          FIELD04: 'APARTY01',
          FIELD05: 'ASALES01',
          FIELD06: 40,
          FIELD07: 40,
          FIELD12: 'DN/1',
          FIELD16: '',
          FIELD74: 'DN',
          FIELD98: 'DN',
          T41FVNO: 'DN/1',
        },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCT01.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD03', type: 'C', length: 8 },
        { name: 'FIELD04', type: 'C', length: 8 },
        { name: 'FIELD05', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD06', type: 'C', length: 1 },
      ],
      [
        { FIELD01: 'CNSTOCK001', FIELD03: 'ASALES01', FIELD04: 'APARTY01', FIELD05: 120, FIELD06: 'D' },
        { FIELD01: 'CNSTOCK001', FIELD03: 'APARTY01', FIELD04: 'ASALES01', FIELD05: 120, FIELD06: 'C' },
        { FIELD01: 'DNSTOCK001', FIELD03: 'APARTY01', FIELD04: 'ASALES01', FIELD05: 40, FIELD06: 'D' },
        { FIELD01: 'DNSTOCK001', FIELD03: 'ASALES01', FIELD04: 'APARTY01', FIELD05: 40, FIELD06: 'C' },
      ],
    );
    writeDbf(
      path.join(yr, 'RKACCT02.DBF'),
      [
        { name: 'FIELD01', type: 'C', length: 12 },
        { name: 'FIELD03', type: 'C', length: 8 },
        { name: 'FIELD06', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD07', type: 'N', length: 17, decimals: 2 },
        { name: 'FIELD08', type: 'N', length: 17, decimals: 2 },
      ],
      [
        { FIELD01: 'CNSTOCK001', FIELD03: 'PRODCN01', FIELD06: 3, FIELD07: 40, FIELD08: 120 },
        { FIELD01: 'DNSTOCK001', FIELD03: 'PRODCN01', FIELD06: 1, FIELD07: 40, FIELD08: 40 },
      ],
    );

    for (const t of [
      'product_inventory',
      'product_purchases',
      'credit_debit_notes',
      'products',
      'vendors',
      'book_voucher_items',
      'book_voucher_entries',
      'book_vouchers',
      'book_products',
      'book_ledgers',
      'book_account_groups',
      'book_financial_years',
      'book_import_jobs',
    ]) {
      await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [TENANT]).catch(() => undefined);
    }

    const jobId = uid('BJ');
    await pool.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [jobId, TENANT],
    );

    const runOnce = async () => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await importMiracleCompany(client, TENANT, company, jobId);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    };

    const first = await runOnce();
    expect(first.errors).toEqual([]);
    expect(first.summary.coverage.creditNotes).toEqual({ source: 1, imported: 1, skipped: 0 });
    expect(first.summary.coverage.debitNotes).toEqual({ source: 1, imported: 1, skipped: 0 });
    expect(first.summary.creditNoteStockUnits).toBe(3);

    const stock = await pool.query(
      `SELECT stock::float AS stock FROM products WHERE tenant_id=$1 AND external_ref=$2`,
      [TENANT, 'PRODCN01'],
    );
    expect(stock.rows[0]?.stock).toBe(3);
    const cnInv = await pool.query(
      `SELECT COUNT(*)::int AS n FROM product_inventory WHERE tenant_id=$1 AND batch_id=$2 AND status='InStock'`,
      [TENANT, 'miracle:cn:CNSTOCK001'],
    );
    expect(cnInv.rows[0]?.n).toBe(3);
    const dnInv = await pool.query(
      `SELECT COUNT(*)::int AS n FROM product_inventory WHERE tenant_id=$1 AND batch_id LIKE $2`,
      [TENANT, 'miracle:dn:%'],
    );
    expect(dnInv.rows[0]?.n).toBe(0);

    const second = await runOnce();
    expect(second.summary.creditNoteStockUnits).toBe(3);
    const stock2 = await pool.query(
      `SELECT stock::float AS stock FROM products WHERE tenant_id=$1 AND external_ref=$2`,
      [TENANT, 'PRODCN01'],
    );
    expect(stock2.rows[0]?.stock).toBe(3);
    const cnInv2 = await pool.query(
      `SELECT COUNT(*)::int AS n FROM product_inventory WHERE tenant_id=$1 AND batch_id=$2 AND status='InStock'`,
      [TENANT, 'miracle:cn:CNSTOCK001'],
    );
    expect(cnInv2.rows[0]?.n).toBe(3);
  });
});
