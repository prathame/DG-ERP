/**
 * Resolve Meta WhatsApp Cloud API credentials by tenant send mode.
 * Tokens stay server-side; this helper only picks which phone_number_id + token to use.
 */

export type WhatsAppSendMode = 'company' | 'company_selected' | 'per_user';

export const WHATSAPP_SEND_MODES: readonly WhatsAppSendMode[] = ['company', 'company_selected', 'per_user'] as const;

export type WhatsAppCreds = {
  phoneNumberId: string;
  accessToken: string;
};

export type ResolveWhatsAppCredsInput = {
  enabled: boolean;
  mode: string | null | undefined;
  companyPhoneNumberId?: string | null;
  companyAccessToken?: string | null;
  userAllowed?: boolean;
  userPhoneNumberId?: string | null;
  userAccessToken?: string | null;
};

export function isWhatsAppSendMode(v: unknown): v is WhatsAppSendMode {
  return typeof v === 'string' && (WHATSAPP_SEND_MODES as readonly string[]).includes(v);
}

/** Normalize recipient to digits-only E.164-ish (India 10-digit → 91…). */
export function normalizeWhatsAppTo(phone: string): string | null {
  let p = String(phone || '').replace(/[\s\-().+]/g, '');
  if (!p || !/^\d+$/.test(p)) return null;
  if (p.length === 10) p = '91' + p;
  if (p.startsWith('0') && p.length === 11) p = '91' + p.slice(1);
  if (p.length < 10 || p.length > 15) return null;
  return p;
}

/**
 * Pick company or per-user Graph credentials for the current user.
 * Returns null when Business is off, user is ineligible, or creds are incomplete
 * (client should fall back to personal WhatsApp share).
 */
export function resolveWhatsAppCreds(input: ResolveWhatsAppCredsInput): WhatsAppCreds | null {
  if (!input.enabled) return null;
  const mode = input.mode;
  if (!isWhatsAppSendMode(mode)) return null;

  if (mode === 'company') {
    const phoneNumberId = (input.companyPhoneNumberId || '').trim();
    const accessToken = (input.companyAccessToken || '').trim();
    if (!phoneNumberId || !accessToken) return null;
    return { phoneNumberId, accessToken };
  }

  if (mode === 'company_selected') {
    if (!input.userAllowed) return null;
    const phoneNumberId = (input.companyPhoneNumberId || '').trim();
    const accessToken = (input.companyAccessToken || '').trim();
    if (!phoneNumberId || !accessToken) return null;
    return { phoneNumberId, accessToken };
  }

  // per_user
  const phoneNumberId = (input.userPhoneNumberId || '').trim();
  const accessToken = (input.userAccessToken || '').trim();
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken };
}
