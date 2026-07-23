/**
 * Thin gate: try Meta WhatsApp Cloud API when the tenant has Business ON and
 * this user is eligible; otherwise callers keep personal wa.me / Cap / Electron share.
 * Session exposes flags only — never tokens.
 * Uses fetchApi so Cap Online / Electron send X-DG-Client (APP_ONLY gate).
 */
import { fetchApi } from '../api';
import { session } from './session';

type WaUserFlags = {
  whatsappBusinessEnabled?: boolean;
  whatsappSendMode?: string | null;
  whatsappApiAllowed?: boolean;
};

/** Client-side eligibility hint (server still re-checks). */
export function canUseWhatsAppBusinessApi(): boolean {
  try {
    const u = (session.getUser() || {}) as WaUserFlags;
    if (!u.whatsappBusinessEnabled) return false;
    const mode = u.whatsappSendMode;
    if (mode === 'company') return true;
    if (mode === 'company_selected') return !!u.whatsappApiAllowed;
    if (mode === 'per_user') return true; // missing creds → API 403 → personal fallback
    return false;
  } catch {
    return false;
  }
}

/** POST /api/whatsapp/send. Returns true only on success. */
export async function trySendWhatsAppBusiness(phone: string, message: string): Promise<boolean> {
  if (!canUseWhatsAppBusinessApi()) return false;
  if (!session.getToken()) return false;
  const to = (phone || '').trim();
  const text = (message || '').trim();
  if (!to || !text) return false;
  try {
    await fetchApi('/whatsapp/send', {
      method: 'POST',
      body: JSON.stringify({ to, message: text }),
    });
    return true;
  } catch {
    return false;
  }
}
