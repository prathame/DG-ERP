"use strict";
/**
 * Cloud Cap companion feature pack (non-service Online phone).
 * Service tenants keep Emergent phone IA — this pack is for manufacturer/silver/etc.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MOBILE_FEATURE_KEYS = exports.MOBILE_FEATURE_LABELS = void 0;
exports.defaultMobileFeatures = defaultMobileFeatures;
exports.normalizeMobileFeatures = normalizeMobileFeatures;
exports.mobileFeatureAllowsTab = mobileFeatureAllowsTab;
exports.MOBILE_FEATURE_LABELS = {
    stock: 'Stock / scan',
    sales: 'Simple sale / invoice',
    quotations: 'Quotations',
    collections: 'Collections / payments',
    reports: 'Light reports',
    chatbot: 'Chatbot',
};
exports.MOBILE_FEATURE_KEYS = Object.keys(exports.MOBILE_FEATURE_LABELS);
/** Default companion pack when SA enables mobile for a non-service cloud tenant. */
function defaultMobileFeatures(businessType) {
    const base = {
        stock: true,
        sales: true,
        quotations: true,
        collections: true,
        reports: true,
        chatbot: false,
    };
    if (businessType === 'silver_casting') {
        // Weigh / metal intake stays desktop — companion is stock + sales + collections
        return { ...base, quotations: false };
    }
    return base;
}
function normalizeMobileFeatures(raw, businessType) {
    const defaults = defaultMobileFeatures(businessType);
    if (!raw || typeof raw !== 'object')
        return defaults;
    const obj = raw;
    const out = { ...defaults };
    for (const key of exports.MOBILE_FEATURE_KEYS) {
        if (typeof obj[key] === 'boolean')
            out[key] = obj[key];
    }
    return out;
}
/** Map companion features → primary app tab ids for Cap Online nav filtering. */
function mobileFeatureAllowsTab(tabId, features) {
    switch (tabId) {
        case 'inventory':
            return features.stock;
        case 'sales':
        case 'invoices':
            return features.sales;
        case 'quotations':
            return features.quotations;
        case 'finance':
            return features.collections;
        case 'analytics':
        case 'accounts':
            return features.reports;
        case 'chatbot':
            return features.chatbot;
        case 'masters':
            // Light masters (customers) useful with sales — allow if any write feature on
            return features.sales || features.quotations || features.collections;
        case 'settings':
            return false;
        default:
            return false;
    }
}
