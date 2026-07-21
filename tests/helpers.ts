import express from 'express';
import jwt from 'jsonwebtoken';
import { pool } from '../server/pg-db';

function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET is required for tests');
  return secret;
}

export function createTestToken(payload: {
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  name: string;
}) {
  return jwt.sign(payload, requireJwtSecret(), { expiresIn: '1h', algorithm: 'HS256' } as jwt.SignOptions);
}

export function createSuperAdminToken() {
  return jwt.sign(
    { userId: 'SA-TEST', email: 'test-admin@dgerp.com', name: 'Test Admin', role: 'super_admin' },
    requireJwtSecret(),
    { expiresIn: '1h', algorithm: 'HS256' } as jwt.SignOptions,
  );
}

export async function cleanupTestData(tenantId: string) {
  const tables = [
    'audit_log',
    'tenant_invoices',
    'password_reset_tokens',
    'bill_settings',
    'credit_debit_notes',
    'product_replacements',
    'rewards',
    'reward_rules',
    'redemption_settings',
    'warranties',
    'product_sales',
    'product_distribution',
    'product_inventory',
    'product_purchases',
    'supplier_payments',
    'suppliers',
    'products',
    'vendor_payments',
    'vendor_reminder_settings',
    'price_lists',
    'customers',
    'vendors',
    'users',
    'quotations',
    'orders',
    'banks',
    'expenses',
    'staff_members',
    'staff_payments',
    // payments before invoices — FK ON DELETE RESTRICT
    'invoice_payments',
    'standalone_invoices',
    'tenant_notifications',
    'service_cloud_device_slots',
    'service_cloud_sessions',
    'user_sessions',
  ];
  for (const t of tables) {
    await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]).catch(() => {});
}

export { pool };
