/** CH-… base from a distribution batch id (full remainder after D — not a 10-digit slice). */
export function saleChallanBase(batchId: string): string {
  return `CH-${String(batchId || '').replace(/^D/, '')}`;
}

/** Display number for a customer sale (distribution batch) on the Invoices list. */
export function saleChallanNumber(batchId: string, gstUnits = 0, nonGstUnits = 0): string {
  const challanBase = saleChallanBase(batchId);
  if (gstUnits > 0) return `${challanBase}-GST`;
  if (nonGstUnits > 0) return `${challanBase}-BOS`;
  return challanBase;
}
