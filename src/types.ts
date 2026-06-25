export type Tab = 'dashboard' | 'warranty' | 'rewards' | 'replacements' | 'inventory' | 'accounts' | 'masters' | 'sales' | 'distribution' | 'finance' | 'settings';

export const USER_STORAGE_KEY = 'splendor_user';

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

export interface Transaction {
  id: string;
  date: string;
  type: 'Sales' | 'Purchase' | 'Expense';
  amount: number;
  description: string;
  status: 'Completed' | 'Pending';
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
