import { session } from './session';

export type BusinessType = 'manufacturer' | 'dealer' | 'retail' | 'service';

export interface BusinessConfig {
  type: BusinessType;

  // Labels
  labels: {
    vendors: string;        // 'Vendors' | 'Customers' | 'Clients'
    distribution: string;   // 'Dispatch' | 'Sales' | 'Purchase'
    finance: string;        // 'Vendor Payments' | 'Dealer Payments' | 'Invoice Finance'
    purchaseCost: string;   // 'Purchase Cost' | 'Material / Purchase Cost'
    distributionRevenue: string; // 'Distribution Revenue' | 'Sales Revenue'
  };

  // Feature flags — what this type uses
  features: {
    inventory: boolean;
    distribution: boolean;    // product dispatch to vendors
    barcodes: boolean;
    warranty: boolean;
    rewards: boolean;
    customerTracking: boolean; // separate customer master
    eWayBill: boolean;
    gstSplit: boolean;
    vendorFinance: boolean;    // distribution-based payment tracking
    invoiceFinance: boolean;   // invoice-based payment tracking
  };

  // Finance tab variant
  financeView: 'vendor' | 'invoice';

  // Analytics money tiles
  analytics: {
    showDispatched: boolean;
    outstandingLabel: string;
    outstandingKey: 'outstanding' | 'invoiceOutstanding';
    collectionsLabel: string;
    revenueLabel: string;
  };

  // Accounts reports to hide
  accounts: {
    hideTabs: string[];  // tab keys to hide
    distributionRegisterLabel: string;
  };
}

const CONFIGS: Record<BusinessType, BusinessConfig> = {
  manufacturer: {
    type: 'manufacturer',
    labels: {
      vendors: 'Vendors',
      distribution: 'Dispatch',
      finance: 'Vendor Payments',
      purchaseCost: 'Purchase Cost',
      distributionRevenue: 'Distribution Revenue',
    },
    features: {
      inventory: true, distribution: true, barcodes: true,
      warranty: true, rewards: true, customerTracking: true,
      eWayBill: true, gstSplit: true, vendorFinance: true, invoiceFinance: false,
    },
    financeView: 'vendor',
    analytics: {
      showDispatched: true,
      outstandingLabel: 'Outstanding',
      outstandingKey: 'outstanding',
      collectionsLabel: 'Collected',
      revenueLabel: 'Sales',
    },
    accounts: {
      hideTabs: [],
      distributionRegisterLabel: 'Distribution Register',
    },
  },

  dealer: {
    type: 'dealer',
    labels: {
      vendors: 'Customers',
      distribution: 'Sales',
      finance: 'Dealer Payments',
      purchaseCost: 'Purchase Cost',
      distributionRevenue: 'Sales Revenue',
    },
    features: {
      inventory: true, distribution: true, barcodes: true,
      warranty: false, rewards: false, customerTracking: false,
      eWayBill: true, gstSplit: true, vendorFinance: true, invoiceFinance: false,
    },
    financeView: 'vendor',
    analytics: {
      showDispatched: true,
      outstandingLabel: 'Outstanding',
      outstandingKey: 'outstanding',
      collectionsLabel: 'Collected',
      revenueLabel: 'Sales',
    },
    accounts: {
      hideTabs: [],
      distributionRegisterLabel: 'Sales Register',
    },
  },

  retail: {
    type: 'retail',
    labels: {
      vendors: 'Customers',
      distribution: 'Purchase',
      finance: 'Supplier Payments',
      purchaseCost: 'Purchase Cost',
      distributionRevenue: 'Sales Revenue',
    },
    features: {
      inventory: true, distribution: true, barcodes: true,
      warranty: false, rewards: false, customerTracking: false,
      eWayBill: false, gstSplit: true, vendorFinance: true, invoiceFinance: false,
    },
    financeView: 'vendor',
    analytics: {
      showDispatched: true,
      outstandingLabel: 'Outstanding',
      outstandingKey: 'outstanding',
      collectionsLabel: 'Collected',
      revenueLabel: 'Sales',
    },
    accounts: {
      hideTabs: [],
      distributionRegisterLabel: 'Sales Register',
    },
  },

  service: {
    type: 'service',
    labels: {
      vendors: 'Clients',
      distribution: 'Distribution',
      finance: 'Invoice Finance',
      purchaseCost: 'Material / Purchase Cost',
      distributionRevenue: 'Invoice Revenue',
    },
    features: {
      inventory: false, distribution: false, barcodes: false,
      warranty: false, rewards: false, customerTracking: true,
      eWayBill: false, gstSplit: true, vendorFinance: false, invoiceFinance: true,
    },
    financeView: 'invoice',
    analytics: {
      showDispatched: false,
      outstandingLabel: 'Unpaid Invoices',
      outstandingKey: 'invoiceOutstanding',
      collectionsLabel: 'Received',
      revenueLabel: 'Invoice Revenue',
    },
    accounts: {
      hideTabs: ['sales', 'distribution', 'stock'],
      distributionRegisterLabel: 'Distribution Register',
    },
  },
};

/** Read business type config from session — sync, zero API calls */
export function getBusinessConfig(): BusinessConfig {
  try {
    const user = session.getUser() as Record<string, unknown> | null;
    const type = (user?.businessType as BusinessType) || 'manufacturer';
    return CONFIGS[type] ?? CONFIGS.manufacturer;
  } catch {
    return CONFIGS.manufacturer;
  }
}

/** Hook-style alias — same thing, for use inside components */
export const useBusinessConfig = getBusinessConfig;
