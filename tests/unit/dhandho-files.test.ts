import { describe, expect, it } from 'vitest';
import { dhandhoRelativePath, sanitizeDhandhoFilename } from '../../src/lib/dhandhoFiles';

describe('dhandhoFiles path helpers', () => {
  it('sanitizes unsafe filename characters', () => {
    expect(sanitizeDhandhoFilename('inv/../a:b*.pdf')).toBe('inv_.._a_b_.pdf');
    expect(sanitizeDhandhoFilename('  ok-name (1).json  ')).toBe('ok-name (1).json');
    expect(sanitizeDhandhoFilename('$$$')).toBe('file');
  });

  it('builds Dhandho/{subdir}/{filename} paths', () => {
    expect(dhandhoRelativePath('backups', 'offline-mobile-backup-x.json')).toBe(
      'Dhandho/backups/offline-mobile-backup-x.json',
    );
    expect(dhandhoRelativePath('invoices', 'Quote #12.pdf')).toBe('Dhandho/invoices/Quote #12.pdf');
    expect(dhandhoRelativePath('bug-reports', 'dhandho-bug-report-2026-07-20.txt')).toBe(
      'Dhandho/bug-reports/dhandho-bug-report-2026-07-20.txt',
    );
  });

  it('sanitizes when building relative path', () => {
    expect(dhandhoRelativePath('invoices', 'bad/name?.pdf')).toBe('Dhandho/invoices/bad_name_.pdf');
  });
});
