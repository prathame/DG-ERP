/** Display number for a customer sale (distribution batch) on the Invoices list. */
export function saleChallanNumber(batchId: string, gstUnits = 0, nonGstUnits = 0): string {
  const rest = String(batchId || '').replace(/^D/, '');
  const challanBase = `CH-${rest}`;
  if (gstUnits > 0) return `${challanBase}-GST`;
  if (nonGstUnits > 0) return `${challanBase}-BOS`;
  return challanBase;
}
