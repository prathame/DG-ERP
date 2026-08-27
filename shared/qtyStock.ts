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

const PACK_PLURALS: Record<string, string> = {
  box: 'Boxes',
  bottle: 'Bottles',
  bag: 'Bags',
  packet: 'Packets',
  pack: 'Packs',
  pouch: 'Pouches',
  sack: 'Sacks',
};

/** Pack / bottle word. Never "Bottlees" or "Boxs". */
export function packUnitWord(packName?: string | null, plural = false): string {
  const raw = String(packName || 'Box').trim() || 'Box';
  if (!plural) return raw;
  const key = raw.toLowerCase();
  if (key === 'kg' || key === 'g' || key === 'ml' || key === 'l' || key === 'ltr') return raw;
  const mapped = PACK_PLURALS[key];
  if (mapped) {
    const upper = raw[0] === raw[0].toUpperCase() && raw[0] !== raw[0].toLowerCase();
    return upper ? mapped : mapped.toLowerCase();
  }
  if (/s$/i.test(raw) && !/ss$/i.test(raw)) return raw;
  if (/(?:s|x|z|ch|sh)$/i.test(raw)) return `${raw}es`;
  return `${raw}s`;
}

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

/** Whole stock units. Rejects 0, negative, and non-numeric — never coerce to 1. */
export function parseStockQty(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}
