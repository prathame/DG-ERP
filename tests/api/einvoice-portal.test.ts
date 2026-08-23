/**
 * E-Invoice portal vs API mode — route guards + JSON download + IRN/EWB import.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';
import { uid } from '../../server/utils/helpers';
import {
  buildStandaloneEinvoiceNicJson,
  buildStandaloneEwaybillNicJson,
  clearBatchGstFiling,
  clearStandaloneInvoiceGstFiling,
  importBatchEwb,
  importBatchIrn,
  importBatchPortalResponse,
  importStandaloneInvoiceEwb,
  importStandaloneInvoiceIrn,
  importStandaloneInvoicePortalResponse,
} from '../../server/services/einvoicePortal';

const T = 'T-EINV-PORTAL';
const U = 'U-EINV-PORTAL';
const token = createTestToken({ userId: U, tenantId: T, email: 'portal@test.com', role: 'Admin', name: 'Admin' });
const hdrs = authHeaders(token, T);

const SAMPLE_ITEMS = [
  {
    description: 'Test Item',
    hsnSac: '8471',
    qty: 1,
    rate: 100,
    gstPercent: 18,
    taxable: 100,
    tax: 18,
    total: 118,
  },
];

async function seedGstInvoice(invId: string, invoiceNumber?: string) {
  const num = invoiceNumber ?? `INV/PORTAL/${invId.slice(-8)}`;
  await pool.query(
    `INSERT INTO standalone_invoices
       (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address,
        items, subtotal, tax_total, tax_cgst, tax_sgst, tax_igst, is_interstate,
        gst_enabled, grand_total, status, invoice_date)
     VALUES
       ($1,$2,$4,'Buyer','24AABCU9603R1ZM','Surat 395001',
        $3::jsonb,100,18,9,9,0,false,true,118,'sent','2026-08-23')`,
    [invId, T, JSON.stringify(SAMPLE_ITEMS), num],
  );
}

async function setEinvoiceMode(mode: 'portal' | 'api', enabled = true) {
  await api()
    .put('/api/gst/settings')
    .set(hdrs)
    .send({ einvoiceEnabled: enabled, einvoiceMode: mode, mode: 'mock', sellerPin: '380001' });
  await pool.query(
    `INSERT INTO bill_settings (tenant_id, gst_api_mode, gst_api_gstin, gst_api_seller_pin)
     VALUES ($1,'mock','24AAAPZ9999G1ZI','380001')
     ON CONFLICT (tenant_id) DO UPDATE SET gst_api_mode='mock', gst_api_gstin='24AAAPZ9999G1ZI', gst_api_seller_pin='380001'`,
    [T],
  );
}

beforeAll(async () => {
  await cleanupTestData(T);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id, gst_number, address)
     VALUES ($1,'Portal Test','portal-test','portal@test.com','Admin','active','TRIAL','24AAAPZ9999G1ZI','Ahmedabad 380001')
     ON CONFLICT (id) DO NOTHING`,
    [T],
  );
  const bcrypt = await import('bcrypt');
  const hash = await bcrypt.hash('Test1234!', 10);
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1,$2,'portal@test.com',$3,'Admin','Admin') ON CONFLICT DO NOTHING`,
    [U, T, hash],
  );
});

afterAll(async () => {
  await cleanupTestData(T);
});

describe('portal mode — JSON download + import', () => {
  const invId = uid('INV-PORTAL');

  beforeAll(async () => {
    await seedGstInvoice(invId);
    await setEinvoiceMode('portal');
  });

  it('downloads NIC e-invoice JSON for a GST invoice', async () => {
    const r = await api().get(`/api/gst/einvoice-json/invoice?invoiceId=${invId}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.Version).toBe('1.1');
    expect(r.body.DocDtls?.No).toBeTruthy();
    expect(Array.isArray(r.body.ItemList)).toBe(true);
    expect(r.body.ItemList.length).toBeGreaterThan(0);
    expect(r.body.EwbDtls).toBeUndefined();
  });

  it('embeds EwbDtls when transport params are provided (combined portal filing)', async () => {
    const params = new URLSearchParams({
      invoiceId: invId,
      transporterName: 'ABC Logistics',
      vehicleNo: 'GJ01AB1234',
      distance: '120',
      transportMode: '1',
      transDocNo: 'LR-1',
      transDocDate: '23/08/2026',
      vehicleType: 'R',
    });
    const r = await api().get(`/api/gst/einvoice-json/invoice?${params}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.EwbDtls).toMatchObject({
      TransName: 'ABC Logistics',
      VehNo: 'GJ01AB1234',
      Distance: 120,
      TransMode: '1',
      TransDocNo: 'LR-1',
      TransDocDt: '23/08/2026',
    });
  });

  it('downloads E-Way Bill JSON for portal upload', async () => {
    const params = new URLSearchParams({
      invoiceId: invId,
      transporterName: 'XYZ Transport',
      vehicleNo: 'GJ05CD9999',
      distance: '50',
      transportMode: '1',
      transDocNo: 'LR-2',
      transDocDate: '23/08/2026',
      vehicleType: 'R',
    });
    const r = await api().get(`/api/gst/ewaybill-json/invoice?${params}`).set(hdrs);
    expect(r.status).toBe(200);
    expect(r.body.Version).toBe('1.01');
    expect(r.body.VehicleNo).toBe('GJ05CD9999');
    expect(r.body._validation?.valid).toBe(true);
  });

  it('imports IRN from portal response', async () => {
    const irn = 'a'.repeat(64);
    const r = await api()
      .post('/api/gst/irn/import-invoice')
      .set(hdrs)
      .send({ invoiceId: invId, irn, ackNo: '1234567890', ackDt: '23/08/2026' });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.irn).toBe(irn);

    const row = (await pool.query('SELECT irn, irn_ack_no FROM standalone_invoices WHERE id = $1', [invId]))
      .rows[0] as { irn: string; irn_ack_no: string };
    expect(row.irn).toBe(irn);
    expect(row.irn_ack_no).toBe('1234567890');
  });

  it('imports E-Way Bill number from portal', async () => {
    const r = await api()
      .post('/api/gst/ewb/import-invoice')
      .set(hdrs)
      .send({ invoiceId: invId, ewbNumber: '658366876269' });
    expect(r.status).toBe(200);
    const row = (await pool.query('SELECT ewb_number FROM standalone_invoices WHERE id = $1', [invId])).rows[0] as {
      ewb_number: string;
    };
    expect(row.ewb_number).toBe('658366876269');
  });

  it('imports portal response JSON with IRN, QR, and EWB', async () => {
    const freshId = uid('INV-RESP');
    await seedGstInvoice(freshId);
    const irn = 'd'.repeat(64);
    const signedQr = 'eyJhbGciOiJSUzI1NiJ9.portal';
    const r = await api()
      .post('/api/gst/portal-response/import-invoice')
      .set(hdrs)
      .send({
        invoiceId: freshId,
        response: { Irn: irn, AckNo: '99', AckDt: 'today', SignedQRCode: signedQr, EwbNo: '112233445566' },
      });
    expect(r.status).toBe(200);
    expect(r.body.irn).toBe(irn);
    expect(r.body.ewbNumber).toBe('112233445566');
    const row = (await pool.query('SELECT irn, irn_qr, ewb_number FROM standalone_invoices WHERE id = $1', [freshId]))
      .rows[0] as { irn: string; irn_qr: string; ewb_number: string };
    expect(row.irn).toBe(irn);
    expect(row.irn_qr).toBe(signedQr);
    expect(row.ewb_number).toBe('112233445566');
  });

  it('clears local filing after portal cancel', async () => {
    const freshId = uid('INV-CLR');
    await seedGstInvoice(freshId);
    const irn = 'e'.repeat(64);
    await api()
      .post('/api/gst/portal-response/import-invoice')
      .set(hdrs)
      .send({ invoiceId: freshId, response: { Irn: irn, EwbNo: '999888777666' } });
    const r = await api().post('/api/gst/filing/clear-invoice').set(hdrs).send({ invoiceId: freshId, scope: 'all' });
    expect(r.status).toBe(200);
    const row = (await pool.query('SELECT irn, ewb_number FROM standalone_invoices WHERE id = $1', [freshId]))
      .rows[0] as { irn: string | null; ewb_number: string | null };
    expect(row.irn).toBeNull();
    expect(row.ewb_number).toBeNull();
  });

  it('blocks API IRN generation in portal mode', async () => {
    const freshId = uid('INV-BLOCK');
    await seedGstInvoice(freshId);
    const r = await api().post('/api/gst/irn/generate-invoice').set(hdrs).send({ invoiceId: freshId });
    expect(r.status).toBe(403);
    expect(String(r.body.error || '')).toMatch(/Automatic|API/i);
  });
});

describe('api mode — NIC API generation', () => {
  const invId = uid('INV-API');

  beforeAll(async () => {
    await seedGstInvoice(invId);
    await setEinvoiceMode('api');
  });

  it('generates mock IRN via API', async () => {
    const r = await api().post('/api/gst/irn/generate-invoice').set(hdrs).send({ invoiceId: invId });
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(String(r.body.irn || '')).toMatch(/^[a-f0-9]{64}$/i);
  });

  it('blocks portal JSON download in api mode', async () => {
    const r = await api().get(`/api/gst/einvoice-json/invoice?invoiceId=${invId}`).set(hdrs);
    expect(r.status).toBe(403);
    expect(String(r.body.error || '')).toMatch(/Manual|Portal/i);
  });

  it('blocks portal IRN import in api mode', async () => {
    const r = await api()
      .post('/api/gst/irn/import-invoice')
      .set(hdrs)
      .send({ invoiceId: invId, irn: 'b'.repeat(64) });
    expect(r.status).toBe(403);
  });
});

describe('master toggle off', () => {
  const invId = uid('INV-OFF');

  beforeAll(async () => {
    await seedGstInvoice(invId);
    await setEinvoiceMode('portal', false);
  });

  it('blocks portal JSON when E-Invoice is disabled', async () => {
    const r = await api().get(`/api/gst/einvoice-json/invoice?invoiceId=${invId}`).set(hdrs);
    expect(r.status).toBe(403);
  });

  it('blocks API generation when E-Invoice is disabled', async () => {
    await setEinvoiceMode('api', false);
    const r = await api().post('/api/gst/irn/generate-invoice').set(hdrs).send({ invoiceId: invId });
    expect(r.status).toBe(403);
  });
});

describe('einvoicePortal service (unit)', () => {
  const invId = uid('INV-UNIT');

  beforeAll(async () => {
    await setEinvoiceMode('portal');
    await seedGstInvoice(invId);
  });

  it('buildStandaloneEinvoiceNicJson returns validated structure', async () => {
    const json = (await buildStandaloneEinvoiceNicJson(pool, T, invId)) as Record<string, unknown> & {
      DocDtls?: { Typ?: string };
      _validation?: { valid?: boolean };
    };
    expect(json.Version).toBe('1.1');
    expect(json.DocDtls?.Typ).toBe('INV');
    expect(json._validation?.valid).toBe(true);
  });

  it('importStandaloneInvoiceIrn persists ack fields', async () => {
    const irn = 'c'.repeat(64);
    await importStandaloneInvoiceIrn(pool, T, { invoiceId: invId, irn, ackNo: 'ACK1', ackDt: 'today' });
    const row = (await pool.query('SELECT irn, irn_ack_no FROM standalone_invoices WHERE id = $1', [invId]))
      .rows[0] as { irn: string; irn_ack_no: string };
    expect(row.irn).toBe(irn);
    expect(row.irn_ack_no).toBe('ACK1');
  });

  it('importStandaloneInvoiceEwb requires ewb number', async () => {
    await expect(importStandaloneInvoiceEwb(pool, T, { invoiceId: invId, ewbNumber: '' })).rejects.toThrow(/required/i);
    await importStandaloneInvoiceEwb(pool, T, { invoiceId: invId, ewbNumber: '111222333' });
    const row = (await pool.query('SELECT ewb_number FROM standalone_invoices WHERE id = $1', [invId])).rows[0] as {
      ewb_number: string;
    };
    expect(row.ewb_number).toBe('111222333');
  });

  it('buildStandaloneEwaybillNicJson returns e-way structure', async () => {
    const json = await buildStandaloneEwaybillNicJson(pool, T, invId, {
      vehicleNo: 'GJ01XY1234',
      distance: 80,
      transportMode: '1',
      transporterName: 'Fast Freight',
      transDocNo: 'LR-10',
      transDocDate: '23/08/2026',
    });
    expect(json.Version).toBe('1.01');
    expect(json.VehicleNo).toBe('GJ01XY1234');
    expect(json._validation?.valid).toBe(true);
  });

  it('buildStandaloneEinvoiceNicJson embeds EwbDtls with transport', async () => {
    const json = (await buildStandaloneEinvoiceNicJson(pool, T, invId, {
      vehicleNo: 'GJ01AB1234',
      distance: 100,
      transportMode: '1',
      transporterName: 'Combined Logistics',
      transDocNo: 'LR-C',
      transDocDate: '23/08/2026',
    })) as Record<string, unknown>;
    expect(json.EwbDtls).toBeTruthy();
    expect(json._portalHint).toMatch(/together/i);
  });

  it('clearStandaloneInvoiceGstFiling clears EWB only', async () => {
    const freshId = uid('INV-EWB-CLR');
    await seedGstInvoice(freshId);
    const irn = 'f'.repeat(64);
    await importStandaloneInvoiceIrn(pool, T, { invoiceId: freshId, irn });
    await importStandaloneInvoiceEwb(pool, T, { invoiceId: freshId, ewbNumber: '555666777' });
    await clearStandaloneInvoiceGstFiling(pool, T, freshId, 'ewb');
    const row = (await pool.query('SELECT irn, ewb_number FROM standalone_invoices WHERE id = $1', [freshId]))
      .rows[0] as { irn: string | null; ewb_number: string | null };
    expect(row.irn).toBe(irn);
    expect(row.ewb_number).toBeNull();
  });

  it('importStandaloneInvoicePortalResponse imports IRN and EWB together', async () => {
    const freshId = uid('INV-PORTAL-RESP');
    await seedGstInvoice(freshId);
    const irn = 'b'.repeat(64);
    const result = await importStandaloneInvoicePortalResponse(pool, T, {
      invoiceId: freshId,
      response: { Irn: irn, SignedQRCode: 'qr-data', EwbNo: '998877665544' },
    });
    expect(result.irn).toBe(irn);
    expect(result.ewbNumber).toBe('998877665544');
    const row = (await pool.query('SELECT irn, irn_qr, ewb_number FROM standalone_invoices WHERE id = $1', [freshId]))
      .rows[0] as { irn: string; irn_qr: string; ewb_number: string };
    expect(row.irn_qr).toBe('qr-data');
    expect(row.ewb_number).toBe('998877665544');
  });

  it('rejects portal response with no IRN or EWB', async () => {
    const freshId = uid('INV-EMPTY-RESP');
    await seedGstInvoice(freshId);
    await expect(
      importStandaloneInvoicePortalResponse(pool, T, { invoiceId: freshId, response: { Status: 'OK' } }),
    ).rejects.toThrow(/no IRN or E-Way/i);
  });

  it('rejects cancelled invoice for JSON build', async () => {
    const cancelledId = uid('INV-CANCEL');
    await pool.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, items, subtotal, tax_total,
          tax_cgst, tax_sgst, gst_enabled, grand_total, status, invoice_date)
       VALUES ($1,$2,'INV-CANCEL','Buyer',$3::jsonb,100,18,9,9,true,118,'cancelled','2026-08-23')`,
      [cancelledId, T, JSON.stringify(SAMPLE_ITEMS)],
    );
    await expect(buildStandaloneEinvoiceNicJson(pool, T, cancelledId)).rejects.toThrow(/cancelled/i);
  });

  it('batch portal import and clear filing', async () => {
    const batchId = uid('BATCH-PORTAL');
    const productId = uid('PROD-PORTAL');
    const vendorId = uid('VEND-PORTAL');
    await pool.query(
      `INSERT INTO vendors (id, tenant_id, name) VALUES ($1,$2,'Portal Vendor') ON CONFLICT DO NOTHING`,
      [vendorId, T],
    );
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, stock, hsn_code, gst_rate)
       VALUES ($1,$2,'Portal Product',1000,10,'8471',18) ON CONFLICT DO NOTHING`,
      [productId, T],
    );
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ($1,$2,$3,$4,'InStock') ON CONFLICT DO NOTHING`,
      [uid('INV-BAR'), T, productId, `BC-${batchId.slice(-6)}`],
    );
    await pool.query(
      `INSERT INTO product_distribution
         (id, tenant_id, product_id, barcode, vendor_id, distribution_date, status, gst_applied,
          net_price, billed_price, batch_id)
       VALUES ($1,$2,$3,$4,$5,'2026-08-23','Distributed',true,1000,1180,$6)
       ON CONFLICT DO NOTHING`,
      [uid('DIST-PORTAL'), T, productId, `BC-${batchId.slice(-6)}`, vendorId, batchId],
    );
    const irn = '9'.repeat(64);
    await importBatchIrn(pool, T, { batchId, irn, ackNo: 'B1', ackDt: 'today' });
    await importBatchEwb(pool, T, { batchId, ewbNumber: '123456789012' });
    const imported = await importBatchPortalResponse(pool, T, {
      batchId,
      response: { Irn: irn, EwbNo: '123456789012' },
    });
    expect(imported.ewbNumber).toBe('123456789012');
    await clearBatchGstFiling(pool, T, batchId, 'all');
    const row = (
      await pool.query('SELECT irn, ewb_number FROM product_distribution WHERE batch_id = $1 AND tenant_id = $2', [
        batchId,
        T,
      ])
    ).rows[0] as { irn: string | null; ewb_number: string | null };
    expect(row.irn).toBeNull();
    expect(row.ewb_number).toBeNull();
  });
});
