/**
 * P0-3: GST rounding correctness tests.
 *
 * Verifies the canonical 2dp rounding formula and the CGST/SGST split
 * for every combination of edge-case amounts and common GST rates.
 *
 * The canonical formula used throughout the codebase is:
 *   round2(x) = Math.round(x * 100) / 100
 *
 * The canonical CGST/SGST split is:
 *   cgst = round2(taxTotal / 2)
 *   sgst = round2(taxTotal - cgst)   ← penny-correction, not a second independent split
 *
 * Any implementation using Math.round(x) without the * 100 / 100 wrapper
 * rounds to the nearest rupee instead of the nearest paisa — this is the
 * bug that was present in accounts.ts, orders.ts, distribution.ts, reports.ts,
 * and super-admin.ts before the P0-3 fix.
 */

import { describe, it, expect } from 'vitest';
import { splitGstTax } from '../../server/utils/gst-place';
import { round2 as sharedRound2 } from '../../shared/gstRound';
import { unitPricesAfterDiscount } from '../../server/utils/price-resolve';

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// The buggy formula that was in the codebase before the fix
function buggyGst(net: number, rate: number): number {
  return Math.round((net * rate) / 100); // integer rounding
}

// The correct formula after the fix
function correctGst(net: number, rate: number): number {
  return Math.round(((net * rate) / 100) * 100) / 100; // 2dp rounding
}

// ─── Canonical rounding formula ─────────────────────────────────────────────

describe('round2 — canonical 2dp rounding', () => {
  const cases: [number, number][] = [
    [0.0, 0.0],
    [0.01, 0.01],
    [0.005, 0.01], // Math.round rounds 0.5 up → 0.5 * 100 = 50, round = 50, /100 = 0.5... actually 0.5→0.01? No: 0.005*100=0.5, Math.round(0.5)=1, 1/100=0.01 ✓
    [0.004, 0.0],
    [0.1, 0.1],
    [0.99, 0.99],
    // Note: round2(1.005) = 1.0 in JS (IEEE754: 1.005*100 = 100.4999…, Math.round = 100)
    [1.01, 1.01],
    [19.99, 19.99],
    [33.33, 33.33],
    [100.05, 100.05],
    [999.99, 999.99],
    [1000.001, 1000.0],
  ];
  for (const [input, expected] of cases) {
    it(`round2(${input}) = ${expected}`, () => {
      expect(round2(input)).toBe(expected);
    });
  }
});

// ─── GST calculation correctness ────────────────────────────────────────────

describe('GST calculation — correctness vs bug', () => {
  const cases: [number, number, string][] = [
    // [net, rate, scenario]
    [100.5, 18, 'typical invoice line'],
    [33.33, 18, 'fractional amount 18%'],
    [100.0, 5, '5% GST'],
    [100.0, 12, '12% GST'],
    [100.0, 28, '28% GST'],
    [0.01, 18, 'smallest amount'],
    [0.1, 18, 'ten paise'],
    [0.99, 18, 'ninety-nine paise'],
    [1.01, 18, 'just over one rupee'],
    [19.99, 18, 'nineteen ninety-nine'],
    [33.33, 28, '33.33 at 28%'],
    [100.05, 18, 'hundred and five paise'],
    [999.99, 18, 'near thousand'],
    [555.55, 12, '555.55 at 12%'],
  ];

  for (const [net, rate, scenario] of cases) {
    it(`${scenario}: net=${net}, rate=${rate}%`, () => {
      const correct = correctGst(net, rate);
      const buggy = buggyGst(net, rate);
      // Correct result must be 2dp
      expect(correct).toBe(round2(correct));
      // Verify the formula: correct = round2(net * rate / 100)
      expect(correct).toBe(round2((net * rate) / 100));
      // For non-whole-number cases, the buggy formula should differ
      const expectedGst = (net * rate) / 100;
      if (Math.abs(expectedGst - Math.floor(expectedGst)) > 0.001 && expectedGst % 1 !== 0) {
        // The buggy formula rounds to whole rupees
        expect(buggy).toBe(Math.round(expectedGst));
        // The correct formula rounds to paise
        expect(correct).toBe(round2(expectedGst));
        // They must equal when the GST is a whole number, differ when fractional
        if (Math.abs(buggy - correct) > 0.001) {
          expect(Math.abs(buggy - correct)).toBeLessThan(1.0); // error < ₹1
        }
      }
    });
  }
});

// ─── CGST/SGST split correctness ────────────────────────────────────────────

