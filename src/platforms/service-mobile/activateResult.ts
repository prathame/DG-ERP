export type ServiceMobileActivateResult = {
  valid: boolean;
  licenseKey: string;
  companyName: string;
  businessType: 'service';
  maxUsers: 1;
  validUntil: string | null;
  adminEmail: string | null;
  settings: Record<string, unknown>;
  tabConfig: Record<string, { label: string; visible: boolean }>;
  hasBackup: boolean;
  error?: string;
};

type LooseActivate = Partial<ServiceMobileActivateResult> & {
  error?: string;
  company_name?: string;
  license_key?: string;
  admin_email?: string | null;
  valid_until?: string | null;
  data?: LooseActivate;
};

/**
 * Normalize /api/service-mobile/activate JSON.
 * Some 2xx bodies historically omitted `valid: true` or used snake_case —
 * the UI treated that as failure even though the cloud accepted the key.
 */
export function normalizeActivateResult(
  status: number,
  raw: LooseActivate | null | undefined,
  fallbackLicenseKey: string,
): ServiceMobileActivateResult {
  const body = (raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' ? raw.data : raw) || {};

  if (status >= 400) {
    return fail(fallbackLicenseKey, body.error || 'Activation failed');
  }

  const companyName =
    (typeof body.companyName === 'string' && body.companyName) ||
    (typeof body.company_name === 'string' && body.company_name) ||
    '';
  const licenseKey =
    (typeof body.licenseKey === 'string' && body.licenseKey) ||
    (typeof body.license_key === 'string' && body.license_key) ||
    fallbackLicenseKey;
  const adminEmail =
    body.adminEmail !== undefined ? body.adminEmail : body.admin_email !== undefined ? body.admin_email : null;
  const validUntil =
    body.validUntil !== undefined ? body.validUntil : body.valid_until !== undefined ? body.valid_until : null;

  const explicitFail =
    body.valid === false || (typeof body.error === 'string' && body.error.length > 0 && !companyName);
  if (explicitFail) {
    return fail(fallbackLicenseKey, body.error || 'Activation failed');
  }

  const accepted = body.valid === true || Boolean(companyName) || Boolean(body.licenseKey || body.license_key);
  if (!accepted) {
    return fail(
      fallbackLicenseKey,
      body.error || 'Activation failed — incomplete response from server (missing company name)',
    );
  }

  return {
    valid: true,
    licenseKey,
    companyName: companyName || 'Service Mobile',
    businessType: 'service',
    maxUsers: 1,
    validUntil: validUntil ?? null,
    adminEmail: adminEmail ?? null,
    settings: body.settings && typeof body.settings === 'object' ? body.settings : {},
    tabConfig: body.tabConfig && typeof body.tabConfig === 'object' ? body.tabConfig : {},
    hasBackup: Boolean(body.hasBackup),
  };
}

function fail(licenseKey: string, error: string): ServiceMobileActivateResult {
  return {
    valid: false,
    licenseKey,
    companyName: '',
    businessType: 'service',
    maxUsers: 1,
    validUntil: null,
    adminEmail: null,
    settings: {},
    tabConfig: {},
    hasBackup: false,
    error,
  };
}
