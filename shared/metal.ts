/** Metal weight helpers — purity is parts-per-thousand (e.g. 925 = 92.5%). */

export function computeFineWeight(netWeight: number, purity: number): number {
  if (!Number.isFinite(netWeight) || !Number.isFinite(purity) || netWeight < 0 || purity < 0) return 0;
  return Math.round(((netWeight * purity) / 1000) * 1000) / 1000;
}

export function computeMakingAmount(netWeight: number, makingRate: number): number {
  if (!Number.isFinite(netWeight) || !Number.isFinite(makingRate) || netWeight < 0 || makingRate < 0) return 0;
  return Math.round(netWeight * makingRate * 100) / 100;
}

/** Suggested sale = (net × metalRate) + makingAmount */
export function computeMetalSalePrice(netWeight: number, metalRate: number, makingAmount = 0): number {
  if (!Number.isFinite(netWeight) || !Number.isFinite(metalRate)) return 0;
  const base = netWeight * metalRate + (Number.isFinite(makingAmount) ? makingAmount : 0);
  return Math.round(base * 100) / 100;
}
