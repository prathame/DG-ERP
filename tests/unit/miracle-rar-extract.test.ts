import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * Cover pure-JS RAR fallback used on Render (no system `unrar`).
 * Real Miracle .rar samples are not in CI — mock node-unrar-js.
 */
vi.mock('node-unrar-js', () => ({
  createExtractorFromData: vi.fn(async () => ({
    extract: () => ({
      files: (function* () {
        yield {
          fileHeader: { name: 'CMP0001', flags: { directory: true } },
          extraction: undefined,
        };
        yield {
          fileHeader: { name: 'CMP0001/version.txt', flags: { directory: false } },
          extraction: new TextEncoder().encode('Company Name : Mock\n'),
        };
        yield {
          fileHeader: { name: 'CMP0001/YR25/.keep', flags: { directory: false } },
          extraction: new Uint8Array([0]),
        };
        // Path traversal — must not write outside dest
        yield {
          fileHeader: { name: '../evil.txt', flags: { directory: false } },
          extraction: new TextEncoder().encode('evil'),
        };
      })(),
    }),
  })),
}));

const { extractArchive, extractRarJs, locateCompanyDir } = await import('../../server/services/miracleImport');

describe('Miracle RAR extract (JS fallback)', () => {
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

  it('extractRarJs writes members and rejects path traversal', async () => {
    const dest = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-rar-js-'));
    tmpDirs.push(dest);
    const blob = path.join(dest, 'blob.rar');
    fs.writeFileSync(blob, 'not-a-real-rar');

    await extractRarJs(blob, dest);
    expect(fs.existsSync(path.join(dest, 'CMP0001', 'version.txt'))).toBe(true);
    expect(fs.existsSync(path.join(dest, 'evil.txt'))).toBe(false);
    expect(path.basename(locateCompanyDir(dest))).toBe('CMP0001');
  });

  it('extractArchive uses JS fallback for .rar when system tools fail', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'miracle-rar-arch-'));
    tmpDirs.push(root);
    const rarPath = path.join(root, 'upload.bin');
    fs.writeFileSync(rarPath, 'fake-rar-bytes');

    const extracted = await extractArchive(rarPath, 'CMP0001.rar');
    tmpDirs.push(extracted);
    expect(path.basename(locateCompanyDir(extracted))).toBe('CMP0001');
  });
});
