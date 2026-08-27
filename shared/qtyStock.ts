/**
 * Bulk units keep a quantity on the product (urea bags, seed packets).
 * Piece / Nos / Box stay barcode-per-unit unless barcodeMode is none.
 */
const QTY_STOCK_UNITS = new Set([
  'bag',
  'bags',
  'kg',
  'kgs',
  'kilogram',
  'kilograms',
  'litre',
  'liter',
  'ltr',
  'litres',
  'liters',
  'packet',
  'packets',
  'pack',
  'packs',
  'pouch',
  'pouches',
  'sack',
  'sacks',
  'quintal',
  'qtl',
  'ton',
  'tonne',
  'mt',
  'gram',
  'gm',
  'grams',
  'ml',
]);

export function isQtyStockUnit(packName?: string | null): boolean {
  return QTY_STOCK_UNITS.has(
    String(packName || '')
      .trim()
      .toLowerCase(),
  );
}

/** No barcodes: barcodeMode none, or a bulk unit (Bag / Kg / Packet). */
export function usesQtyStock(packName?: string | null, barcodeMode?: string | null): boolean {
  if (
    String(barcodeMode || '')
      .trim()
      .toLowerCase() === 'none'
  ) {
    return true;
  }
  return isQtyStockUnit(packName);
}
