/**
 * Desktop · offline (Electron on-prem).
 * Embedded PostgreSQL → Express → window. Pair with `src/platforms/desktop/offline/`.
 * Shows first-run wizard if no license stored locally.
 */
import { app, BrowserWindow, ipcMain, shell, Menu, nativeImage } from 'electron';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { startPostgres, stopPostgres } from './pg-manager';
import { loadLicense, saveLicense, clearLicense, getMachineId, LicenseData } from './license-store';
import { CLOUD_API, HEARTBEAT_INTERVAL_MS } from '../shared/constants';
import { findFreePort } from '../shared/find-port';

let LOCAL_API_PORT = 3001;
let LOCAL_API_URL = 'http://localhost:3001';

// ── State ─────────────────────────────────────────────────────────────────────
let mainWin: BrowserWindow | null = null;
let wizardWin: BrowserWindow | null = null;
let connectionStatus: 'online' | 'offline' | 'syncing' = 'offline';
let lastSync: Date | null = null;
let licenseInfo: LicenseData | null = null;
let heartbeatTimer: NodeJS.Timeout | null = null;
/** Last forceSyncAt we already applied — prevents reload loop when cloud still has the stamp */
let lastAppliedForceSyncAt: string | null = null;
let lastAppliedSettingsHash: string | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function getIcon() {
  return nativeImage.createFromPath(path.join(__dirname, '../../public/icons/icon-192.svg'));
}

async function startExpressServer(dbUrl: string): Promise<void> {
  process.env.DATABASE_URL = dbUrl;
  process.env.DEPLOYMENT_MODE = 'onprem';
  process.env.PORT = String(LOCAL_API_PORT);
  process.env.NODE_ENV = process.env.NODE_ENV || 'production';
  // Generate a random JWT secret once per install — stored alongside install.key
  if (!process.env.JWT_SECRET) {
    const jwtSecretFile = path.join(app.getPath('userData'), 'jwt.key');
    let jwtSecret: string;
    if (fs.existsSync(jwtSecretFile)) {
      jwtSecret = fs.readFileSync(jwtSecretFile, 'utf8').trim();
    } else {
      jwtSecret = require('crypto').randomBytes(48).toString('base64');
      fs.writeFileSync(jwtSecretFile, jwtSecret, { encoding: 'utf8', mode: 0o600 });
    }
    process.env.JWT_SECRET = jwtSecret;
  }
  // Dynamically import the server (avoids top-level side effects)
  await import('../../server/index');
}

async function waitForServer(maxWait = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    try {
      const r = await fetch(`${LOCAL_API_URL}/api/health`);
      if (r.ok) return;
    } catch {}
    await new Promise(res => setTimeout(res, 500));
  }
  throw new Error('Server did not start within 15 seconds');
}

