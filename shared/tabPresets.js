"use strict";
/** Single source of truth for business-type tab presets (cloud + on-prem + SA UI). */
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUSTOM_TAB_PRESET = exports.TAB_PRESETS = exports.BUSINESS_TYPES_WITH_CUSTOM = exports.NAMED_BUSINESS_TYPES = void 0;
exports.getTabPreset = getTabPreset;
exports.isNamedBusinessType = isNamedBusinessType;
exports.isBusinessTypeWithCustom = isBusinessTypeWithCustom;
exports.NAMED_BUSINESS_TYPES = ['manufacturer', 'dealer', 'retail', 'service', 'silver_casting'];
exports.BUSINESS_TYPES_WITH_CUSTOM = [...exports.NAMED_BUSINESS_TYPES, 'custom'];
const baseAllVisible = (overrides = {}) => ({
    analytics: { label: 'Analytics', visible: true },
    masters: { label: 'Masters', visible: true },
    inventory: { label: 'Inventory', visible: true },
    distribution: { label: 'Dispatch', visible: true },
    sales: { label: 'Warranty Registration', visible: true },
    purchases: { label: 'Purchases', visible: true },
    verification: { label: 'Search / Verify', visible: true },
    quotations: { label: 'Quotes & Orders', visible: true },
    invoices: { label: 'Invoices', visible: true },
    finance: { label: 'Vendor Payments', visible: true },
    accounts: { label: 'Accounts', visible: true },
    warranty: { label: 'Warranty', visible: true },
    replacements: { label: 'Replacements', visible: true },
    rewards: { label: 'Rewards', visible: true },
    chatbot: { label: 'Chatbot', visible: true },
    settings: { label: 'Settings', visible: true },
    ...overrides,
});
exports.TAB_PRESETS = {
    manufacturer: baseAllVisible(),
    dealer: baseAllVisible({
        distribution: { label: 'Sales', visible: true },
        sales: { label: 'Sales Entry', visible: false },
        finance: { label: 'Dealer Payments', visible: true },
        warranty: { label: 'Warranty', visible: false },
        replacements: { label: 'Replacements', visible: false },
        rewards: { label: 'Rewards', visible: false },
    }),
    retail: baseAllVisible({
        inventory: { label: 'Stock', visible: true },
        distribution: { label: 'Purchase', visible: true },
        sales: { label: 'Sales Entry', visible: false },
        finance: { label: 'Supplier Payments', visible: true },
        warranty: { label: 'Warranty', visible: false },
        replacements: { label: 'Replacements', visible: false },
        rewards: { label: 'Rewards', visible: false },
    }),
    service: baseAllVisible({
        inventory: { label: 'Inventory', visible: false },
        distribution: { label: 'Distribution', visible: false },
        sales: { label: 'Sales Entry', visible: false },
        purchases: { label: 'Expenses', visible: true },
        verification: { label: 'Search / Verify', visible: false },
        finance: { label: 'Invoice Finance', visible: true },
        warranty: { label: 'Warranty', visible: false },
        replacements: { label: 'Replacements', visible: false },
        rewards: { label: 'Rewards', visible: false },
    }),
    silver_casting: baseAllVisible({
        inventory: { label: 'Metal Stock', visible: true },
        distribution: { label: 'Sales', visible: true },
        sales: { label: 'Counter Sale', visible: true },
        finance: { label: 'Party Payments', visible: true },
        warranty: { label: 'Warranty', visible: false },
        replacements: { label: 'Replacements', visible: false },
        rewards: { label: 'Rewards', visible: false },
    }),
};
/** Custom: all tabs visible — Super Admin configures manually after create */
exports.CUSTOM_TAB_PRESET = baseAllVisible({
    distribution: { label: 'Distribution', visible: true },
    sales: { label: 'Sales Entry', visible: true },
    finance: { label: 'Finance', visible: true },
});
function cloneTabConfig(src) {
    return Object.fromEntries(Object.entries(src).map(([key, value]) => [key, { label: value.label, visible: value.visible }]));
}
function getTabPreset(businessType) {
    if (businessType === 'custom')
        return cloneTabConfig(exports.CUSTOM_TAB_PRESET);
    if (businessType && businessType in exports.TAB_PRESETS) {
        return cloneTabConfig(exports.TAB_PRESETS[businessType]);
    }
    return cloneTabConfig(exports.TAB_PRESETS.manufacturer);
}
function isNamedBusinessType(value) {
    return typeof value === 'string' && exports.NAMED_BUSINESS_TYPES.includes(value);
}
function isBusinessTypeWithCustom(value) {
    return typeof value === 'string' && exports.BUSINESS_TYPES_WITH_CUSTOM.includes(value);
}
