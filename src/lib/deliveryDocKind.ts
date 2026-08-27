/** Non-service delivery-set doc kind from unit gst_applied counts (#144). */

import { saleChallanBase } from '../../shared/saleChallanNumber';

export type DeliveryDocKind = 'gst' | 'bos' | 'mixed' | 'unknown';

export function deliveryDocKind(gstUnits: number, nonGstUnits: number): DeliveryDocKind {
  if (gstUnits > 0 && nonGstUnits > 0) return 'mixed';
  if (gstUnits > 0) return 'gst';
  if (nonGstUnits > 0) return 'bos';
  return 'unknown';
}

/** Matches getBill challanId / deliverySet -GST / -BOS suffixes. */
export const deliveryChallanBase = saleChallanBase;

export function deliveryDocNos(
  batchId: string,
  gstUnits: number,
  nonGstUnits: number,
): { gstDocNo: string | null; nonGstDocNo: string | null } {
  const base = deliveryChallanBase(batchId);
  return {
    gstDocNo: gstUnits > 0 ? `${base}-GST` : null,
    nonGstDocNo: nonGstUnits > 0 ? `${base}-BOS` : null,
  };
}

export function deliveryDocLabel(kind: DeliveryDocKind): string {
  if (kind === 'gst') return 'Tax Invoice (GST)';
  if (kind === 'bos') return 'Bill of Supply (non-GST)';
  if (kind === 'mixed') return 'Mixed (GST + BoS)';
  return '';
}

/** List/search label: GST+BoS nos when present, else CH- base. */
export function deliveryChallanDisplayNo(batch: {
  batchId: string;
  deliverySet?: { gstDocNo?: string | null; nonGstDocNo?: string | null };
}): string {
  const gst = batch.deliverySet?.gstDocNo;
  const bos = batch.deliverySet?.nonGstDocNo;
  if (gst && bos) return `${gst} · ${bos}`;
  if (gst) return gst;
  if (bos) return bos;
  return deliveryChallanBase(batch.batchId);
}
