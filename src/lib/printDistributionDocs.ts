import { openPrintWindow, writePrintHtml } from './utils';
import { generateDistributionChallanHtml, buildDistributionBillSlice } from './billTemplates';
import type { DistributionBillData } from '../api';
import { buildGstPrintOptions } from './buildGstPrintOptions';

export type DistPrintKind = 'gst' | 'bos' | 'both';

function makeSlice(
  bill: DistributionBillData,
  items: DistributionBillData['items'],
  amount: number,
  docNo: string,
  stripIrn: boolean,
) {
  const slice = buildDistributionBillSlice(bill, items, amount);
  return {
    ...slice,
    challanId: docNo,
    ...(stripIrn ? { irn: null, irnQr: null, irnAckNo: null, irnAckDt: null } : {}),
  };
}

/** Print Tax Invoice and/or Bill of Supply from a delivery-set bill (no Split Bill required). */
export async function printDistributionDocs(
  bill: DistributionBillData,
  kind: DistPrintKind,
  fullyPaid = false,
): Promise<void> {
  const gstItems = bill.items.filter(i => i.gstApplied === true);
  const bosItems = bill.items.filter(i => i.gstApplied !== true);
  const gstDocNo = bill.deliverySet?.gstDocNo || `${bill.challanId}-GST`;
  const bosDocNo = bill.deliverySet?.nonGstDocNo || `${bill.challanId}-BOS`;

  const printOne = async (which: 'gst' | 'bos') => {
    const items = which === 'gst' ? gstItems : bosItems;
    if (items.length === 0) return;
    const w = openPrintWindow();
    try {
      const sub = items.reduce((s, i) => s + i.price, 0);
      const docNo = which === 'gst' ? gstDocNo : bosDocNo;
      const slice = {
        ...makeSlice(bill, items, sub, docNo, which === 'bos'),
        ...(which === 'gst'
          ? { irn: bill.irn, irnQr: bill.irnQr, irnAckNo: bill.irnAckNo, irnAckDt: bill.irnAckDt }
          : {}),
        ewbNumber: bill.ewbNumber,
      };
      const { billForPrint, opts } = await buildGstPrintOptions(slice, which === 'gst', fullyPaid);
      writePrintHtml(w, generateDistributionChallanHtml(billForPrint, opts), {
        filename: which === 'gst' ? `Tax-Invoice-${docNo}` : `Bill-of-Supply-${docNo}`,
      });
    } catch (err) {
      try {
        w?.close();
      } catch {
        /* ignore */
      }
      throw err;
    }
  };

  if (kind === 'gst' || kind === 'both') await printOne('gst');
  if (kind === 'bos' || kind === 'both') await printOne('bos');
}

export function deliveryPrintAvailability(bill: DistributionBillData): {
  hasGst: boolean;
  hasBos: boolean;
  isDual: boolean;
} {
  const hasGst = bill.items.some(i => i.gstApplied === true);
  const hasBos = bill.items.some(i => i.gstApplied !== true);
  return {
    hasGst,
    hasBos,
    isDual: !!(bill.deliverySet?.isDualDocs || (hasGst && hasBos)),
  };
}
