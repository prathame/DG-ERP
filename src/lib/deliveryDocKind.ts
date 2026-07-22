/** Non-service delivery-set doc kind from unit gst_applied counts (#144). */

export type DeliveryDocKind = 'gst' | 'bos' | 'mixed' | 'unknown';

export function deliveryDocKind(gstUnits: number, nonGstUnits: number): DeliveryDocKind {
  if (gstUnits > 0 && nonGstUnits > 0) return 'mixed';
  if (gstUnits > 0) return 'gst';
  if (nonGstUnits > 0) return 'bos';
  return 'unknown';
}

/** Matches getBill challanId / deliverySet -GST / -BOS suffixes. */
export function deliveryChallanBase(batchId: string): string {
  return `CH-${String(batchId).replace(/^D/, '').slice(0, 10)}`;
}

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