// ── Heartbeat ─────────────────────────────────────────────────────────────────
async function sendHeartbeat(): Promise<void> {
  if (!licenseInfo) return;
  if (!licenseInfo.licenseKey) {
    console.error('[sync] ABORT: local license.dat has no licenseKey — clear license and re-activate from the wizard');
    connectionStatus = 'offline';
    return;
  }
  connectionStatus = 'syncing';
  try {
    const r = await fetch(`${CLOUD_API}/api/onprem/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: licenseInfo.licenseKey,
        machineId: getMachineId(),
        version: app.getVersion(),
        activeUsers: 1,
        diskMB: 0,
        businessType: licenseInfo.businessType,
        slug: licenseInfo.slug,
        // ponytail: never push tabConfig up — cloud is authoritative, only pull down
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = (await r.json()) as Record<string, unknown>;
    console.log(
      `[sync] heartbeat → ${CLOUD_API} status=${r.status} valid=${data.licenseValid} hasSettings=${!!(data.settings && typeof data.settings === 'object')}${data.error ? ` error=${data.error}` : ''}`,
    );

    // C10 fix: never interpolate cloud data into executeJavaScript — use IPC instead
    if (data.licenseValid === false && data.licenseStatus) {
      // Use a fixed string — don't interpolate data.licenseStatus into JS
      mainWin?.webContents.send('license-status', { valid: false, status: String(data.licenseStatus).slice(0, 32) });
    }

    if (data.forceUpdate) {
      mainWin?.webContents.send('update-available', { forced: true, url: `${CLOUD_API}/download` });
    } else if (data.updateAvailable) {
      mainWin?.webContents.send('update-available', {
        forced: false,
        version: String(data.latestVersion || '').slice(0, 20),
      });
    }

    let shouldReload = false;

    // Apply any pushed settings (tab config, feature toggles) to local tenant
    if (data.settings && typeof data.settings === 'object' && licenseInfo) {
      const s = data.settings as Record<string, unknown>;
      const forceAt = s.forceSyncAt ? String(s.forceSyncAt) : null;
      // Stable hash of settings without the one-shot force stamp
      const { forceSyncAt: _f, ...durable } = s;
      const settingsHash = JSON.stringify(durable);
      const alreadyApplied =
        (forceAt && forceAt === lastAppliedForceSyncAt) || (!forceAt && settingsHash === lastAppliedSettingsHash);

      if (alreadyApplied) {
        console.log('[sync] settings already applied — skip re-apply/reload');
      } else {
        const tc = (s.tabConfig || {}) as Record<string, { visible?: boolean }>;
        const offTabs = Object.entries(tc)
          .filter(([, v]) => v?.visible === false)
          .map(([k]) => k);
        console.log(`[sync] applying settings from cloud… tabsOFF=[${offTabs.join(',')}] force=${!!forceAt}`);
        try {
          const applyRes = await fetch(`${LOCAL_API_URL}/api/onprem/apply-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ licenseKey: licenseInfo.licenseKey, settings: s }),
          });
          const result = (await applyRes.json()) as { applied?: number; error?: string; ok?: boolean };
          console.log(`[sync] apply-settings → ${applyRes.status}`, result);
          if (applyRes.ok) {
            lastAppliedForceSyncAt = forceAt;
            lastAppliedSettingsHash = settingsHash;
            try {
              const markRes = await fetch(`${CLOUD_API}/api/onprem/mark-applied`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  licenseKey: licenseInfo.licenseKey,
                  machineId: getMachineId(),
                }),
              });
              const markBody = await markRes.json().catch(() => ({}));
              console.log(`[sync] mark-applied → ${CLOUD_API} status=${markRes.status}`, markBody);
            } catch (e) {
              console.error('[sync] mark-applied failed:', e);
            }
            if (result.applied && result.applied > 0) {
              shouldReload = true;
            }
          }
        } catch (err) {
          console.error('[sync] apply-settings failed:', err);
        }
      }
    } else {
      console.log('[sync] cloud returned no settings to apply');
    }

    // Pull SA Bell messages queued on cloud → local tenant_notifications
    const pending = Array.isArray(data.pendingNotifications)
      ? (data.pendingNotifications as {
          id: string;
          title: string;
          body: string;
          type?: string;
          source?: string;
          createdAt?: string;
          expiresAt?: string | null;
        }[])
      : [];
    if (pending.length > 0 && licenseInfo) {
      console.log(`[sync] applying ${pending.length} pending notification(s) from cloud…`);
      try {
        const applyNotifRes = await fetch(`${LOCAL_API_URL}/api/onprem/apply-notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey: licenseInfo.licenseKey, notifications: pending }),
        });
        const applyNotifBody = (await applyNotifRes.json().catch(() => ({}))) as {
          ok?: boolean;
          inserted?: number;
          applied?: number;
          ids?: string[];
        };
        console.log(`[sync] apply-notifications → ${applyNotifRes.status}`, applyNotifBody);
        if (applyNotifRes.ok && applyNotifBody.ids?.length) {
          let markedOk = false;
          try {
            const markNotifRes = await fetch(`${CLOUD_API}/api/onprem/mark-notifications-delivered`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                licenseKey: licenseInfo.licenseKey,
                machineId: getMachineId(),
                ids: applyNotifBody.ids,
              }),
            });
            const markNotifBody = (await markNotifRes.json().catch(() => ({}))) as { marked?: number };
            console.log(
              `[sync] mark-notifications-delivered → ${CLOUD_API} status=${markNotifRes.status}`,
              markNotifBody,
            );
            markedOk = markNotifRes.ok;
          } catch (e) {
            console.error('[sync] mark-notifications-delivered failed:', e);
          }
          // Reload when new rows landed locally so Bell updates immediately.
          // Ack failure must not hide already-inserted messages (next heartbeat retries ack).
          const inserted = applyNotifBody.inserted ?? applyNotifBody.applied ?? 0;
          if (inserted > 0) shouldReload = true;
        }
      } catch (err) {
        console.error('[sync] apply-notifications failed:', err);
      }
    }

    if (shouldReload) {
      console.log('[sync] reloading UI');
      mainWin?.webContents.reload();
    }

    // Save validUntil locally so offline expiry check works
    if (data.validUntil && licenseInfo) {
      licenseInfo.validUntil = String(data.validUntil);
      saveLicense(licenseInfo);
    }

    // Check offline expiry
    if (licenseInfo?.validUntil && new Date(licenseInfo.validUntil) < new Date()) {
      mainWin?.webContents.send('license-status', { valid: false, status: 'expired' });
    }

    connectionStatus = 'online';
    lastSync = new Date();
  } catch (err) {
    connectionStatus = 'offline';
    console.error('[sync] heartbeat failed (offline or cloud unreachable):', err);
    // When offline, check local expiry
    if (licenseInfo?.validUntil && new Date(licenseInfo.validUntil) < new Date()) {
      mainWin?.webContents.send('license-status', { valid: false, status: 'expired' });
    }
  }
}

function startHeartbeat(): void {
  sendHeartbeat();
  heartbeatTimer = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
}

// ── First-run wizard ──────────────────────────────────────────────────────────
function showWizard(): void {
  wizardWin = new BrowserWindow({
    width: 520,
    height: 620,
    resizable: false,
    title: 'Dhandho — Setup',
    icon: getIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#f9fafb',
  });
  Menu.setApplicationMenu(null);
  wizardWin.loadFile(path.join(__dirname, 'wizard/index.html'));
}

// IPC: Wizard — validate license with cloud
ipcMain.handle('activate-license', async (_event, licenseKey: string) => {
  try {
    const r = await fetch(`${CLOUD_API}/api/onprem/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey,
        machineId: getMachineId(),
        osInfo: `${os.platform()} ${os.release()}`,
        appVersion: app.getVersion(),
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = (await r.json()) as Record<string, unknown>;
    if (!r.ok) return { valid: false, error: (data.error as string) || 'Invalid license' };
    return { valid: true, ...data };
  } catch (e) {
    return { valid: false, error: 'Cannot reach activation server' };
  }
});

