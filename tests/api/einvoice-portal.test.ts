/**
 * E-Invoice portal vs API mode — route guards + JSON download + IRN/EWB import.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData, createTestToken } from '../helpers';
import { api, authHeaders } from '../http';
import { uid } from '../../server/utils/helpers';
import {
  buildStandaloneEinvoiceNicJson,
  importStandaloneInvoiceEwb,
  importStandaloneInvoiceIrn,
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
    const json = await buildStandaloneEinvoiceNicJson(pool, T, invId);
    expect(json.Version).toBe('1.1');
    expect(json.DocDtls.Typ).toBe('INV');
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
});
