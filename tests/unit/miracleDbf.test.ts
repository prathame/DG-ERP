import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { findDbf, readDbf } from '../../server/utils/dbf';
import { locateCompanyDir } from '../../server/services/miracleImport';

/** Minimal dBase III table with one C(20) field and N records. */
function writeMinimalDbf(filePath: string, fieldName: string, values: string[]) {
  const fieldLen = 20;
  const headerLen = 32 + 32 + 1; // header + 1 field + terminator
  const recordLen = 1 + fieldLen;
  const buf = Buffer.alloc(headerLen + values.length * recordLen + 1, 0);
  buf[0] = 0x03; // dBase III
  buf.writeUInt32LE(values.length, 4);
  buf.writeUInt16LE(headerLen, 8);
  buf.writeUInt16LE(recordLen, 10);
  buf.write(fieldName.slice(0, 11), 32, 'ascii');
  buf[32 + 11] = 0x43; // 'C'
  buf[32 + 16] = fieldLen;
  buf[headerLen - 1] = 0x0d;
  let offset = headerLen;
  for (const v of values) {
    buf[offset] = 0x20; // not deleted
    buf.write(v.padEnd(fieldLen).slice(0, fieldLen), offset + 1, 'ascii');
    offset += recordLen;
  }
  buf[offset] = 0x1a;
  fs.writeFileSync(filePath, buf);
}

describe('Miracle DBF reader', () => {
  const tmpDirs: string[] = [];

  afterEach(() => {
    for (const d of tmpDirs) {
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
    tmpDirs.length = 0;
  });

  it('reads character fields from a minimal DBF', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-dbf-'));
    tmpDirs.push(dir);
    const file = path.join(dir, 'rkaccm21.dbf');
    writeMinimalDbf(file, 'FIELD02', ['LUNCH BOX DIE', 'WATER BOTTEL']);
    const found = findDbf(dir, 'rkaccm21.dbf');
    expect(found).toBeTruthy();
    const { records } = readDbf(found!);
    expect(records).toHaveLength(2);
    expect(String(records[0].FIELD02)).toBe('LUNCH BOX DIE');
    expect(String(records[1].FIELD02)).toBe('WATER BOTTEL');
  });

  it('locates company dir from extract root', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-root-'));
    tmpDirs.push(root);
    const company = path.join(root, 'CMP0001');
    fs.mkdirSync(path.join(company, 'YR25'), { recursive: true });
    fs.writeFileSync(path.join(company, 'version.txt'), 'Company Name : TEST CO\nMiracle Version : 9.0\n');
    writeMinimalDbf(path.join(company, 'YR25', 'rkaccm21.dbf'), 'FIELD02', ['ITEM']);

    const dir = locateCompanyDir(root);
    expect(path.basename(dir)).toBe('CMP0001');
    expect(fs.existsSync(path.join(dir, 'version.txt'))).toBe(true);
  });
});
