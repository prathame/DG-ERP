/**
 * Map English businessTypeConfig label strings → i18n keys.
 * Config stays English for code/defaults; UI translates at render time.
 */
const LABEL_KEYS: Record<string, string> = {
  Vendors: 'business.vendors',
  Customers: 'business.customers',
  Clients: 'business.clients',
  Parties: 'business.parties',
  Dispatch: 'business.dispatch',
  Sales: 'business.sales',
  'Vendor Payments': 'business.vendorPayments',
  'Dealer Payments': 'business.dealerPayments',
  'Invoice Finance': 'business.invoiceFinance',
  'Party Payments': 'business.partyPayments',
  'Purchase Cost': 'business.purchaseCost',
  'Material / Purchase Cost': 'business.materialPurchaseCost',
  'Metal / Purchase Cost': 'business.metalPurchaseCost',
  'Distribution Revenue': 'business.distributionRevenue',
  'Sales Revenue': 'business.salesRevenue',
  'Invoice Revenue': 'business.invoiceRevenue',
  'Food & Stay Revenue': 'business.foodStayRevenue',
  Outstanding: 'business.outstanding',
  'Unpaid Invoices': 'business.unpaidInvoices',
  Collected: 'business.collected',
  Received: 'business.received',
  Revenue: 'business.revenue',
  'Distribution Register': 'business.distributionRegister',
  'Sales Register': 'business.salesRegister',
};

export function tb(label: string, t: (key: string) => string): string {
  const key = LABEL_KEYS[label];
  return key ? t(key) : label;
}
