/** Shared E-Way Bill compliance checks (Jan 2025+ rules). */

/** Official NIC PIN-to-PIN distance (same master used when EWB distance is 0). */
export const GST_PINCODE_DISTANCE_URL = 'https://einvoice1.gst.gov.in/Others/GetPinCodeDistance';

export const EWB_INTERSTATE_THRESHOLD_INR = 50_000;
export const EWB_MAX_DOC_AGE_DAYS = 180;
export const EWB_MAX_DISTANCE_KM = 4000;
export const EWB_VALIDITY_KM_REGULAR = 200;
export const EWB_VALIDITY_KM_ODC = 20;
export const GST_CANCEL_WINDOW_HOURS = 24;
export const EWB_REJECT_WINDOW_HOURS = 72;
export const EWB_EXTENSION_WINDOW_HOURS = 8;
export const EWB_MAX_TOTAL_VALIDITY_DAYS = 360;

export function daysSinceDocumentDate(docDate: string | Date): number {
  const d = typeof docDate === 'string' ? new Date(docDate) : docDate;
  if (Number.isNaN(d.getTime())) return 0;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export type EwbComplianceInput = {
  docDate: string | Date;
  totInvValue: number;
  distance: number;
  vehicleNo?: string;
  transportMode?: string;
};

export function validateEwbCompliance(input: EwbComplianceInput): {
  errors: string[];
  warnings: string[];
  valid: boolean;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const days = daysSinceDocumentDate(input.docDate);

  if (days > EWB_MAX_DOC_AGE_DAYS) {
    errors.push(
      `Document date is ${days} days old — E-Way Bill cannot be generated for documents older than ${EWB_MAX_DOC_AGE_DAYS} days (GST rule from Jan 2025)`,
    );
  }

  if (input.totInvValue < EWB_INTERSTATE_THRESHOLD_INR) {
    warnings.push(
      `Consignment value ₹${input.totInvValue.toLocaleString('en-IN')} is below ₹${EWB_INTERSTATE_THRESHOLD_INR.toLocaleString('en-IN')} — E-Way Bill may not be required for interstate movement (intrastate limits vary by state)`,
    );
  }

  if (input.distance < 0) errors.push('Distance cannot be negative');
  if (input.distance === 0) {
    warnings.push('Distance 0 — government portal will calculate pin-to-pin distance when Part B is filed');
  } else if (input.distance > EWB_MAX_DISTANCE_KM) {
    warnings.push(`Distance ${input.distance} km seems unusually high`);
  }

  const mode = String(input.transportMode || '1');
  if (mode === '1' && !String(input.vehicleNo || '').trim()) {
    errors.push('Vehicle number is required for road transport');
  }

  return { errors, warnings, valid: errors.length === 0 };
}

/** NIC IRN cancel reasons (CnlRsn). */
export const IRN_CANCEL_REASONS = [
  { code: 1, label: 'Duplicate' },
  { code: 2, label: 'Data entry mistake' },
  { code: 3, label: 'Order cancelled' },
  { code: 4, label: 'Others' },
] as const;

/** NIC E-Way cancel reasons (cancelRsnCode). */
export const EWB_CANCEL_REASONS = [
  { code: 1, label: 'Duplicate' },
  { code: 2, label: 'Order cancelled' },
  { code: 3, label: 'Data entry mistake' },
  { code: 4, label: 'Others' },
] as const;
