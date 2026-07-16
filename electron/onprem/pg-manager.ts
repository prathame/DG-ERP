/**
 * Manages the embedded PostgreSQL instance for on-prem deployment.
 * Spawns postgres binaries directly from app.asar.unpacked — bypasses
 * embedded-postgres ESM import which can't resolve binaries inside asar.
 */
import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { execSync, spawn, ChildProcess } from 'child_process';
import { LOCAL_PG_PORT } from '../shared/constants';

let pgProcess: ChildProcess | null = null;

function getBinDir(): string {
  const arch = process.arch;   // arm64 | x64
  const plat = process.platform; // darwin | linux | win32
  const pkgName = `@embedded-postgres/${plat}-${arch}`;
  const base = path.join(__dirname, '..', '..', 'node_modules', pkgName, 'native', 'bin');
  // In packaged app binaries live in app.asar.unpacked
  const unpacked = base.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
  return fs.existsSync(unpacked) ? unpacked : base;
}

function resolvePgPassword(dataDir: string, isFirstRun: boolean): string {
  const credPath = path.join(app.getPath('userData'), 'pg-credentials.json');
  try {
    if (fs.existsSync(credPath)) {
      const saved = JSON.parse(fs.readFileSync(credPath, 'utf8')) as { password?: string };
      if (saved.password) return saved.password;
    }
  } catch { /* fall through */ }
  if (!isFirstRun) throw new Error('PostgreSQL credentials missing. Clear app data and re-activate.');
  const password = crypto.randomBytes(24).toString('base64url');
  try {
    fs.writeFileSync(credPath, JSON.stringify({ user: 'dg_user', password }, null, 2), { mode: 0o600 });
  } catch { /* best-effort */ }
  return password;
}

function ensureExecutable(bin: string): void {
  try { fs.chmodSync(bin, 0o755); } catch { /* read-only fs — ok if already executable */ }
}

export async function startPostgres(): Promise<string> {
  const binDir = getBinDir();
  const initdb  = path.join(binDir, 'initdb');
  const postgres = path.join(binDir, 'postgres');
  const pgCtl   = path.join(binDir, 'pg_ctl');

  [initdb, postgres, pgCtl].forEach(ensureExecutable);

  const dataDir  = path.join(app.getPath('userData'), 'postgres-data');
  const isFirstRun = !fs.existsSync(dataDir) || fs.readdirSync(dataDir).length === 0;
  const password = resolvePgPassword(dataDir, isFirstRun);

  if (isFirstRun) {
    fs.mkdirSync(dataDir, { recursive: true });
    const pwFile = path.join(app.getPath('userData'), 'pg-pw.tmp');
    fs.writeFileSync(pwFile, password + '\n', { mode: 0o600 });
    execSync(
      `"${initdb}" --pgdata="${dataDir}" --auth=password --username=dg_user --pwfile="${pwFile}"`,
      { stdio: 'ignore' }
    );
    fs.unlinkSync(pwFile);
  }

  // Start postgres in background
  // ponytail: use userData for socket — /tmp is world-accessible
  const socketDir = app.getPath('userData');
  pgProcess = spawn(postgres, [
    '-D', dataDir,
    '-p', String(LOCAL_PG_PORT),
    '-k', socketDir,
  ], { stdio: 'ignore', detached: false });

  // Wait for postgres to be ready
  await new Promise<void>((resolve, reject) => {
    const deadline = Date.now() + 15000;
    const check = () => {
      try {
        execSync(`"${pgCtl}" status -D "${dataDir}"`, { stdio: 'ignore' });
        resolve();
      } catch {
        if (Date.now() > deadline) return reject(new Error('Postgres did not start in time'));
        setTimeout(check, 300);
      }
    };
    setTimeout(check, 500);
  });

  // Ensure database exists
  const { Client } = require('pg') as typeof import('pg');
  const client = new Client({ host: 'localhost', port: LOCAL_PG_PORT, user: 'dg_user', password, database: 'postgres' });
  await client.connect();
  const exists = await client.query(`SELECT 1 FROM pg_database WHERE datname = 'dhandho'`);
  if (!exists.rows.length) await client.query('CREATE DATABASE dhandho');
  await client.end();

  return `postgresql://dg_user:${encodeURIComponent(password)}@localhost:${LOCAL_PG_PORT}/dhandho`;
}

export async function stopPostgres(): Promise<void> {
  if (pgProcess) {
    pgProcess.kill('SIGTERM');
    pgProcess = null;
  }
}
