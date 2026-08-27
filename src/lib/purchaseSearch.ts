/** True when a supplier card should stay visible for the Purchases search box. */
export function supplierMatchesPurchaseSearch(
  supplierName: string,
  batches: Array<{ invoiceNumber?: string | null; productNames?: string[] }>,
  searchText: string,
): boolean {
  const q = searchText.trim().toLowerCase();
  if (!q) return true;
  if (supplierName.toLowerCase().includes(q)) return true;
  return batches.some(
    b =>
      (b.invoiceNumber || '').toLowerCase().includes(q) ||
      (b.productNames || []).some(n => n.toLowerCase().includes(q)),
  );
}
