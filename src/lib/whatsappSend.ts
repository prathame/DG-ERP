/**
 * Thin gate: try Meta WhatsApp Cloud API when the tenant has Business ON and
 * this user is eligible; otherwise callers keep personal wa.me / Cap / Electron share.
 * Session exposes flags only — never tokens.
 */
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
  const token = session.getToken();
  if (!token) return false;
  const to = (phone || '').trim();
  const text = (message || '').trim();
  if (!to || !text) return false;
  try {
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, message: text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