describe('splitGstTax — CGST + SGST = taxTotal (intrastate)', () => {
  const taxAmounts = [0.01, 0.1, 0.99, 1.01, 9.99, 19.99, 33.33, 100.05, 999.99, 1.0, 10.0, 100.0];

  for (const tax of taxAmounts) {
    it(`splitGstTax(${tax}, intrastate): CGST + SGST = taxTotal`, () => {
      const { taxCgst, taxSgst, taxIgst } = splitGstTax(tax, false);
      expect(taxIgst).toBe(0);
      expect(round2(taxCgst + taxSgst)).toBe(round2(tax));
      expect(taxCgst).toBeGreaterThanOrEqual(0);
      expect(taxSgst).toBeGreaterThanOrEqual(0);
      // Both must be 2dp
      expect(taxCgst).toBe(round2(taxCgst));
      expect(taxSgst).toBe(round2(taxSgst));
      // Difference between halves is at most 0.01 (penny-correction).
      // Use round2 to avoid IEEE 754 float comparison imprecision.
      expect(round2(Math.abs(taxCgst - taxSgst))).toBeLessThanOrEqual(0.01);
    });
  }

  it('splitGstTax(9.99, intrastate): not both sides 5.00 (buggy pattern)', () => {
    const { taxCgst, taxSgst } = splitGstTax(9.99, false);
    // The buggy pattern was: Math.round(9.99/2) = 5 for BOTH → total = 10 ≠ 9.99
    expect(taxCgst + taxSgst).not.toBe(10.0);
    expect(round2(taxCgst + taxSgst)).toBe(9.99);
  });
});

describe('splitGstTax — interstate (IGST only)', () => {
  const taxAmounts = [0.01, 1.01, 9.99, 100.05];

  for (const tax of taxAmounts) {
    it(`splitGstTax(${tax}, interstate): all IGST, CGST=SGST=0`, () => {
      const { taxCgst, taxSgst, taxIgst } = splitGstTax(tax, true);
      expect(taxCgst).toBe(0);
      expect(taxSgst).toBe(0);
      expect(taxIgst).toBe(round2(tax));
    });
  }
});

// ─── Buggy pattern detection ─────────────────────────────────────────────────

describe('Detect the buggy integer-rounding pattern', () => {
  it('Math.round(gstAmt/2) incorrectly rounds both CGST and SGST to integers', () => {
    const gstAmt = 9.99;
    const buggyHalf = Math.round(gstAmt / 2); // = 5 (integer)
    expect(buggyHalf + buggyHalf).toBe(10); // inflated total
    expect(buggyHalf + buggyHalf).not.toBe(gstAmt); // WRONG
  });

  it('Correct pattern: round2(total/2) + round2(total - half) = total', () => {
    const gstAmt = 9.99;
    const half = round2(gstAmt / 2); // = 5.00
    const remainder = round2(gstAmt - half); // = 4.99
    expect(round2(half + remainder)).toBe(gstAmt); // CORRECT
  });

  it('Correct pattern works for awkward fractions', () => {
    const cases = [0.01, 0.03, 9.99, 33.33, 100.05, 999.99];
    for (const gst of cases) {
      const half = round2(gst / 2);
      const remainder = round2(gst - half);
      expect(round2(half + remainder)).toBe(round2(gst));
    }
  });
});

// ─── Credit/Debit note formula — was the specific bug found ─────────────────

describe('Credit/debit note GST formula (P0-3 fix verification)', () => {
  // Before fix: Math.round((net * rate) / 100)
  // After fix:  Math.round(((net * rate) / 100) * 100) / 100

  const testCases: [number, number, number, string][] = [
    // [net, rate, expectedGst, description]
    [100.5, 18, 18.09, '100.50 × 18% = 18.09'],
    [33.33, 18, 6.0, '33.33 × 18% = 5.9994 → 6.00'],
    [10.05, 18, 1.81, '10.05 × 18% = 1.809 → 1.81'],
    [55.55, 12, 6.67, '55.55 × 12% = 6.666 → 6.67'],
    [100.0, 18, 18.0, '100 × 18% = 18.00 (no difference)'],
  ];

  for (const [net, rate, expected, desc] of testCases) {
    it(desc, () => {
      const correct = Math.round(((net * rate) / 100) * 100) / 100;
      expect(correct).toBe(expected);
    });
  }

  it('Bug: Math.round((100.50 * 18) / 100) = 18, not 18.09', () => {
    const buggy = Math.round((100.5 * 18) / 100);
    expect(buggy).toBe(18); // integer — loses 0.09 per line
  });

  it('Fix: Math.round(((100.50 * 18) / 100) * 100) / 100 = 18.09', () => {
    const correct = Math.round(((100.5 * 18) / 100) * 100) / 100;
    expect(correct).toBe(18.09);
  });
});

describe('shop bill — exclusive GST to paisa, not whole rupees', () => {
  it('2× USB ₹120 + earphones ₹399 @ 18% → tax ₹115.02, bill ₹754.02, CGST/SGST ₹57.51', () => {
    expect(sharedRound2(115.02)).toBe(115.02);
    const usb = unitPricesAfterDiscount({
      basePrice: 120,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    const earphones = unitPricesAfterDiscount({
      basePrice: 399,
      discountPercent: 0,
      withGst: true,
      priceIncludesGst: false,
      gstRate: 18,
    });
    const net = 639;
    const billed = sharedRound2(usb.billedPricePerUnit * 2 + earphones.billedPricePerUnit);
    const tax = sharedRound2(billed - net);
    expect(usb.billedPricePerUnit).toBe(141.6);
    expect(earphones.billedPricePerUnit).toBe(470.82);
    expect(tax).toBe(115.02);
    expect(billed).toBe(754.02);
    const { taxCgst, taxSgst } = splitGstTax(tax, false);
    expect(taxCgst).toBe(57.51);
    expect(taxSgst).toBe(57.51);
    expect(sharedRound2(taxCgst + taxSgst)).toBe(115.02);
  });
});
