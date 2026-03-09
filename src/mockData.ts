import { Product, Warranty, Transaction, RewardPoint } from './types';

export const MOCK_PRODUCTS: Product[] = [
  { id: '1', name: 'Splendor Submersible Pump 5HP', serialNumber: 'SP-5HP-001', category: 'Submersible', warrantyMonths: 24, price: 12500, stock: 45 },
  { id: '2', name: 'Splendor Monoblock Pump 2HP', serialNumber: 'SP-2HP-042', category: 'Monoblock', warrantyMonths: 12, price: 8500, stock: 120 },
  { id: '3', name: 'Splendor Openwell Pump 3HP', serialNumber: 'SP-3HP-089', category: 'Openwell', warrantyMonths: 18, price: 10200, stock: 30 },
];

export const MOCK_WARRANTIES: Warranty[] = [
  { id: 'W1', productId: '1', customerName: 'Rajesh Kumar', customerPhone: '9876543210', activationDate: '2023-10-15', expiryDate: '2025-10-15', status: 'Active' },
  { id: 'W2', productId: '2', customerName: 'Amit Shah', customerPhone: '9123456789', activationDate: '2024-01-20', expiryDate: '2025-01-20', status: 'Active' },
  { id: 'W3', productId: '3', customerName: 'Suresh Raina', customerPhone: '9988776655', activationDate: '2022-05-10', expiryDate: '2023-11-10', status: 'Expired' },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 'T1', date: '2024-03-01', type: 'Sales', amount: 25000, description: 'Bulk Sale to Dealer A', status: 'Completed' },
  { id: 'T2', date: '2024-03-02', type: 'Purchase', amount: 15000, description: 'Raw Material - Copper Wire', status: 'Completed' },
  { id: 'T3', date: '2024-03-03', type: 'Expense', amount: 2000, description: 'Electricity Bill', status: 'Completed' },
  { id: 'T4', date: '2024-03-04', type: 'Sales', amount: 12000, description: 'Direct Customer Sale', status: 'Pending' },
];

export const MOCK_REWARDS: RewardPoint[] = [
  { id: 'R1', userId: 'D1', points: 500, type: 'Earned', description: 'Target Achievement Bonus', date: '2024-03-01' },
  { id: 'R2', userId: 'D1', points: 100, type: 'Redeemed', description: 'Gift Voucher Redemption', date: '2024-03-05' },
];
