import { describe, expect, it } from 'vitest';
import path from 'path';
import { readDbf, findDbf } from '../../server/utils/dbf';
import { locateCompanyDir } from '../../server/services/miracleImport';

const CMP = '/tmp/miracle-cmp0001/CMP0001';

describe('Miracle DBF reader', () => {
  it('reads product master from extracted CMP0001', () => {
    const p = findDbf(path.join(CMP, 'YR25'), 'rkaccm21.dbf');
    expect(p).toBeTruthy();
    const { records } = readDbf(p!);
    expect(records.length).toBeGreaterThanOrEqual(17);
    const names = records.map(r => String(r.FIELD02 || '').trim());
    expect(names).toContain('LUNCH BOX DIE');
  });

  it('locates company dir from extract root', () => {
    const dir = locateCompanyDir('/tmp/miracle-cmp0001');
    expect(dir.endsWith('CMP0001')).toBe(true);
  });
});
