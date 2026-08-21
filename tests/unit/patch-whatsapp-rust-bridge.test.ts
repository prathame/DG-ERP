import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

function patchPkgAtRoot(root: string): void {
  const pkgPath = path.join(root, 'node_modules', 'whatsapp-rust-bridge', 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const entry = pkg.exports?.['.'];
  if (!entry || entry.require) return;
  const main = entry.import || './dist/index.js';
  entry.require = main;
  entry.default = main;
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`);
}

describe('patch-whatsapp-rust-bridge', () => {
  let tmpRoot = '';

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-rust-patch-'));
    const modDir = path.join(tmpRoot, 'node_modules', 'whatsapp-rust-bridge');
    fs.mkdirSync(modDir, { recursive: true });
    fs.writeFileSync(
      path.join(modDir, 'package.json'),
      JSON.stringify(
        {
          name: 'whatsapp-rust-bridge',
          exports: { '.': { import: './dist/index.js', types: './dist/index.d.ts' } },
        },
        null,
        2,
      ),
    );
  });

  afterEach(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('adds require/default exports when missing', () => {
    patchPkgAtRoot(tmpRoot);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, 'node_modules', 'whatsapp-rust-bridge', 'package.json'), 'utf8'),
    );
    expect(pkg.exports['.'].require).toBe('./dist/index.js');
    expect(pkg.exports['.'].default).toBe('./dist/index.js');
  });

  it('is idempotent when require already present', () => {
    patchPkgAtRoot(tmpRoot);
    patchPkgAtRoot(tmpRoot);
    const pkg = JSON.parse(
      fs.readFileSync(path.join(tmpRoot, 'node_modules', 'whatsapp-rust-bridge', 'package.json'), 'utf8'),
    );
    expect(pkg.exports['.'].require).toBe('./dist/index.js');
  });
});
