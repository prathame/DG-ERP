/**
 * Outstanding payment reminders — due list + auto WhatsApp (company WABA only).
 */
import type { PoolClient } from 'pg';
import { pool } from '../pg-db';
import { DISTRIBUTION_BILL_UNIT_SQL } from '../utils/helpers';
import { decryptSecret } from '../utils/secret-crypto';
import { callMetaSendText, normalizeWhatsAppTo, resolveWhatsAppCreds } from '../utils/whatsappBusiness';
import { logger } from '../utils/logger';

export type ReminderDueRow = {
  vendorId: string;
  vendorName: string;
  vendorPhone: string;
  balance: number;
  totalValue: number;
  totalPaid: number;
  reminderDays: number;
  lastSent: string | null;
};

export function formatVendorPaymentReminderText(opts: {
  vendorName: string;
  balance: number;
  companyName?: string;
}): string {
  const companyName = opts.companyName || 'Our Company';
  return `🔔 *Payment Reminder*\n━━━━━━━━━━━━━━━━━\nDear ${opts.vendorName},\n\nThis is a reminder that you have an outstanding balance of *₹${opts.balance.toLocaleString('en-IN')}*.\n\nPlease arrange the payment at your earliest convenience.\n\nThank you,\n${companyName}`;
}

async function queryDb<T>(client: PoolClient | undefined, sql: string, params: unknown[]): Promise<T[]> {
  const q = client ? client.query(sql, params) : pool.query(sql, params);
  return (await q).rows as T[];
}

