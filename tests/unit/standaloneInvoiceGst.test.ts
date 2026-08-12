import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import {
  generateStandaloneInvoiceEwb,
  generateStandaloneInvoiceIrn,
  StandaloneInvoiceGstError,
} from '../../server/services/standaloneInvoiceGst';

const TENANT = 'T-TEST-SI-GST-IRN';

describe('standaloneInvoiceGst', () => {
  beforeAll(async () => {
    await pool.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS irn TEXT');
    await pool.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS irn_ack_no TEXT');
    await pool.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS irn_ack_dt TEXT');
    await pool.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS irn_qr TEXT');
    await pool.query('ALTER TABLE standalone_invoices ADD COLUMN IF NOT EXISTS ewb_number TEXT');
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type, gst_number, address)
       VALUES ($1,'SI GST Test',$2,'sigst@test.com','SI','active','service','24AAAPZ9999G1ZI','Ahmedabad')
       ON CONFLICT (id) DO UPDATE SET gst_number = EXCLUDED.gst_number, address = EXCLUDED.address`,
      [TENANT, `sigst-${TENANT.toLowerCase()}`],
    );
    await pool.query(
      `INSERT INTO bill_settings (tenant_id, gst_api_mode, gst_api_gstin, gst_api_seller_pin)
       VALUES ($1,'mock','24AAAPZ9999G1ZI','380001')
       ON CONFLICT (tenant_id) DO UPDATE SET gst_api_mode='mock', gst_api_gstin='24AAAPZ9999G1ZI', gst_api_seller_pin='380001'`,
      [TENANT],
    );
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('generates mock IRN and EWB for a GST tax invoice', async () => {
    await cleanupTestData(TENANT);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type, gst_number, address)
       VALUES ($1,'SI GST Test',$2,'sigst@test.com','SI','active','service','24AAAPZ9999G1ZI','Ahmedabad')
       ON CONFLICT (id) DO UPDATE SET gst_number = EXCLUDED.gst_number`,
      [TENANT, `sigst-${TENANT.toLowerCase()}`],
    );
    await pool.query(
      `INSERT INTO bill_settings (tenant_id, gst_api_mode, gst_api_gstin, gst_api_seller_pin)
       VALUES ($1,'mock','24AAAPZ9999G1ZI','380001')
       ON CONFLICT (tenant_id) DO UPDATE SET gst_api_mode='mock'`,
      [TENANT],
    );

    const invId = uid('SI');
    const items = [
      {
        description: 'Widget',
        hsnSac: '8471',
        qty: 2,
        rate: 1000,
        gstPercent: 18,
        taxable: 2000,
        tax: 360,
        total: 2360,
      },
    ];
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address,
          items, subtotal, tax_total, tax_cgst, tax_sgst, tax_igst, is_interstate,
          gst_enabled, grand_total, status, invoice_date)
       VALUES
         ($1,$2,'INV/25-26/0099','Buyer Co','24AABCU9603R1ZM','Surat',
          $3::jsonb,2000,360,180,180,0,false,true,2360,'sent','2025-08-12')`,
      [invId, TENANT, JSON.stringify(items)],
    );

    const irn = await generateStandaloneInvoiceIrn(pool, TENANT, invId);
    expect(irn.irn).toBeTruthy();
    expect(irn.mode).toBe('mock');
    expect(irn.invoiceId).toBe(invId);

    const row = (await pool.query(`SELECT irn, irn_ack_no, irn_qr FROM standalone_invoices WHERE id=$1`, [invId]))
      .rows[0] as { irn: string; irn_ack_no: string; irn_qr: string };
    expect(row.irn).toBe(irn.irn);
    expect(row.irn_ack_no).toBeTruthy();

    await expect(generateStandaloneInvoiceIrn(pool, TENANT, invId)).rejects.toBeInstanceOf(StandaloneInvoiceGstError);

    const ewb = await generateStandaloneInvoiceEwb(pool, TENANT, {
      invoiceId: invId,
      vehicleNo: 'GJ01AB1234',
      distance: 120,
    });
    expect(ewb.ewbNo).toBeTruthy();
    expect(ewb.mode).toBe('mock');

    const ewbRow = (await pool.query(`SELECT ewb_number FROM standalone_invoices WHERE id=$1`, [invId])).rows[0] as {
      ewb_number: string;
    };
    expect(ewbRow.ewb_number).toBe(ewb.ewbNo);
  });

  it('rejects non-GST invoices', async () => {
    const invId = uid('SI');
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total,
          gst_enabled, grand_total, status, invoice_date)
       VALUES
         ($1,$2,'INV/25-26/0100','Cash Buyer',$3::jsonb,500,0,false,500,'sent','2025-08-12')`,
      [
        invId,
        TENANT,
        JSON.stringify([
          { description: 'Service', qty: 1, rate: 500, gstPercent: 0, taxable: 500, tax: 0, total: 500 },
        ]),
      ],
    );
    await expect(generateStandaloneInvoiceIrn(pool, TENANT, invId)).rejects.toThrow(/no GST/i);
  });
});
