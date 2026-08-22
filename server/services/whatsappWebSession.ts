/**
 * WhatsApp Web session manager using Baileys.
 *
 * One Baileys socket per tenant — auth state persisted to PostgreSQL
 * so sessions survive server restarts (Render ephemeral filesystem).
 *
 * Flow:
 *   1. Tenant calls POST /api/whatsapp-web/connect
 *   2. Socket opens → QR string emitted → stored in memory
 *   3. Frontend polls GET /api/whatsapp-web/status → receives QR as data URL
 *   4. User scans with phone → socket fires 'open' → session saved to DB
 *   5. sendPdf() / sendText() use the live socket
 */

import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import type { AuthenticationState } from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Pool } from 'pg';
import { logger } from '../utils/logger';

export type WaSessionStatus = 'disconnected' | 'qr_pending' | 'connecting' | 'connected';

interface TenantSession {
  status: WaSessionStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null;
  socket: ReturnType<typeof makeWASocket> | null;
  authDir: string | null;
}

// In-memory session map (one per tenant)
const sessions = new Map<string, TenantSession>();
let _pool: Pool | null = null;

export function initWhatsAppSessionPool(pool: Pool): void {
  _pool = pool;
}

function getPool(): Pool {
  if (!_pool) throw new Error('WhatsApp session pool not initialised');
  return _pool;
}

function sessionFor(tenantId: string): TenantSession {
  if (!sessions.has(tenantId)) {
    sessions.set(tenantId, { status: 'disconnected', qrDataUrl: null, phoneNumber: null, socket: null, authDir: null });
  }
  return sessions.get(tenantId)!;
}

/** Persist auth state to PostgreSQL (replaces file-based store for cloud). */
async function saveAuthState(tenantId: string, state: AuthenticationState): Promise<void> {
  try {
    const pool = getPool();
    const json = JSON.stringify({
      creds: state.creds,
      // keys are managed via the in-memory signal store — we only need creds for reconnect
    });
    await pool.query(
      `INSERT INTO whatsapp_web_sessions (tenant_id, auth_state, updated_at)
       VALUES ($1, $2::jsonb, NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET auth_state = $2::jsonb, updated_at = NOW()`,
      [tenantId, json],
    );
  } catch (err) {
    logger.warn('WA session save failed', { tenantId, error: err instanceof Error ? err.message : String(err) });
  }
}

async function savePhoneNumber(tenantId: string, phoneNumber: string): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `UPDATE whatsapp_web_sessions SET phone_number = $1, connected_at = NOW(), updated_at = NOW() WHERE tenant_id = $2`,
      [phoneNumber, tenantId],
    );
  } catch {
    /* ignore */
  }
}

