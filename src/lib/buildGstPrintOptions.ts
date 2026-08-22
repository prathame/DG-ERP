import { fetchImageAsDataUrl, resolveIrnQrPayload } from './utils';
import { resolveUpiQrDataUrl, generateQrDataUrl } from './upiQr';
import type { DistributionBillData } from '../api';

/** Shared QR + showGst opts for Tax Invoice / Bill of Supply print. */
export async function buildGstPrintOptions(bill: DistributionBillData, showGst: boolean, fullyPaid: boolean) {
  const bs = (bill as unknown as Record<string, unknown>).billSettings as Record<string, unknown> | undefined;
  const irnPayload = resolveIrnQrPayload({ irnQr: bill.irnQr, qrCode: bill.irnQr });
  const billForPrint = irnPayload && bill.irnQr !== irnPayload ? { ...bill, irnQr: irnPayload } : bill;
  const [upiRes, irnRes] = await Promise.all([
    resolveUpiQrDataUrl(bs),
    irnPayload ? generateQrDataUrl(irnPayload, 140) : Promise.resolve(''),
  ]);
  const qrDataUrl = typeof upiRes === 'string' && upiRes.startsWith('data:image/') ? upiRes : undefined;
  const irnQrDataUrl = typeof irnRes === 'string' && irnRes.startsWith('data:image/') ? irnRes : undefined;
  return { billForPrint, opts: { showGst, fullyPaid, qrDataUrl, irnQrDataUrl } };
}
