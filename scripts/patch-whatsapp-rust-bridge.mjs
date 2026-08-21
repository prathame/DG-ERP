/**
 * Baileys 7 pulls in whatsapp-rust-bridge, which only declares an ESM "import"
 * export. tsx/Node CJS resolution fails at startup with ERR_PACKAGE_PATH_NOT_EXPORTED.
 * Add require/default aliases so the server can boot on Render and locally.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const pkgPath = path.join(root, 'node_modules', 'whatsapp-rust-bridge', 'package.json');

if (!fs.existsSync(pkgPath)) {
  process.exit(0);
}

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const entry = pkg.exports?.['.'];
if (!entry || entry.require) {
  process.exit(0);
}

const main = entry.import || './dist/index.js';
entry.require = main;
entry.default = main;
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 4)}\n`);
