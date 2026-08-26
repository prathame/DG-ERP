/** Indian mobile: 10 digits starting with 6–9, optional +91 prefix. */
export const INVALID_PHONE_MESSAGE = 'Invalid phone — must be 10-digit Indian mobile (6-9 start)';

export function isValidPhone(phone: string): boolean {
  const clean = phone.replace(/[\s\-()]/g, '');
  return /^(\+91)?[6-9]\d{9}$/.test(clean);
}

/** Empty is allowed (walk-in B2C). If filled, must be a valid Indian mobile. */
export function phoneValidationError(phone?: string | null): string | null {
  const trimmed = String(phone ?? '').trim();
  if (!trimmed) return null;
  return isValidPhone(trimmed) ? null : INVALID_PHONE_MESSAGE;
}
