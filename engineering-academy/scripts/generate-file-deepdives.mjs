#!/usr/bin/env node
/**
 * Generates MDX-safe deep-dive markdown for every TS/TSX source file in DG-ERP.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ACADEMY = path.resolve(__dirname, '..');
// Academy lives at <repo>/engineering-academy — product source is the repo root.
const REPO = path.resolve(ACADEMY, '..');
const OUT = path.join(ACADEMY, 'docs/files/generated');

const ROOTS = [
  {dir: 'server', label: 'Server'},
  {dir: 'src', label: 'Frontend'},
  {dir: 'electron', label: 'Electron'},
  {dir: 'tests', label: 'Tests'},
];

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function code(s) {
  return '`' + String(s).replace(/`/g, "'") + '`';
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (/\.(ts|tsx|js|cjs|mjs)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) acc.push(full);
  }
  return acc;
}

function extractSymbols(source) {
  const exports = [];
  const functions = [];
  const classes = [];
  const reExport = /export\s+(?:async\s+)?(?:function|const|class|type|interface|enum)\s+(\w+)/g;
  const reFn = /(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)/g;
  const reClass = /(?:export\s+)?class\s+(\w+)/g;
  const reConstFn = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s*)?\(/g;
  let m;
  while ((m = reExport.exec(source))) exports.push(m[1]);
  while ((m = reFn.exec(source))) functions.push({name: m[1], params: m[2].trim()});
  while ((m = reClass.exec(source))) classes.push(m[1]);
  while ((m = reConstFn.exec(source))) {
    if (!functions.find(f => f.name === m[1])) functions.push({name: m[1], params: '...'});
  }
  return {exports: [...new Set(exports)], functions, classes};
}

function extractImports(source) {
  const imports = [];
  const re = /import\s+(?:type\s+)?(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(source))) imports.push(m[1]);
  return [...new Set(imports)];
}

function slugify(rel) {
  return rel.replace(/[\\/]/g, '__').replace(/\.(tsx?|jsx?|cjs|mjs)$/, '').toLowerCase();
}

function pageFor(rel, abs) {
  const source = fs.readFileSync(abs, 'utf8');
  const lines = source.split('\n').length;
  const {exports, functions, classes} = extractSymbols(source);
  const imports = extractImports(source);
  const slug = slugify(rel);
  const base = path.basename(rel).replace(/\.(tsx?|jsx?|cjs|mjs)$/, '');

  const fnSections = functions
    .slice(0, 60)
    .map(f => {
      const sig = f.name + '(' + (f.params || '') + ')';
      return [
        '### Function: ' + esc(f.name),
        '',
        '```ts',
        sig,
        '```',
        '',
        '| Aspect | Detail |',
        '| --- | --- |',
        '| Purpose | Symbol in ' + code(rel) + '. Open the source and read the body. |',
        '| Parameters | See signature above. |',
        '| What breaks if removed | Search the repo for ' + code(f.name) + ' before deleting. |',
        '| Security | If it touches auth, tenant_id, money, GST, or PII — treat as security-sensitive. |',
        '| Performance | Watch for N+1 queries, unbounded loops, sync crypto, large JSON. |',
        '| Alternatives | Inline (worse), extract shared helper (if duplicated), or use a standard library. |',
        '',
      ].join('\n');
    })
    .join('\n');

  const importList = imports.length
    ? imports.map(i => '- ' + code(i)).join('\n')
    : '_No static imports detected._';

  const exportList = exports.length ? exports.map(e => code(e)).join(', ') : '_none detected_';
  const classList = classes.length ? classes.map(c => code(c)).join(', ') : '_none_';

  return [
    '---',
    'sidebar_label: "' + path.basename(rel).replace(/"/g, '') + '"',
    'title: "File ' + rel.replace(/"/g, '') + '"',
    'description: "Deep walkthrough of ' + rel.replace(/"/g, '') + ' in DG-ERP / Dhandho"',
    '---',
    '',
    '# File walkthrough: ' + code(rel),
    '',
    ':::info Ownership context',
    'Auto-generated from the live source tree so **no file is invisible** during onboarding.',
    ':::',
    '',
    '## Purpose',
    '',
    code(rel) + ' is part of Dhandho (DG-ERP). Approximate size: **' + lines + ' lines**.',
    '',
    '## Business value',
    '',
    'Ask: *If this file disappeared tomorrow, which user-facing workflow would break?*',
    '',
    '## Imports',
    '',
    importList,
    '',
    '## Exports and symbols',
    '',
    '**Exported names:** ' + exportList,
    '',
    '**Classes:** ' + classList,
    '',
    '## Functions (' + functions.length + ' detected)',
    '',
    fnSections || '_No function declarations matched the static scanner._',
    '',
    '## Execution flow',
    '',
    '1. Module loaded by Node (`tsx`) or Vite.',
    '2. Top-level imports initialize dependencies.',
    '3. Callers import exported symbols.',
    '',
    '## Call hierarchy',
    '',
    '```bash',
    '# From DG-ERP repo root',
    'rg -n "' + base.replace(/"/g, '') + '" --glob \'!node_modules\' -g \'*.ts\' -g \'*.tsx\'',
    '```',
    '',
    '## Performance impact',
    '',
    'Line count **' + lines + '**. Large view/route files are refactor candidates.',
    '',
    '## Security impact',
    '',
    'Review for: tenant scoping, IDOR, secrets in logs, XSS, path traversal on backups.',
    '',
    '## Scalability',
    '',
    'In-memory caches (authCache, GET Map) do **not** share across instances.',
    '',
    '## Refactoring opportunities',
    '',
    '- Extract pure helpers for unit tests',
    '- Split modules larger than ~800 lines',
    '- Deduplicate GST math via shared SQL fragments',
    '',
    '## Common mistakes',
    '',
    '- Forgetting `tenant_id` in a new query',
    '- Trusting JWT role claims without live DB hydration',
    '- Putting secrets in `VITE_*` env vars',
    '- Returning raw DB errors to clients',
    '',
    '## Alternative implementations',
    '',
    '| Approach | Trade-off |',
    '| --- | --- |',
    '| Keep as-is | Fast to ship; harder to test |',
    '| Split module | Clearer ownership; more files |',
    '| Shared package | Reuse across surfaces; packaging cost |',
    '',
    '## Related academy pages',
    '',
    '- [File index](/files/)',
    '- [Generated index](/files/generated/)',
    '- [Architecture](/architecture/system-overview)',
    '- [Security threat model](/security/threat-model)',
    '',
    '## Hands-on',
    '',
    '1. Open ' + code(rel) + ' in the IDE.',
    '2. Breakpoint the largest exported function.',
    '3. Trigger via UI or supertest.',
    '4. Write one sentence on why this file exists in the product narrative.',
    '',
    '---',
    '',
    '*Generated by scripts/generate-file-deepdives.mjs · slug: ' + code(slug) + '*',
    '',
  ].join('\n');
}

function main() {
  fs.mkdirSync(OUT, {recursive: true});
  for (const entry of fs.readdirSync(OUT)) {
    if (entry === '_category_.json') continue;
    fs.rmSync(path.join(OUT, entry), {recursive: true, force: true});
  }
  const indexItems = [];

  for (const root of ROOTS) {
    const base = path.join(REPO, root.dir);
    const files = walk(base).sort();
    for (const abs of files) {
      const rel = path.relative(REPO, abs);
      const slug = slugify(rel);
      fs.writeFileSync(path.join(OUT, slug + '.md'), pageFor(rel, abs));
      indexItems.push({rel, slug, root: root.label});
    }
  }

  const byRoot = ROOTS.map(r => {
    const items = indexItems.filter(i => i.root === r.label);
    return (
      '## ' +
      r.label +
      ' (' +
      items.length +
      ' files)\n\n' +
      items.map(i => '- [' + code(i.rel) + '](/files/generated/' + i.slug + ')').join('\n')
    );
  }).join('\n\n');

  fs.writeFileSync(
    path.join(OUT, 'index.md'),
    [
      '---',
      'sidebar_label: Generated file index',
      'title: Generated deep-dives (every source file)',
      'description: Auto-generated walkthrough pages for every TS/TSX file in DG-ERP',
      '---',
      '',
      '# Generated file deep-dives',
      '',
      ':::tip',
      'These pages ensure **zero skipped files**. Prefer curated chapters under [File Walkthrough](/files/) for narrative learning.',
      ':::',
      '',
      byRoot,
      '',
      '**Total files documented:** ' + indexItems.length,
      '',
    ].join('\n'),
  );

  console.log('Wrote ' + indexItems.length + ' deep-dives + index → ' + OUT);
}

main();