/** Same due filter as GET /vendor-finance/reminders-due. */
export async function listRemindersDue(
  tenantId: string,
  client?: PoolClient,
): Promise<{ due: ReminderDueRow[]; blockedReason?: string }> {
  const companyRows = await queryDb<{
    reminders_enabled: boolean | null;
    reminder_cadence_days: number | null;
    reminder_min_due_amount: number | null;
    business_type: string | null;
  }>(
    client,
    `SELECT reminders_enabled, reminder_cadence_days, reminder_min_due_amount, business_type
     FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const company = companyRows[0];
  if (!company) return { due: [], blockedReason: 'Tenant not found' };
  if (company.business_type === 'service') return { due: [], blockedReason: 'Reminders not used for service business' };
  if (company.reminders_enabled === false) return { due: [], blockedReason: 'Company reminders disabled' };

  const companyCadence = Math.max(1, parseInt(String(company.reminder_cadence_days ?? 15), 10) || 15);
  const minDue = Math.max(0, Number(company.reminder_min_due_amount) || 0);
  const today = new Date().toISOString().slice(0, 10);

  const rows = await queryDb<{
    vendor_id: string;
    reminder_days: number;
    last_reminder_date: string | null;
    name: string;
    phone: string | null;
    total_value: number;
    total_paid: number;
  }>(
    client,
    `
      SELECT vrs.vendor_id, vrs.reminder_days, vrs.last_reminder_date, v.name, v.phone,
        COALESCE((SELECT SUM(${DISTRIBUTION_BILL_UNIT_SQL}) FROM product_distribution pd JOIN products p ON pd.product_id = p.id WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) as total_value,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) as total_paid
      FROM vendor_reminder_settings vrs
      JOIN vendors v ON vrs.vendor_id = v.id
      WHERE vrs.enabled = true AND vrs.tenant_id = $1
    `,
    [tenantId],
  );

  const due = rows
    .filter(r => {
      const balance = Number(r.total_value) - Number(r.total_paid);
      if (balance <= 0 || balance < minDue) return false;
      if (!r.last_reminder_date) return true;
      const interval = companyCadence || r.reminder_days || 7;
      const lastSent = new Date(r.last_reminder_date);
      const nextDue = new Date(lastSent);
      nextDue.setDate(nextDue.getDate() + interval);
      return nextDue.toISOString().slice(0, 10) <= today;
    })
    .map(r => ({
      vendorId: r.vendor_id,
      vendorName: r.name,
      vendorPhone: r.phone ?? '',
      balance: Number(r.total_value) - Number(r.total_paid),
      totalValue: Number(r.total_value),
      totalPaid: Number(r.total_paid),
      reminderDays: companyCadence || r.reminder_days,
      lastSent: r.last_reminder_date,
    }));

  return { due };
}

export async function markReminderSentDate(
  tenantId: string,
  vendorId: string,
  today = new Date().toISOString().slice(0, 10),
  client?: PoolClient,
): Promise<void> {
  const cadenceRows = await queryDb<{ reminder_cadence_days?: number }>(
    client,
    'SELECT reminder_cadence_days FROM tenants WHERE id = $1',
    [tenantId],
  );
  const defaultDays = Math.max(1, parseInt(String(cadenceRows[0]?.reminder_cadence_days ?? 15), 10) || 15);
  await queryDb(
    client,
    `INSERT INTO vendor_reminder_settings (vendor_id, tenant_id, enabled, reminder_days, last_reminder_date)
     VALUES ($1, $2, false, $3, $4)
     ON CONFLICT (vendor_id, tenant_id) DO UPDATE SET last_reminder_date = $4`,
    [vendorId, tenantId, defaultDays, today],
  );
}

export type AutoReminderResult = {
  sent: number;
  skipped: number;
  failed: Array<{ vendorId: string; reason: string }>;
  blockedReason?: string;
};

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/**
 * Send WhatsApp payment reminders for due vendors (company WABA credentials only).
 * Marks last_reminder_date only after a successful Meta send.
 */
export async function runAutoWhatsAppReminders(
  tenantId: string,
  opts?: { limit?: number; delayMs?: number; send?: typeof callMetaSendText },
): Promise<AutoReminderResult> {
  const limit = Math.max(1, Math.min(100, opts?.limit ?? 50));
  const delayMs = Math.max(0, opts?.delayMs ?? 300);
  const send = opts?.send ?? callMetaSendText;

  const { due, blockedReason } = await listRemindersDue(tenantId);
  if (blockedReason) return { sent: 0, skipped: 0, failed: [], blockedReason };
  if (!due.length) return { sent: 0, skipped: 0, failed: [] };

  const tenantRows = await queryDb<{
    company_name: string | null;
    whatsapp_business_enabled: boolean;
    whatsapp_send_mode: string | null;
    whatsapp_phone_number_id: string | null;
    whatsapp_access_token: string | null;
  }>(
    undefined,
    `SELECT company_name, whatsapp_business_enabled, whatsapp_send_mode,
            whatsapp_phone_number_id, whatsapp_access_token
     FROM tenants WHERE id = $1`,
    [tenantId],
  );
  const tenant = tenantRows[0];
  if (!tenant) return { sent: 0, skipped: 0, failed: [], blockedReason: 'Tenant not found' };

  let companyToken = '';
  try {
    companyToken = tenant.whatsapp_access_token ? decryptSecret(tenant.whatsapp_access_token) : '';
  } catch (err) {
    logger.warn('Auto reminder WhatsApp token decrypt failed', {
      tenantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { sent: 0, skipped: 0, failed: [], blockedReason: 'WhatsApp credentials unavailable' };
  }

  // Unattended runs need company-mode WABA (no end-user session).
  const creds = resolveWhatsAppCreds({
    enabled: !!tenant.whatsapp_business_enabled,
    mode: 'company',
    companyPhoneNumberId: tenant.whatsapp_phone_number_id,
    companyAccessToken: companyToken,
  });
  if (!creds) {
    return {
      sent: 0,
      skipped: 0,
      failed: [],
      blockedReason:
        tenant.whatsapp_send_mode && tenant.whatsapp_send_mode !== 'company'
          ? 'Auto reminders require WhatsApp send mode "company"'
          : 'WhatsApp Business (company) not configured',
    };
  }

  const companyName = tenant.company_name || 'Our Company';
  let sent = 0;
  let skipped = 0;
  const failed: AutoReminderResult['failed'] = [];
  const batch = due.slice(0, limit);

  for (let i = 0; i < batch.length; i++) {
    const row = batch[i]!;
    const to = normalizeWhatsAppTo(row.vendorPhone);
    if (!to) {
      skipped++;
      failed.push({ vendorId: row.vendorId, reason: 'Missing or invalid phone' });
      continue;
    }

    const body = formatVendorPaymentReminderText({
      vendorName: row.vendorName,
      balance: row.balance,
      companyName,
    });
    const result = await send({
      phoneNumberId: creds.phoneNumberId,
      accessToken: creds.accessToken,
      to,
      body,
    });
    if (result.ok === false) {
      failed.push({ vendorId: row.vendorId, reason: result.error });
      logger.warn('Auto reminder WhatsApp send failed', {
        tenantId,
        vendorId: row.vendorId,
        error: result.error,
      });
    } else {
      await markReminderSentDate(tenantId, row.vendorId);
      sent++;
    }
    if (delayMs > 0 && i < batch.length - 1) await sleep(delayMs);
  }

  if (due.length > limit) skipped += due.length - limit;

  return { sent, skipped, failed };
}
