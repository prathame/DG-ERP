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

let pg: InstanceType<typeof EmbeddedPostgres> | null = null;

function resolvePgPassword(dataDir: string, isFirstRun: boolean): string {
  const credPath = path.join(app.getPath('userData'), 'pg-credentials.json');
  try {
    if (fs.existsSync(credPath)) {
      const saved = JSON.parse(fs.readFileSync(credPath, 'utf8')) as { password?: string };
      if (saved.password) return saved.password;
    }
  } catch { /* fall through */ }

  // Existing installs without a credentials file keep the legacy password so PG data still opens.
  const password = isFirstRun ? crypto.randomBytes(24).toString('base64url') : 'dg_local_pass';
  try {
    fs.writeFileSync(credPath, JSON.stringify({ user: 'dg_user', password }, null, 2), { mode: 0o600 });
  } catch { /* best-effort */ }
  return password;
}

export async function startPostgres(): Promise<string> {
  const dataDir = path.join(app.getPath('userData'), 'postgres-data');
  const isFirstRun = !fs.existsSync(dataDir) || fs.readdirSync(dataDir).length === 0;
  const password = resolvePgPassword(dataDir, isFirstRun);

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'dg_user',
    password,
    port: LOCAL_PG_PORT,
    persistent: true,
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
