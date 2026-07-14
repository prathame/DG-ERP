/**
 * Manages the embedded PostgreSQL instance for on-prem deployment.
 * Uses the 'embedded-postgres' npm package which bundles PG binaries per platform.
 */
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const EmbeddedPostgres = require('embedded-postgres').default ?? require('embedded-postgres');
import { LOCAL_PG_PORT } from '../shared/constants';

let pg: InstanceType<typeof EmbeddedPostgres> | null = null;

export async function startPostgres(): Promise<string> {
  const dataDir = path.join(app.getPath('userData'), 'postgres-data');

  pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'dg_user',
    password: 'dg_local_pass',
    port: LOCAL_PG_PORT,
    persistent: true,
  });

  // Only initialise on first run — skip if data directory already exists
  const isFirstRun = !fs.existsSync(dataDir) || fs.readdirSync(dataDir).length === 0;
  if (isFirstRun) {
    await pg.initialise();
  }
  await pg.start();

  // Ensure the database exists
  const client = pg.getPgClient();
  await client.connect();
  const exists = await client.query(
    `SELECT 1 FROM pg_database WHERE datname = 'dg_erp'`
  );
  if (!exists.rows.length) {
    await client.query('CREATE DATABASE dg_erp');
  }
  await client.end();

  const connStr = `postgresql://dg_user:dg_local_pass@localhost:${LOCAL_PG_PORT}/dg_erp`;
  return connStr;
}

export async function stopPostgres(): Promise<void> {
  if (pg) {
    await pg.stop();
    pg = null;
  }
}