/** Create a temp dir for Baileys auth files (per tenant). */
function makeTempAuthDir(tenantId: string): string {
  const dir = path.join(os.tmpdir(), 'dg-wa', tenantId.replace(/[^a-z0-9-]/gi, '_'));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/** Connect (or reconnect) a tenant's WhatsApp session. */
export async function connectSession(tenantId: string, userInitiated = true): Promise<void> {
  const session = sessionFor(tenantId);
  logger.info('WA connect start', { tenantId });

  // Close existing socket if any
  if (session.socket) {
    try {
      session.socket.end(undefined);
    } catch {
      /* ignore */
    }
    session.socket = null;
  }

  session.status = 'connecting';
  session.qrDataUrl = null;

  const authDir = session.authDir || makeTempAuthDir(tenantId);
  session.authDir = authDir;

  let state: Awaited<ReturnType<typeof useMultiFileAuthState>>['state'];
  let saveCreds: Awaited<ReturnType<typeof useMultiFileAuthState>>['saveCreds'];
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- Baileys API, not a React hook
    const result = await useMultiFileAuthState(authDir);
    state = result.state;
    saveCreds = result.saveCreds;
    const hasCreds = !!result.state.creds.me;
    logger.info('WA auth state loaded', { tenantId, authDir, hasCreds });
    // Auto-reconnect without credentials → would just show QR without user asking.
    // Only proceed if user clicked Connect or we have saved credentials.
    if (!hasCreds && !userInitiated) {
      session.status = 'disconnected';
      logger.info('WA auto-reconnect skipped — no saved creds, user must click Connect', { tenantId });
      return;
    }
  } catch (err) {
    logger.error('WA auth state load failed', {
      tenantId,
      authDir,
      alert: 'wa_auth_load_failed',
      error: err instanceof Error ? err.message : String(err),
    });
    session.status = 'disconnected';
    return;
  }

  // Fetch latest WA version with a 10s timeout — fallback to a known-good version
  // to avoid hanging on Render's network during boot.
  let version: [number, number, number] = [2, 3000, 1015901307];
  try {
    const result = (await Promise.race([
      fetchLatestBaileysVersion(),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 10_000)),
    ])) as { version: [number, number, number] };
    version = result.version;
  } catch {
    logger.warn('WA fetchLatestBaileysVersion timed out — using pinned version', { tenantId, version });
  }

  // No-op pino-compatible logger for Baileys internals
  const noop = () => {};
  const silentLogger = {
    level: 'silent',
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => silentLogger,
  } as unknown as Parameters<typeof makeWASocket>[0]['logger'];

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, silentLogger),
    },
    printQRInTerminal: false,
    logger: silentLogger,
    browser: ['Dhandho ERP', 'Chrome', '1.0'],
    generateHighQualityLinkPreview: false,
    getMessage: async () => undefined,
    connectTimeoutMs: 30_000,
    keepAliveIntervalMs: 15_000,
  });

  // Safety timeout — if QR never arrives in 45s, reset to disconnected so user can retry
  const qrTimeout = setTimeout(() => {
    if (sessions.get(tenantId)?.status === 'connecting') {
      logger.warn('WA QR timeout — no QR received in 45s, resetting', { tenantId });
      session.status = 'disconnected';
      session.qrDataUrl = null;
      try {
        sock.end(undefined);
      } catch {
        /* ignore */
      }
    }
  }, 45_000);

  session.socket = sock;
  sessions.set(tenantId, session);

  sock.ev.on('creds.update', async () => {
    await saveCreds();
    await saveAuthState(tenantId, state);
  });

  sock.ev.on('connection.update', async update => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      clearTimeout(qrTimeout);
      try {
        const dataUrl = await QRCode.toDataURL(qr, { width: 256, margin: 2 });
        session.qrDataUrl = dataUrl;
        session.status = 'qr_pending';
        logger.info('WA QR generated', { tenantId });
      } catch {
        /* ignore */
      }
    }

    if (connection === 'open') {
      clearTimeout(qrTimeout);
      session.status = 'connected';
      session.qrDataUrl = null;
      const jid = sock.user?.id || '';
      const phone = jid.split(':')[0].split('@')[0];
      session.phoneNumber = phone || null;
      logger.info('WA connected', { tenantId, phone });
      await savePhoneNumber(tenantId, phone);
    }

    if (connection === 'close') {
      const boom = lastDisconnect?.error as Boom | undefined;
      const reason = boom?.output?.statusCode;
      const loggedOut = reason === DisconnectReason.loggedOut;
      logger.warn('WA connection closed', {
        tenantId,
        reason,
        loggedOut,
        errorMessage: boom?.message || (lastDisconnect?.error as Error)?.message || 'unknown',
        alert: loggedOut ? undefined : 'wa_connection_dropped',
      });

      if (loggedOut) {
        session.status = 'disconnected';
        session.phoneNumber = null;
        // Clear auth dir so next connect gets a fresh QR
        try {
          fs.rmSync(authDir, { recursive: true, force: true });
        } catch {
          /* ignore */
        }
        session.authDir = null;
        await clearSession(tenantId);
      } else {
        // Reconnect on network drop — userInitiated=false so won't show QR if creds lost
        setTimeout(() => connectSession(tenantId, false), 3000);
      }
    }
  });
}

export function getSessionStatus(tenantId: string): {
  status: WaSessionStatus;
  qrDataUrl: string | null;
  phoneNumber: string | null;
} {
  const s = sessions.get(tenantId) || { status: 'disconnected', qrDataUrl: null, phoneNumber: null };
  return { status: s.status, qrDataUrl: s.qrDataUrl, phoneNumber: s.phoneNumber };
}

export function isConnected(tenantId: string): boolean {
  return sessions.get(tenantId)?.status === 'connected';
}

