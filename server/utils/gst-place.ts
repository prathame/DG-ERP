/** First two chars of GSTIN are the state code (e.g. 27 = Maharashtra). */
export function gstinStateCode(gstin: string | null | undefined): string | null {
  if (!gstin || typeof gstin !== 'string') return null;
  const g = gstin.trim().toUpperCase();
  if (g.length < 2) return null;
  return g.slice(0, 2);
}

/** Interstate when both state codes present and differ. Missing buyer GSTIN → treat as intra. */
export function isInterstateSupply(
  sellerGstin: string | null | undefined,
  buyerGstin: string | null | undefined,
): boolean {
  const from = gstinStateCode(sellerGstin);
  const to = gstinStateCode(buyerGstin);
  if (!from || !to) return false;
  return from !== to;
}

/** Split tax total into CGST/SGST or IGST. */
export function splitGstTax(
  taxTotal: number,
  interstate: boolean,
): { taxCgst: number; taxSgst: number; taxIgst: number } {
  const t = Math.round((taxTotal || 0) * 100) / 100;
  if (interstate) return { taxCgst: 0, taxSgst: 0, taxIgst: t };
  const half = Math.round((t / 2) * 100) / 100;
  return { taxCgst: half, taxSgst: Math.round((t - half) * 100) / 100, taxIgst: 0 };
}
