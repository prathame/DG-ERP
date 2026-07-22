import { fetchImageAsDataUrl, resolveIrnQrPayload } from './utils';
import type { DistributionBillData } from '../api';

/** Shared QR + showGst opts for Tax Invoice / Bill of Supply print. */
export async function buildGstPrintOptions(bill: DistributionBillData, showGst: boolean, fullyPaid: boolean) {
  const bs = (bill as unknown as Record<string, unknown>).billSettings as Record<string, unknown> | undefined;
  const irnPayload = resolveIrnQrPayload({ irnQr: bill.irnQr, qrCode: bill.irnQr });
  const billForPrint = irnPayload && bill.irnQr !== irnPayload ? { ...bill, irnQr: irnPayload } : bill;
  const [upiRes, irnRes] = await Promise.all([
    bs?.bankUpiId
      ? fetchImageAsDataUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(`upi://pay?pa=${bs.bankUpiId}&pn=${bs.bankAccountName || 'Business'}&cu=INR`)}`,
          3000,
        )
      : Promise.resolve(undefined),
    irnPayload
      ? fetchImageAsDataUrl(
          `https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(irnPayload)}`,
          3000,
        )
      : Promise.resolve(undefined),
  ]);
  const qrDataUrl = typeof upiRes === 'string' && upiRes.startsWith('data:image/') ? upiRes : undefined;
  const irnQrDataUrl = typeof irnRes === 'string' && irnRes.startsWith('data:image/') ? irnRes : undefined;
  return { billForPrint, opts: { showGst, fullyPaid, qrDataUrl, irnQrDataUrl } };
}
