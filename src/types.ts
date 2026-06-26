export type Tab = 'dashboard' | 'warranty' | 'rewards' | 'replacements' | 'inventory' | 'sales' | 'distribution' | 'finance' | 'verification' | 'settings';

export const USER_STORAGE_KEY = 'dg_erp_user';

export interface Product {
  id: string;
  name: string;
  barcode?: string | null;
  description?: string | null;
  rewardPointsValue?: number;
  manufacturingDate?: string | null;
  batchNumber?: string | null;
  status?: 'Active' | 'Sold' | 'Returned';
  warrantyMonths: number;
  price: number;
  hsnCode?: string | null;
  gstRate?: number;
  stock: number;
  totalInventory?: number;
  remainingInventory?: number;
  soldCount?: number;
  withVendors?: number;
  warrantyApplicable?: boolean;
  barcodeRange?: { first: string; last: string } | null;
}

export interface Warranty {
  id: string;
  productId: string;
  productName?: string | null;
  barcode?: string;
  replacedBarcode?: string | null;
  customerName: string;
  customerPhone: string;
  activationDate: string;
  expiryDate: string;
  status: 'Active' | 'Expired' | 'Under Claim';
}

export interface RewardPoint {
  id: string;
  userId: string;
  points: number;
  type: 'Earned' | 'Redeemed';
  description: string;
  date: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  vendorId?: string | null;
}

export interface Vendor {
  id: string;
  name: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  address?: string;
  totalSales?: number;
  totalRewardPoints?: number;
}

export interface Bank {
  id: string;
  name: string;
  accountNumber?: string;
  bankName?: string;
  branch?: string;
  ifscCode?: string;
}

export interface SuperAdminUser {
  id: string;
  email: string;
  name: string;
  role: 'super_admin';
}

export interface Tenant {
  id: string;
  companyName: string;
  slug: string;
  adminEmail: string;
  adminName: string;
  phone?: string;
  status: string;
  planName?: string;
  planId?: string;
  userCount?: number;
  productCount?: number;
  vendorCount?: number;
  saleCount?: number;
  revenue?: number;
  createdAt?: string;
}

export interface Plan {
  id: string;
  name: string;
  maxProducts: number;
  maxVendors: number;
  maxUsers: number;
  maxBarcodes: number;
  features: Record<string, boolean>;
  priceMonthly: number;
  priceYearly: number;
  isActive: boolean;
  tenantCount?: number;
}

export interface BillSettings {
  logoBase64: string | null;
  primaryColor: string;
  tagline: string | null;
  invoicePrefix: string | null;
  challanPrefix: string | null;
  bankAccountName: string | null;
  bankAccountNumber: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankIfsc: string | null;
  bankUpiId: string | null;
  termsAndConditions: string | null;
  signatoryName: string | null;
  signatoryDesignation: string | null;
  signatureBase64: string | null;
  showRewards: boolean;
  showBarcode: boolean;
  showWarranty: boolean;
  footerText: string;
}
