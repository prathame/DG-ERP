import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import { uid } from '../../server/utils/helpers';
import {
  generateStandaloneInvoiceEwb,
  generateStandaloneInvoiceEwbByIrn,
  generateStandaloneInvoiceIrn,
  generateStandaloneInvoiceIrnAndEwb,
  StandaloneInvoiceGstError,
} from '../../server/services/standaloneInvoiceGst';
import { NicApiClient } from '../../server/services/nic-api';

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

  it('covers validation and edge paths for IRN/EWB', async () => {
    await expect(generateStandaloneInvoiceIrn(pool, TENANT, 'missing-inv')).rejects.toMatchObject({
      status: 404,
      message: expect.stringMatching(/not found/i),
    });

    const cancelledId = uid('SI');
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total,
          gst_enabled, grand_total, status, invoice_date)
       VALUES
         ($1,$2,'INV/25-26/0101','X',$3::jsonb,1000,180,true,1180,'cancelled','2025-08-12')`,
      [
        cancelledId,
        TENANT,
        JSON.stringify([
          { description: 'A', qty: 1, rate: 1000, gstPercent: 18, taxable: 1000, tax: 180, total: 1180 },
        ]),
      ],
    );
    await expect(generateStandaloneInvoiceIrn(pool, TENANT, cancelledId)).rejects.toThrow(/cancelled/i);

    const emptyItemsId = uid('SI');
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total,
          gst_enabled, grand_total, status, invoice_date)
       VALUES
         ($1,$2,'INV/25-26/0102','Y','[]'::jsonb,1000,180,true,1180,'sent','2025-08-12')`,
      [emptyItemsId, TENANT],
    );
    await expect(generateStandaloneInvoiceIrn(pool, TENANT, emptyItemsId)).rejects.toThrow(/no line items/i);

    const b2cId = uid('SI');
    // gst_enabled null + tax_total > 0; items without tax (compute from rate); qty 0; no HSN
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address,
          items, subtotal, tax_total, gst_enabled, grand_total, status, invoice_date)
       VALUES
         ($1,$2,'INV/25-26/0103','Walk-in',NULL,NULL,
          $3::jsonb,1000,180,NULL,1180,'sent','2025-08-12')`,
      [
        b2cId,
        TENANT,
        JSON.stringify([
          { qty: 0, rate: 1000, gstPercent: 18, taxable: 1000, total: 1180 },
          { description: 'Spare', hsnSac: null, qty: 1, rate: 0, gstPercent: 18, taxable: 0, tax: 0, total: 0 },
        ]),
      ],
    );
    const irn = await generateStandaloneInvoiceIrn(pool, TENANT, b2cId, {
      sellerPin: 'bad',
      buyerPin: 'also-bad',
    });
    expect(irn.irn).toBeTruthy();

    await expect(
      generateStandaloneInvoiceEwb(pool, TENANT, { invoiceId: b2cId, vehicleNo: '  ', distance: 10 }),
    ).rejects.toThrow(/vehicleNo/i);
    await expect(
      generateStandaloneInvoiceEwb(pool, TENANT, { invoiceId: b2cId, vehicleNo: 'GJ01XX9999', distance: 0 }),
    ).rejects.toThrow(/distance/i);

    const ewb = await generateStandaloneInvoiceEwb(pool, TENANT, {
      invoiceId: b2cId,
      vehicleNo: 'gj01cd5678',
      distance: 40,
      transportMode: '2',
      transporterName: 'Self',
      transporterId: 'T1',
      sellerPin: '380015',
      buyerPin: '380015',
    });
    expect(ewb.ewbNo).toBeTruthy();
    await expect(
      generateStandaloneInvoiceEwb(pool, TENANT, {
        invoiceId: b2cId,
        vehicleNo: 'GJ01CD5678',
        distance: 10,
      }),
    ).rejects.toThrow(/already has an E-way/i);

    // sandbox credentials missing → loadGstCredentials fails
    await pool.query(`UPDATE bill_settings SET gst_api_mode='sandbox', gst_api_client_id=NULL WHERE tenant_id=$1`, [
      TENANT,
    ]);
    const needCreds = uid('SI');
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total,
          gst_enabled, grand_total, status, invoice_date)
       VALUES
         ($1,$2,'INV/25-26/0104','Z',$3::jsonb,100,18,true,118,'sent','2025-08-12')`,
      [
        needCreds,
        TENANT,
        JSON.stringify([{ description: 'X', qty: 1, rate: 100, gstPercent: 18, taxable: 100, tax: 18, total: 118 }]),
      ],
    );
    await expect(generateStandaloneInvoiceIrn(pool, TENANT, needCreds)).rejects.toThrow(/GST API/i);
    await pool.query(`UPDATE bill_settings SET gst_api_mode='mock' WHERE tenant_id=$1`, [TENANT]);
  });

  it('generates EWB by IRN and combined IRN+EWB flows', async () => {
    const invId = uid('SI');
    const items = [
      { description: 'Cable', hsnSac: '8544', qty: 1, rate: 500, gstPercent: 18, taxable: 500, tax: 90, total: 590 },
    ];
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address,
          items, subtotal, tax_total, tax_cgst, tax_sgst, tax_igst, is_interstate,
          gst_enabled, grand_total, status, invoice_date)
       VALUES
         ($1,$2,'INV/25-26/0200','Buyer','24AABCU9603R1ZM','Surat 395001',
          $3::jsonb,500,90,45,45,0,false,true,590,'sent','2025-08-12')`,
      [invId, TENANT, JSON.stringify(items)],
    );

    const irn = await generateStandaloneInvoiceIrn(pool, TENANT, invId);
    expect(irn.irn).toBeTruthy();

    await expect(
      generateStandaloneInvoiceEwbByIrn(pool, TENANT, { invoiceId: invId, vehicleNo: ' ', distance: 10 }),
    ).rejects.toThrow(/vehicleNo/i);

    const ewbByIrn = await generateStandaloneInvoiceEwbByIrn(pool, TENANT, {
      invoiceId: invId,
      vehicleNo: 'GJ01EF4321',
      distance: 85,
      transportMode: '1',
      transporterName: 'Carrier',
      transporterId: '24AABCU9603R1ZM',
    });
    expect(ewbByIrn.ewbNo).toBeTruthy();
    expect(ewbByIrn.mode).toBe('mock');

    await expect(
      generateStandaloneInvoiceEwbByIrn(pool, TENANT, {
        invoiceId: invId,
        vehicleNo: 'GJ01EF4321',
        distance: 10,
      }),
    ).rejects.toThrow(/already has an E-way/i);

    const comboId = uid('SI');
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address,
          items, subtotal, tax_total, tax_cgst, tax_sgst, tax_igst, is_interstate,
          gst_enabled, grand_total, status, invoice_date)
       VALUES
         ($1,$2,'INV/25-26/0201','Combo Buyer','24AABCU9603R1ZM','Surat 395001',
          $3::jsonb,500,90,45,45,0,false,true,590,'sent','2025-08-12')`,
      [comboId, TENANT, JSON.stringify(items)],
    );

    const combo = await generateStandaloneInvoiceIrnAndEwb(pool, TENANT, {
      invoiceId: comboId,
      vehicleNo: 'GJ01GH6543',
      distance: 120,
      sellerPin: '380001',
      buyerPin: '395001',
    });
    expect(combo.irn).toBeTruthy();
    expect(combo.ewbNo).toBeTruthy();

    const noIrnId = uid('SI');
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total,
          gst_enabled, grand_total, status, invoice_date)
       VALUES
         ($1,$2,'INV/25-26/0202','No IRN',$3::jsonb,500,90,true,590,'sent','2025-08-12')`,
      [noIrnId, TENANT, JSON.stringify(items)],
    );
    await expect(
      generateStandaloneInvoiceEwbByIrn(pool, TENANT, {
        invoiceId: noIrnId,
        vehicleNo: 'GJ01XX1111',
        distance: 10,
      }),
    ).rejects.toThrow(/before E-Way Bill by IRN/i);
  });

  it('mock NicApiClient generateEwbByIrn returns an EWB number', async () => {
    const nic = new NicApiClient({
      mode: 'mock',
      gstin: '24AAAPZ9999G1ZI',
      username: 'u',
      password: 'p',
      clientId: 'c',
      clientSecret: 's',
    });
    const r = await nic.generateEwbByIrn({
      irn: 'a1b2c3d4e5f6789012345678901234',
      vehicleNo: 'GJ01AB1234',
      distance: 50,
    });
    expect(r.ewbNo).toMatch(/^\d{12}$/);
    expect(r.ewbDt).toBeTruthy();
    expect(r.ewbValidTill).toBeTruthy();
  });
});
