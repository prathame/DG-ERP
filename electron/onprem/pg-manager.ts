/**
 * Manages the embedded PostgreSQL instance for on-prem deployment.
 * Uses the 'embedded-postgres' npm package which bundles PG binaries per platform.
 */
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EmbeddedPostgres = require('embedded-postgres').default ?? require('embedded-postgres');
import { LOCAL_PG_PORT } from '../shared/constants';

// Resolve postgres binaries from app.asar.unpacked so they can be spawned
function getUnpackedBinDir(): string {
  const arch = process.arch; // arm64 or x64
  const platform = process.platform; // darwin, linux, win32
  const pkgName = `@embedded-postgres/${platform}-${arch}`;
  // In packaged app, unpacked modules live in app.asar.unpacked
  const asarPath = path.join(__dirname, '..', '..', 'node_modules', pkgName, 'native', 'bin');
  const unpackedPath = asarPath.replace('app.asar', 'app.asar.unpacked');
  return fs.existsSync(unpackedPath) ? unpackedPath : asarPath;
}

let pg: InstanceType<typeof EmbeddedPostgres> | null = null;

function resolvePgPassword(dataDir: string, isFirstRun: boolean): string {
  const credPath = path.join(app.getPath('userData'), 'pg-credentials.json');
  try {
    if (fs.existsSync(credPath)) {
      const saved = JSON.parse(fs.readFileSync(credPath, 'utf8')) as { password?: string };
      if (saved.password) return saved.password;
    }
  } catch { /* fall through */ }

  // Always generate a fresh random password on first run. Existing installs that
  // somehow lost their credentials file use a deterministic fallback derived from
  // the userData path so the existing PG data directory can still be opened.
  const password = isFirstRun
    ? crypto.randomBytes(24).toString('base64url')
    : crypto.createHash('sha256').update(dataDir).digest('base64url').slice(0, 32);
  try {
    fs.writeFileSync(credPath, JSON.stringify({ user: 'dg_user', password }, null, 2), { mode: 0o600 });
  } catch { /* best-effort */ }
  return password;
}

export async function startPostgres(): Promise<string> {
  const dataDir = path.join(app.getPath('userData'), 'postgres-data');
  const isFirstRun = !fs.existsSync(dataDir) || fs.readdirSync(dataDir).length === 0;
  const password = resolvePgPassword(dataDir, isFirstRun);

  const binDir = getUnpackedBinDir();
  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'dg_user',
    password,
    port: LOCAL_PG_PORT,
    persistent: true,
    // Explicit binary paths so embedded-postgres doesn't try to resolve via import.meta.url inside asar
    postgresPath: path.join(binDir, 'postgres'),
    initdbPath: path.join(binDir, 'initdb'),
    pgCtlPath: path.join(binDir, 'pg_ctl'),
  });

  if (isFirstRun) {
    await pg.initialise();
  }
  await pg.start();

  // Ensure the database exists
  const client = pg.getPgClient();
  await client.connect();
  const exists = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = 'dhandho'`
  );
  if (!exists.rows.length) {
    await client.query('CREATE DATABASE dhandho');
  }
  await client.end();

  const connStr = `postgresql://dg_user:${encodeURIComponent(password)}@localhost:${LOCAL_PG_PORT}/dhandho`;
  return connStr;
}

export async function stopPostgres(): Promise<void> {
  if (pg) {
    await pg.stop();
    pg = null;
  }
}
