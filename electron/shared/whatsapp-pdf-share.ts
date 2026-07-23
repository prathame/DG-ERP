/**
 * Electron main-process helpers for desktop WhatsApp invoice PDF share.
 *
 * WhatsApp Desktop URL schemes (wa.me / whatsapp://) cannot attach files.
 * Closest Cap-like UX: write PDF to Downloads, copy file to clipboard for paste,
 * reveal in Finder/Explorer, open WhatsApp chat with caption.
 */
import { app, ipcMain, shell } from 'electron';
import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export type SharePdfWhatsAppPayload = {
  base64: string;
  filename: string;
  phone?: string;
  message?: string;
};

export type SharePdfWhatsAppResult = {
  ok: boolean;
  filePath?: string;
  clipboardOk?: boolean;
  revealed?: boolean;
  whatsappOpened?: boolean;
  error?: string;
};

function safePdfFilename(filename: string): string {
  const base = (filename || 'Document').replace(/[^\w.\- ()#]+/g, '_').slice(0, 80);
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}

function uniqueDownloadPath(safeName: string): string {
  const dir = app.getPath('downloads');
  const dest = path.join(dir, safeName);
  if (!fs.existsSync(dest)) return dest;
  const ext = path.extname(safeName);
  const stem = path.basename(safeName, ext);
  for (let i = 1; i < 100; i++) {
    const candidate = path.join(dir, `${stem} (${i})${ext}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${stem}-${Date.now()}${ext}`);
}

function buildWhatsAppUrl(phone: string | undefined, message: string): string {
  const text = encodeURIComponent(message || '');
  const raw = (phone || '').trim();
  if (!raw) return `https://wa.me/?text=${text}`;
  let p = raw.replace(/[\s\-().+]/g, '');
  if (p.length === 10 && /^\d+$/.test(p)) p = `91${p}`;
  if (p.startsWith('0')) p = `91${p.slice(1)}`;
  return `https://wa.me/${p}?text=${text}`;
}

function buildWhatsAppDesktopUrl(phone: string | undefined, message: string): string | null {
  const text = encodeURIComponent(message || '');
  const raw = (phone || '').trim();
  if (!raw) return `whatsapp://send?text=${text}`;
  let p = raw.replace(/[\s\-().+]/g, '');
  if (p.length === 10 && /^\d+$/.test(p)) p = `91${p}`;
  if (p.startsWith('0')) p = `91${p.slice(1)}`;
  if (!/^\d{8,15}$/.test(p)) return null;
  return `whatsapp://send?phone=${p}&text=${text}`;
}

async function copyFileToClipboard(filePath: string): Promise<boolean> {
  if (process.platform === 'darwin') {
    try {
      await execFileAsync('osascript', ['-e', `set the clipboard to (POSIX file ${JSON.stringify(filePath)})`]);
      return true;
    } catch {
      return false;
    }
  }
  if (process.platform === 'win32') {
    try {
      await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `Set-Clipboard -Path ${JSON.stringify(filePath)}`],
        { windowsHide: true },
      );
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

async function openWhatsApp(phone: string | undefined, message: string): Promise<boolean> {
  const desktop = buildWhatsAppDesktopUrl(phone, message);
  if (desktop) {
    try {
      await shell.openExternal(desktop);
      return true;
    } catch {
      /* fall through to wa.me */
    }
  }
  try {
    await shell.openExternal(buildWhatsAppUrl(phone, message));
    return true;
  } catch {
    return false;
  }
}

export async function sharePdfViaWhatsAppDesktop(payload: SharePdfWhatsAppPayload): Promise<SharePdfWhatsAppResult> {
  try {
    const safeName = safePdfFilename(payload.filename);
    const filePath = uniqueDownloadPath(safeName);
    const buf = Buffer.from(payload.base64 || '', 'base64');
    if (!buf.length) {
      return { ok: false, error: 'Empty PDF' };
    }
    fs.writeFileSync(filePath, buf);

    let clipboardOk = false;
    try {
      clipboardOk = await copyFileToClipboard(filePath);
    } catch {
      clipboardOk = false;
    }

    let revealed = false;
    try {
      shell.showItemInFolder(filePath);
      revealed = true;
    } catch {
      revealed = false;
    }

    const whatsappOpened = await openWhatsApp(payload.phone, payload.message || '');

    return {
      ok: true,
      filePath,
      clipboardOk,
      revealed,
      whatsappOpened,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err ?? 'share failed'),
    };
  }
}

let registered = false;

/** Idempotent IPC registration for Online + Offline desktop boots. */
export function registerWhatsAppPdfShareIpc(): void {
  if (registered) return;
  registered = true;

  ipcMain.removeHandler('open-external');
  ipcMain.handle('open-external', async (_event, url: string) => {
    if (typeof url !== 'string' || !url) return { ok: false };
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:' && u.protocol !== 'http:' && u.protocol !== 'whatsapp:') {
        return { ok: false };
      }
      await shell.openExternal(url);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

  ipcMain.removeHandler('share-pdf-whatsapp');
  ipcMain.handle('share-pdf-whatsapp', async (_event, payload: SharePdfWhatsAppPayload) => {
    if (!payload || typeof payload.base64 !== 'string' || typeof payload.filename !== 'string') {
      return { ok: false, error: 'Invalid payload' } satisfies SharePdfWhatsAppResult;
    }
    return sharePdfViaWhatsAppDesktop(payload);
  });
}
