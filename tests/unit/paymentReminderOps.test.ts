import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import { encryptSecret } from '../../server/utils/secret-crypto';
import {
  formatVendorPaymentReminderText,
  listRemindersDue,
  runAutoWhatsAppReminders,
} from '../../server/services/paymentReminderOps';

const TENANT = 'T-TEST-AUTO-REMIND';

async function seedOutstandingVendor(opts: { name: string; phone: string; netPrice: number }): Promise<string> {
  const vendorId = uid('VN');
  const productId = uid('PR');
  const distId = uid('PD');
  await pool.query(`INSERT INTO vendors (id, tenant_id, name, phone) VALUES ($1,$2,$3,$4)`, [
    vendorId,
    TENANT,
    opts.name,
    opts.phone,
  ]);
  await pool.query(
    `INSERT INTO vendor_reminder_settings (vendor_id, tenant_id, enabled, reminder_days, last_reminder_date)
     VALUES ($1,$2,true,7,NULL)`,
    [vendorId, TENANT],
  );
  await pool.query(`INSERT INTO products (id, tenant_id, name, price, stock) VALUES ($1,$2,$3,1000,0)`, [
    productId,
    TENANT,
    `Item-${productId}`,
  ]);
  await pool.query(
    `INSERT INTO product_distribution (id, tenant_id, product_id, barcode, vendor_id, distribution_date, status, net_price)
     VALUES ($1,$2,$3,$4,$5,CURRENT_DATE,'Distributed',$6)`,
    [distId, TENANT, productId, `BC-${distId}`, vendorId, opts.netPrice],
  );
  return vendorId;
}

describe('paymentReminderOps', () => {
  beforeAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type,
        reminders_enabled, reminder_cadence_days, reminder_min_due_amount,
        whatsapp_business_enabled, whatsapp_send_mode, whatsapp_phone_number_id, whatsapp_access_token)
       VALUES ($1,'Remind Co',$2,'r@test.com','R','active','trading',
        true, 7, 100,
        true, 'company', 'PN-1', $3)
       ON CONFLICT (id) DO UPDATE SET
         business_type='trading', reminders_enabled=true, reminder_cadence_days=7, reminder_min_due_amount=100,
         whatsapp_business_enabled=true, whatsapp_send_mode='company',
         whatsapp_phone_number_id='PN-1', whatsapp_access_token=$3, company_name='Remind Co'`,
      [TENANT, `remind-${TENANT.toLowerCase()}`, encryptSecret('token-test')],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
  });

  it('formats reminder text like the client', () => {
    const text = formatVendorPaymentReminderText({
      vendorName: 'Acme',
      balance: 2500,
      companyName: 'Dhandho',
    });
    expect(text).toContain('Acme');
    expect(text).toContain('2,500');
    expect(text).toContain('Dhandho');
  });

  it('lists due vendors and marks sent only on Meta success', async () => {
    const vendorId = await seedOutstandingVendor({ name: 'Due Vendor', phone: '9876543210', netPrice: 1500 });

    const { due } = await listRemindersDue(TENANT);
    expect(due.some(d => d.vendorId === vendorId)).toBe(true);

    const send = vi.fn().mockResolvedValue({ ok: true, messageId: 'wamid.1' });
    const result = await runAutoWhatsAppReminders(TENANT, { delayMs: 0, send });
    expect(result.blockedReason).toBeUndefined();
    expect(result.sent).toBeGreaterThanOrEqual(1);
    expect(send).toHaveBeenCalled();
    expect(send.mock.calls[0]![0].to).toBe('919876543210');

    const row = (
      await pool.query(
        `SELECT last_reminder_date::text AS d FROM vendor_reminder_settings WHERE vendor_id=$1 AND tenant_id=$2`,
        [vendorId, TENANT],
      )
    ).rows[0] as { d: string };
    expect(row.d.slice(0, 10)).toBe(new Date().toISOString().slice(0, 10));
  });

  it('does not mark sent when Meta send fails', async () => {
    const vendorId = await seedOutstandingVendor({ name: 'Fail Vendor', phone: '9123456780', netPrice: 2000 });

    const send = vi.fn().mockResolvedValue({ ok: false, status: 502, error: 'Meta down' });
    const result = await runAutoWhatsAppReminders(TENANT, { delayMs: 0, send });
    expect(result.failed.some(f => f.vendorId === vendorId)).toBe(true);

    const after = (
      await pool.query(`SELECT last_reminder_date FROM vendor_reminder_settings WHERE vendor_id=$1 AND tenant_id=$2`, [
        vendorId,
        TENANT,
      ])
    ).rows[0] as { last_reminder_date: string | null };
    expect(after.last_reminder_date).toBeNull();
  });

  it('blocks when WhatsApp company mode is not configured', async () => {
    await seedOutstandingVendor({ name: 'No WA Vendor', phone: '9000000001', netPrice: 1200 });
    await pool.query(`UPDATE tenants SET whatsapp_business_enabled = false WHERE id = $1`, [TENANT]);
    const result = await runAutoWhatsAppReminders(TENANT, { delayMs: 0, send: vi.fn() });
    expect(result.blockedReason).toMatch(/WhatsApp Business/i);
    await pool.query(`UPDATE tenants SET whatsapp_business_enabled = true WHERE id = $1`, [TENANT]);
  });
});
