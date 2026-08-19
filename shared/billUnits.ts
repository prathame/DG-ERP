/** Bill sale units — configured only in Bill Settings; bill lines use the first unit. */

export const BILL_UNIT_PRESETS = ['Piece', 'Kg', 'Meter', 'Cm', 'Inch'] as const;

/** New / empty tenant list. Electrical default; plywood adds Inch or Cm in Settings. */
export const DEFAULT_BILL_UNITS = ['Piece'] as const;

export const DEFAULT_BILL_UNIT = 'Piece';

const MAX_UNITS = 40;
const MAX_UNIT_LEN = 24;

/** Normalize tenant bill-settings unit list; always returns at least defaults. */
export function normalizeBillUnits(raw: unknown): string[] {
  const fromArr = Array.isArray(raw)
    ? raw
    : typeof raw === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
          } catch {
            return [];
          }
        })()
      : [];

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of fromArr) {
    const label = String(item ?? '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, MAX_UNIT_LEN);
    if (!label) continue;
    const key = label.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
    if (out.length >= MAX_UNITS) break;
  }
  return out.length > 0 ? out : [...DEFAULT_BILL_UNITS];
}

export function defaultBillUnit(units?: string[] | null): string {
  const list = units && units.length > 0 ? units : [...DEFAULT_BILL_UNITS];
  return list[0] || DEFAULT_BILL_UNIT;
}

/** Prefer stored line unit; fall back to tenant default / Piece. */
export function normalizeLineUnit(raw: unknown, fallback: string = DEFAULT_BILL_UNIT): string {
  const label = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, MAX_UNIT_LEN);
  return label || fallback || DEFAULT_BILL_UNIT;
}

/** Allow fractional qty (kg / m); reject non-positive unless fallback is 0 (UI empty while typing). */
export function parseBillQty(raw: unknown, fallback = 1): number {
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw ?? '').replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0) {
    if (fallback > 0) return Math.round(fallback * 1000) / 1000;
    return 0;
  }
  return Math.round(n * 1000) / 1000;
}

export function formatBillQty(qty: number): string {
  if (!Number.isFinite(qty)) return '0';
  const rounded = Math.round(qty * 1000) / 1000;
  if (Number.isInteger(rounded)) return String(rounded);
  return String(rounded);
}

/** GST e-invoice / e-way UQC codes. */
export function billUnitToGstUqc(unit: unknown): string {
  const u = String(unit ?? '')
    .trim()
    .toLowerCase();
  if (!u) return 'NOS';
  if (u === 'piece' || u === 'pcs' || u === 'pc' || u === 'nos' || u === 'no' || u === 'each') return 'NOS';
  if (u === 'kg' || u === 'kgs' || u === 'kilogram' || u === 'kilograms') return 'KGS';
  if (u === 'g' || u === 'gm' || u === 'gram' || u === 'grams') return 'GMS';
  if (u === 'meter' || u === 'metre' || u === 'm' || u === 'meters' || u === 'metres') return 'MTR';
  if (u === 'cm' || u === 'centimeter' || u === 'centimetre' || u === 'centimeters') return 'CMS';
  if (u === 'inch' || u === 'inches' || u === 'in') return 'INC';
  if (u === 'box' || u === 'boxes') return 'BOX';
  if (u === 'dozen' || u === 'doz') return 'DOZ';
  if (u === 'liter' || u === 'litre' || u === 'l' || u === 'ltr') return 'LTR';
  if (u === 'ml' || u === 'milliliter' || u === 'millilitre') return 'MLT';
  return 'OTH';
}
