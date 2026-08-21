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
    'barcode_label_templates',
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
    'whatsapp_broadcasts',
    'whatsapp_web_sessions',
    'service_cloud_device_slots',
    'service_cloud_sessions',
    'user_sessions',
    'book_bank_recon_marks',
    'book_bank_recon_sessions',
    'book_voucher_items',
    'book_voucher_entries',
    'book_vouchers',
    'book_products',
    'book_ledger_details',
    'book_ledgers',
    'book_account_groups',
    'book_financial_years',
    'book_import_jobs',
    'gstr2b_ims_actions',
  ];
  // Hospitality children first (same order as deleteTenant — non-CASCADE FKs)
  const hospSql = [
    `DELETE FROM hosp_order_item_modifiers WHERE order_item_id IN (
       SELECT oi.id FROM hosp_order_items oi
       JOIN hosp_orders o ON o.id = oi.order_id WHERE o.tenant_id = $1)`,
    `DELETE FROM hosp_order_items WHERE order_id IN (
       SELECT id FROM hosp_orders WHERE tenant_id = $1)`,
    `DELETE FROM hosp_orders WHERE tenant_id = $1`,
    `DELETE FROM hosp_queue_entries WHERE tenant_id = $1`,
    `DELETE FROM hosp_item_modifier_groups WHERE menu_item_id IN (
       SELECT id FROM hosp_menu_items WHERE tenant_id = $1)`,
    `DELETE FROM hosp_menu_items WHERE tenant_id = $1`,
    `DELETE FROM hosp_menu_categories WHERE tenant_id = $1`,
    `DELETE FROM hosp_modifiers WHERE group_id IN (
       SELECT id FROM hosp_modifier_groups WHERE tenant_id = $1)`,
    `DELETE FROM hosp_modifier_groups WHERE tenant_id = $1`,
    `DELETE FROM hosp_members WHERE tenant_id = $1`,
    `DELETE FROM hosp_membership_plans WHERE tenant_id = $1`,
    `DELETE FROM hosp_dining_tables WHERE tenant_id = $1`,
  ];
  for (const sql of hospSql) {
    await pool.query(sql, [tenantId]).catch(() => {});
  }
  for (const t of tables) {
    await pool.query(`DELETE FROM ${t} WHERE tenant_id = $1`, [tenantId]).catch(() => {});
  }
  await pool.query('DELETE FROM tenants WHERE id = $1', [tenantId]).catch(() => {});
}

export { pool };
