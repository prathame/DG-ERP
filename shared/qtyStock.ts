/**
 * Bulk units keep a quantity on the product (urea bags, seed packets, boxes of bottles).
 * Piece / Nos stay barcode-per-unit unless barcodeMode is none.
 */
const QTY_STOCK_UNITS = new Set([
  'bag',
  'bags',
  'box',
  'boxes',
  'bottle',
  'bottles',
  'kg',
  'kgs',
  'kilogram',
  'kilograms',
  'litre',
  'liter',
  'ltr',
  'l',
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
  'g',
  'grams',
  'ml',
]);

/** Inventory column label: Bag stays Bag, Piece/Nos stay pcs. */
export function stockUnitLabel(packName?: string | null): string {
  const n = String(packName || '').trim();
  if (!n) return 'pcs';
  const key = n.toLowerCase();
  if (key === 'piece' || key === 'pieces' || key === 'nos' || key === 'no') return 'pcs';
  return n;
}

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
