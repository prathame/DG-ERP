/** Nearest paisa — GST must not round to whole rupees (₹115.02 must not become ₹116). */
export function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}
