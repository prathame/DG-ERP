import { describe, expect, it } from 'vitest';
import { isWhatsAppSendMode, normalizeWhatsAppTo, resolveWhatsAppCreds } from '../../server/utils/whatsappBusiness';

describe('whatsappBusiness resolveWhatsAppCreds', () => {
  const company = {
    companyPhoneNumberId: 'PN-CO',
    companyAccessToken: 'tok-co',
  };
  const user = {
    userPhoneNumberId: 'PN-U',
    userAccessToken: 'tok-u',
  };

  it('returns null when Business is off', () => {
    expect(
      resolveWhatsAppCreds({
        enabled: false,
        mode: 'company',
        ...company,
      }),
    ).toBeNull();
  });

  it('company mode uses company creds for all users', () => {
    expect(
      resolveWhatsAppCreds({
        enabled: true,
        mode: 'company',
        ...company,
        userAllowed: false,
      }),
    ).toEqual({ phoneNumberId: 'PN-CO', accessToken: 'tok-co' });
  });

  it('company_selected requires allowlist', () => {
    expect(
      resolveWhatsAppCreds({
        enabled: true,
        mode: 'company_selected',
        ...company,
        userAllowed: false,
      }),
    ).toBeNull();
    expect(
      resolveWhatsAppCreds({
        enabled: true,
        mode: 'company_selected',
        ...company,
        userAllowed: true,
      }),
    ).toEqual({ phoneNumberId: 'PN-CO', accessToken: 'tok-co' });
  });

  it('per_user uses user creds; missing → null', () => {
    expect(
      resolveWhatsAppCreds({
        enabled: true,
        mode: 'per_user',
        ...company,
        userAllowed: true,
      }),
    ).toBeNull();
    expect(
      resolveWhatsAppCreds({
        enabled: true,
        mode: 'per_user',
        ...user,
      }),
    ).toEqual({ phoneNumberId: 'PN-U', accessToken: 'tok-u' });
  });

  it('rejects incomplete company creds', () => {
    expect(
      resolveWhatsAppCreds({
        enabled: true,
        mode: 'company',
        companyPhoneNumberId: 'PN-CO',
        companyAccessToken: '',
      }),
    ).toBeNull();
  });
});

describe('whatsappBusiness helpers', () => {
  it('validates send modes', () => {
    expect(isWhatsAppSendMode('company')).toBe(true);
    expect(isWhatsAppSendMode('company_selected')).toBe(true);
    expect(isWhatsAppSendMode('per_user')).toBe(true);
    expect(isWhatsAppSendMode('other')).toBe(false);
  });

  it('normalizes Indian phone numbers', () => {
    expect(normalizeWhatsAppTo('9876543210')).toBe('919876543210');
    expect(normalizeWhatsAppTo('+91 98765-43210')).toBe('919876543210');
    expect(normalizeWhatsAppTo('bad')).toBeNull();
  });
});
