import { pool, setTenantContext } from '../pg-db';
import { provisionTenant, deleteTenant } from '../utils/tenant';
import { postPurchaseBatchToBooks, postSaleToBooks, postStandaloneInvoiceToBooks } from './opsToBooks';
import { getTabPreset } from '../../shared/tabPresets';

const DEMO_SLUG = 'agro-wholesale-demo';

/** One-click, repeat-safe demo data for sales calls. Keep this deliberately small. */
export async function provisionAgroWholesaleDemo() {
  const existing = (await pool.query('SELECT id, slug FROM tenants WHERE slug = $1', [DEMO_SLUG])).rows[0] as
    { id: string; slug: string } | undefined;
  if (existing)
    throw Object.assign(new Error('The agro wholesale demo tenant already exists.'), { code: 'DEMO_EXISTS' });

  const today = new Date().toISOString().slice(0, 10);
  const tenant = await provisionTenant({
    companyName: 'Shree Kisan Agro Wholesale (Demo)',
    adminEmail: 'demo.agro@dhandho.local',
    adminName: 'Demo Admin',
    adminPassword: 'DemoAgro@123',
    phone: '+91 98765 43210',
    address: 'APMC Market, Ahmedabad, Gujarat 380001',
    gstNumber: '24AABCD1234E1Z5',
    planId: 'TRIAL',
    status: 'trial',
    trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await setTenantContext(client, tenant.tenantId);
    await client.query(`UPDATE tenants SET slug = $1, business_type = 'dealer', tab_config = $2::jsonb WHERE id = $3`, [
      DEMO_SLUG,
      JSON.stringify(getTabPreset('dealer')),
      tenant.tenantId,
    ]);

    const supplierId = 'DEMO-AGRO-SUPPLIER';
    const customerId = 'DEMO-AGRO-CUSTOMER';
    const productId = 'DEMO-AGRO-RICE-25KG';
    const batchId = 'DEMO-AGRO-PURCHASE-001';
    const saleBarcode = `${batchId}-0001`;
    const purchaseDate = today;
    const saleDate = today;
    const invoiceId = 'DEMO-AGRO-INVOICE-001';

    await client.query(
      `INSERT INTO suppliers (id, tenant_id, name, phone, gst_number, address)
       VALUES ($1,$2,'Gujarat Grain Traders','9876500001','24AAGFG1234G1Z2','Naroda APMC, Ahmedabad')`,
      [supplierId, tenant.tenantId],
    );
    await client.query(
      `INSERT INTO customers (id, tenant_id, name, phone, email, address)
       VALUES ($1,$2,'Patel Kirana Stores','9876500002','patel.kirana@example.com','Maninagar, Ahmedabad')`,
      [customerId, tenant.tenantId],
    );
    await client.query(
      `INSERT INTO products (id, tenant_id, name, hsn_code, gst_rate, price, cost_price, stock, pack_name, pack_size)
       VALUES ($1,$2,'Premium Basmati Rice 25 KG','100630',5,1450,1200,0,'Bag',25)`,
      [productId, tenant.tenantId],
    );

    for (let i = 1; i <= 5; i++) {
      const barcode = `${batchId}-${String(i).padStart(4, '0')}`;
      await client.query(
        `INSERT INTO product_purchases
         (id, tenant_id, batch_id, product_id, barcode, supplier_id, purchase_date, cost_price, gst_applied, billed_price)
         VALUES ($1,$2,$3,$4,$5,$6,$7,1200,true,1260)`,
        [`DEMO-AGRO-PP-${i}`, tenant.tenantId, batchId, productId, barcode, supplierId, purchaseDate],
      );
      await client.query(
        `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, batch_id, status, unit_type)
         VALUES ($1,$2,$3,$4,$5,'InStock','piece')`,
        [`DEMO-AGRO-PI-${i}`, tenant.tenantId, productId, barcode, batchId],
      );
    }
    await client.query('UPDATE products SET stock = 5 WHERE id = $1 AND tenant_id = $2', [productId, tenant.tenantId]);
    await postPurchaseBatchToBooks(client, tenant.tenantId, {
      batchId,
      supplierId,
      supplierName: 'Gujarat Grain Traders',
      billValue: 6300,
      purchaseDate,
      taxableValue: 6000,
      taxAmount: 300,
      sellerGstin: '24AAGFG1234G1Z2',
      buyerGstin: '24AABCD1234E1Z5',
    });

    await client.query(
      `INSERT INTO product_sales
       (id, tenant_id, barcode, product_id, vendor_id, customer_id, customer_name, customer_phone, purchase_date, sale_price)
       VALUES ($1,$2,$3,$4,'OWNER',$5,'Patel Kirana Stores','9876500002',$6,1450)`,
      ['DEMO-AGRO-SALE-001', tenant.tenantId, saleBarcode, productId, customerId, saleDate],
    );
    await client.query(`UPDATE product_inventory SET status = 'Sold' WHERE tenant_id = $1 AND barcode = $2`, [
      tenant.tenantId,
      saleBarcode,
    ]);
    await client.query('UPDATE products SET stock = 4 WHERE id = $1 AND tenant_id = $2', [productId, tenant.tenantId]);
    await postSaleToBooks(client, tenant.tenantId, {
      id: 'DEMO-AGRO-SALE-001',
      amount: 1450,
      saleDate,
      customerName: 'Patel Kirana Stores',
      paymentMethod: 'Cash',
    });

    await client.query(
      `INSERT INTO standalone_invoices
       (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address, customer_phone,
        party_type, party_id, items, subtotal, tax_total, grand_total, status, invoice_date,
        tax_cgst, tax_sgst, tax_igst, is_interstate, gst_enabled, invoice_kind)
       VALUES ($1,$2,'INV-DEMO-001','Patel Kirana Stores','24AAECP1234P1Z6','Maninagar, Ahmedabad','9876500002',
        'customer',$3,$4::jsonb,5000,250,5250,'sent',$5,125,125,0,false,true,'sale')`,
      [
        invoiceId,
        tenant.tenantId,
        customerId,
        JSON.stringify([
          {
            description: 'Premium Basmati Rice 25 KG',
            quantity: 4,
            price: 1250,
            taxable: 5000,
            tax: 250,
            total: 5250,
            gstRate: 5,
          },
        ]),
        saleDate,
      ],
    );
    await postStandaloneInvoiceToBooks(client, tenant.tenantId, {
      id: invoiceId,
      invoiceNumber: 'INV-DEMO-001',
      customerName: 'Patel Kirana Stores',
      partyId: customerId,
      subtotal: 5000,
      grandTotal: 5250,
      taxCgst: 125,
      taxSgst: 125,
      taxIgst: 0,
      invoiceDate: saleDate,
      notes: 'Demo wholesale invoice',
    });

    await client.query('COMMIT');
    return {
      ...tenant,
      slug: DEMO_SLUG,
      companyName: 'Shree Kisan Agro Wholesale (Demo)',
      businessType: 'dealer',
      adminEmail: 'demo.agro@dhandho.local',
      password: 'DemoAgro@123',
      invoiceId,
      invoiceNumber: 'INV-DEMO-001',
    };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    await deleteTenant(tenant.tenantId).catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
