export interface Product {
  id: string;
  name: string;
  serialNumber: string;
  category: string;
  warrantyMonths: number;
  price: number;
  stock: number;
}

export interface Warranty {
  id: string;
  productId: string;
  serialNumber?: string;
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
