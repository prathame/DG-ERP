import { GST_PINCODE_DISTANCE_URL } from '../../shared/gstEwbValidation';
import { isValidGstin } from '../utils/helpers';
import { isValidPin } from './nic-api';
import { pinFromAddress } from '../utils/pincode';

export type GstEligibilityResult = {
  gstin: string;
  tradeName: string;
  enabled: boolean;
  status: 'enabled' | 'disabled' | 'unknown';
  message: string;
  enabledFrom?: string | null;
};

/** Check if GSTIN is enabled for e-invoicing (NIC master / mock heuristic). */
export async function checkEinvoiceEligibility(
  gstin: string,
  tradeName: string,
  mode: 'mock' | 'sandbox' | 'production',
): Promise<GstEligibilityResult> {
  const g = String(gstin || '')
    .trim()
    .toUpperCase();
  if (!g) {
    return {
      gstin: '',
      tradeName,
      enabled: false,
      status: 'unknown',
      message: 'Enter a GSTIN to check eligibility.',
    };
  }
  if (!isValidGstin(g)) {
    return {
      gstin: g,
      tradeName,
      enabled: false,
      status: 'disabled',
      message: 'GSTIN format is invalid.',
    };
  }

  if (mode === 'mock') {
    return {
      gstin: g,
      tradeName: tradeName || 'Company',
      enabled: true,
      status: 'enabled',
      message: 'Mock mode: treated as e-invoice enabled. Configure sandbox credentials for a live NIC check.',
      enabledFrom: '2020-10-01',
    };
  }

  // Live NIC taxpayer search is GSP-specific; until wired, guide user to portal.
  return {
    gstin: g,
    tradeName: tradeName || 'Company',
    enabled: false,
    status: 'unknown',
    message:
      'Live eligibility lookup is not configured. Verify on the GST e-invoice portal or enable sandbox API credentials.',
    enabledFrom: null,
  };
}

export function lookupTransportDistance(input: {
  fromPin?: string;
  toPin?: string;
  fromAddress?: string;
  toAddress?: string;
  mode: 'mock' | 'sandbox' | 'production';
}): {
  fromPin: string;
  toPin: string;
  distanceKm: number;
  source: 'gst_portal' | 'invalid_pin';
  portalUrl: string;
} {
  const fromPin = (input.fromPin || pinFromAddress(input.fromAddress) || '').trim();
  const toPin = (input.toPin || pinFromAddress(input.toAddress) || '').trim();
  if (!isValidPin(fromPin) || !isValidPin(toPin)) {
    return { fromPin, toPin, distanceKm: 0, source: 'invalid_pin', portalUrl: GST_PINCODE_DISTANCE_URL };
  }
  return {
    fromPin,
    toPin,
    distanceKm: 0,
    source: 'gst_portal',
    portalUrl: GST_PINCODE_DISTANCE_URL,
  };
}
