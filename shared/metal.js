"use strict";
/** Metal weight helpers — purity is parts-per-thousand (e.g. 925 = 92.5%). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.computeFineWeight = computeFineWeight;
exports.computeMakingAmount = computeMakingAmount;
exports.computeMetalSalePrice = computeMetalSalePrice;
function computeFineWeight(netWeight, purity) {
    if (!Number.isFinite(netWeight) || !Number.isFinite(purity) || netWeight < 0 || purity < 0)
        return 0;
    return Math.round(((netWeight * purity) / 1000) * 1000) / 1000;
}
function computeMakingAmount(netWeight, makingRate) {
    if (!Number.isFinite(netWeight) || !Number.isFinite(makingRate) || netWeight < 0 || makingRate < 0)
        return 0;
    return Math.round(netWeight * makingRate * 100) / 100;
}
/** Suggested sale = (net × metalRate) + makingAmount */
function computeMetalSalePrice(netWeight, metalRate, makingAmount = 0) {
    if (!Number.isFinite(netWeight) || !Number.isFinite(metalRate))
        return 0;
    const base = netWeight * metalRate + (Number.isFinite(makingAmount) ? makingAmount : 0);
    return Math.round(base * 100) / 100;
}
