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
import { extractArchive, importMiracleCompany, locateCompanyDir } from '../../server/services/miracleImport';

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
    [{ FIELD01: 'SSVOUCHER01', FIELD03: 'PGITEM01', FIELD06: 1, FIELD07: 560000, FIELD08: 560000 }],
  );

  return company;
}

beforeAll(async () => {
  await cleanupTestData(TENANT);
  // book tables may not be in cleanup yet
  for (const t of [
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
     VALUES ($1, 'Miracle Fixture', 'miracle-fix', 'm@test.com', 'M', 'active', 'accounting')
     ON CONFLICT (id) DO UPDATE SET business_type = 'accounting'`,
    [TENANT],
  );
});

afterAll(async () => {
  for (const t of [
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
      const summary = await importMiracleCompany(client, TENANT, company, jobId);
      await client.query('COMMIT');
      expect(summary.companyName).toContain('FIXTURE');
      expect(summary.ledgers).toBe(4);
      expect(summary.products).toBe(1);
      expect(summary.vouchers).toBe(5);
      expect(summary.voucherEntries).toBe(2);
      expect(summary.voucherItems).toBe(1);
      expect(summary.groups).toBe(2);
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
      expect(again.ledgers).toBe(4);
    } finally {
      c2.release();
    }
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

    await expect(extractArchive(path.join(root, 'nope.txt'))).rejects.toThrow(/Unsupported/);
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
});