/** Send a PDF to a phone number via WhatsApp Web. */
export async function sendPdfViaWeb(
  tenantId: string,
  phone: string,
  pdfBuffer: Buffer,
  filename: string,
  caption?: string,
): Promise<void> {
  const session = sessions.get(tenantId);
  if (!session?.socket || session.status !== 'connected') {
    throw new Error('WhatsApp Web not connected for this tenant');
  }
  // Normalise phone: strip non-digits, ensure country code
  const digits = phone.replace(/\D/g, '');
  const normalised = digits.startsWith('91') ? digits : `91${digits}`;
  const jid = `${normalised}@s.whatsapp.net`;

  await session.socket.sendMessage(jid, {
    document: pdfBuffer,
    mimetype: 'application/pdf',
    fileName: filename,
    caption: caption || '',
  });
  logger.info('WA PDF sent', { tenantId, to: normalised, filename });
}

/** Send an image with optional caption. */
export async function sendImageViaWeb(
  tenantId: string,
  phone: string,
  imageBuffer: Buffer,
  mimetype: 'image/jpeg' | 'image/png' | 'image/webp',
  caption?: string,
): Promise<void> {
  const session = sessions.get(tenantId);
  if (!session?.socket || session.status !== 'connected') {
    throw new Error('WhatsApp Web not connected for this tenant');
  }
  const digits = phone.replace(/\D/g, '');
  const normalised = digits.startsWith('91') ? digits : `91${digits}`;
  const jid = `${normalised}@s.whatsapp.net`;
  await session.socket.sendMessage(jid, {
    image: imageBuffer,
    mimetype,
    caption: caption || '',
  });
  logger.info('WA image sent', { tenantId, to: normalised });
}

/** Send a text message. */
export async function sendTextViaWeb(tenantId: string, phone: string, message: string): Promise<void> {
  const session = sessions.get(tenantId);
  if (!session?.socket || session.status !== 'connected') {
    throw new Error('WhatsApp Web not connected for this tenant');
  }
  const digits = phone.replace(/\D/g, '');
  const normalised = digits.startsWith('91') ? digits : `91${digits}`;
  const jid = `${normalised}@s.whatsapp.net`;
  await session.socket.sendMessage(jid, { text: message });
  logger.info('WA text sent', { tenantId, to: normalised });
}

/** Disconnect and clear session. */
export async function disconnectSession(tenantId: string): Promise<void> {
  const session = sessions.get(tenantId);
  if (session?.socket) {
    try {
      await session.socket.logout();
    } catch {
      /* ignore */
    }
    try {
      session.socket.end(undefined);
    } catch {
      /* ignore */
    }
  }
  sessions.delete(tenantId);
  if (session?.authDir) {
    try {
      fs.rmSync(session.authDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
  await clearSession(tenantId);
}

async function clearSession(tenantId: string): Promise<void> {
  try {
    await getPool().query('DELETE FROM whatsapp_web_sessions WHERE tenant_id = $1', [tenantId]);
  } catch {
    /* ignore */
  }
}

/** On server startup, reconnect all tenants that have saved sessions. */
/** On server startup, only reconnect tenants that previously connected successfully (phone_number set).
 *  Tenants that never completed the QR scan are NOT auto-reconnected — they must click Connect.
 *  This prevents the QR being shown continuously without user interaction. */
export async function reconnectAllSavedSessions(pool: Pool): Promise<void> {
  initWhatsAppSessionPool(pool);
  try {
    const { rows } = await pool.query(
      `SELECT tenant_id, phone_number FROM whatsapp_web_sessions
       WHERE auth_state != '{}'::jsonb AND phone_number IS NOT NULL`,
    );
    for (const row of rows as { tenant_id: string; phone_number: string }[]) {
      const s = sessionFor(row.tenant_id);
      s.phoneNumber = row.phone_number;
      // Reconnect in background — don't block server startup
      // userInitiated=false: if creds expired (no hasCreds), stops rather than showing QR
      connectSession(row.tenant_id, false).catch(err => {
        logger.warn('WA reconnect failed', { tenantId: row.tenant_id, error: String(err) });
      });
    }
    if (rows.length > 0) logger.info('WA sessions reconnecting', { count: rows.length });
  } catch (err) {
    logger.warn('WA session reconnect init failed', { error: String(err) });
  }
}
