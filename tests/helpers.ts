import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../server/pg-db';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key-for-automated-tests';

export function createTestToken(payload: { userId: string; tenantId: string; email: string; role: string; name: string }) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' } as jwt.SignOptions);
}

export function createSuperAdminToken() {
  return jwt.sign({ userId: 'SA-TEST', email: 'test-admin@dgerp.com', name: 'Test Admin', role: 'super_admin' }, JWT_SECRET, { expiresIn: '1h', algorithm: 'HS256' } as jwt.SignOptions);
}

export async function cleanupTestData(tenantId: string) {
  const group1 = [
    'audit_log', 'tenant_invoices', 'password_reset_tokens', 'bill_settings', 
    'product_replacements', 'rewards', 'reward_rules', 'redemption_settings', 
    'warranties', 'product_sales', 'product_distribution', 'product_inventory', 
    'supplier_payments', 'vendor_payments', 'vendor_reminder_settings'
  ];
  const group2 = ['customers', 'vendors', 'users', 'products'];
  
  try {
    // Delete child rows concurrently
    await Promise.all(group1.map(t => pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenantId]).catch(() => {})));
    // Delete parent master rows concurrently
    await Promise.all(group2.map(t => pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenantId]).catch(() => {})));
    // Delete the tenant root row
    await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]).catch(() => {});
  } catch (err) {
    console.error('[Cleanup Error]', err);
  }
}

export { pool };