// IPC: Wizard — complete setup, create tenant + admin user
ipcMain.handle('complete-setup', async (_event, data: LicenseData & { adminPassword: string }) => {
  // Refuse re-provision from the main-window preload after setup
  if (loadLicense()) {
    throw new Error('Already provisioned. Re-run the setup wizard only after clearing the license.');
  }
  const slug = data.companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Create tenant via local Express API FIRST — save license only on success
  const r = await fetch(`${LOCAL_API_URL}/api/onprem/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      companyName: data.companyName,
      businessType: data.businessType,
      adminEmail: data.adminEmail || `admin@${slug}.local`,
      adminPassword: data.adminPassword,
      licenseKey: data.licenseKey,
      maxUsers: data.maxUsers,
    }),
  });
  if (!r.ok) {
    const errBody = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    throw new Error(`Provisioning failed (${r.status}): ${errBody.error || 'unknown'}`);
  }

  if (!data.licenseKey) {
    throw new Error('Setup missing licenseKey — re-enter your license key in the wizard');
  }
  // Save license only after successful provisioning
  licenseInfo = { ...data, slug, activatedAt: new Date().toISOString(), lastValidated: new Date().toISOString() };
  saveLicense(licenseInfo);

  wizardWin?.close();
  await openMainWindow(slug);
  // Immediate heartbeat after setup so cloud reflects tab config + business type right away
  await sendHeartbeat().catch(() => {});
  startHeartbeat();
});

// ── Main app window ───────────────────────────────────────────────────────────
async function openMainWindow(slug: string): Promise<void> {
  mainWin = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 600,
    title: 'Dhandho',
    icon: getIcon(),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#ffffff',
    show: false,
  });
  Menu.setApplicationMenu(null);
  mainWin.loadURL(`${LOCAL_API_URL}/${slug}`);
  mainWin.once('ready-to-show', () => mainWin?.show());
  mainWin.webContents.setWindowOpenHandler(({ url }) => {
    // Print / PDF preview uses window.open('') → about:blank
    if (!url || url === 'about:blank' || url.startsWith('about:blank')) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 900,
          height: 720,
          autoHideMenuBar: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    try {
      const u = new URL(url);
      if (u.protocol === 'https:' || u.protocol === 'http:') {
        shell.openExternal(url);
      }
    } catch {
      /* ignore invalid URLs */
    }
    return { action: 'deny' };
  });
  mainWin.on('closed', () => {
    mainWin = null;
  });
}

// IPC: UI requests connection status
ipcMain.handle('get-connection-status', () => ({
  status: connectionStatus,
  lastSync: lastSync?.toISOString() || null,
  version: app.getVersion(),
  validUntil: licenseInfo?.validUntil || null,
}));

// IPC: Manual sync now
ipcMain.handle('sync-now', async () => {
  await sendHeartbeat();
  return { status: connectionStatus, lastSync: lastSync?.toISOString() };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  try {
    // 1. Start embedded PostgreSQL
    const dbUrl = await startPostgres();

    // 2. Find free port + start Express server
    LOCAL_API_PORT = await findFreePort(3001);
    LOCAL_API_URL = `http://localhost:${LOCAL_API_PORT}`;
    await startExpressServer(dbUrl);
    await waitForServer();

    // 3. Check if already set up
    licenseInfo = loadLicense();
    if (!licenseInfo) {
      showWizard();
    } else {
      await openMainWindow(licenseInfo.slug);
      startHeartbeat();
    }
  } catch (err) {
    console.error('Startup failed:', err);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && licenseInfo) {
      openMainWindow(licenseInfo.slug);
    }
  });
});

app.on('window-all-closed', async () => {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  // End pool connections before stopping PG to avoid "terminating connection" errors
  try {
    const { pool } = await import('../../server/pg-db');
    await pool.end();
  } catch {}
  await stopPostgres();
  if (process.platform !== 'darwin') app.quit();
});
