import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest, assertVendorAccess, vendorScopeId } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, parsePagination, applyDateFilter, logAudit } from '../utils/helpers';

const router = Router();

// ============ SALES ENTRY (validate barcode: distributed to vendor OR in inventory = Owner sale) ============
router.get('/api/sales/validate/:barcode', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { barcode } = req.params;
    const restrictToVendorId = typeof req.query.vendorId === 'string' ? req.query.vendorId : null;
    // 1. Check if distributed to vendor (available for sale)
    const dist = (await pool.query(`
      SELECT pd.*, p.name as product_name, p.reward_points_value, p.price, v.name as vendor_name
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $2
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $2
      WHERE pd.barcode = $1 AND pd.status = 'Distributed' AND pd.tenant_id = $2
    `, [barcode, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (dist) {
      if (restrictToVendorId && dist.vendor_id !== restrictToVendorId) return res.json({ valid: false, error: 'Barcode not assigned to your vendor' });
      return res.json({
        valid: true,
        productId: dist.product_id,
        productName: dist.product_name,
        vendorId: dist.vendor_id,
        vendorName: dist.vendor_name,
        barcode,
        rewardPointsValue: dist.reward_points_value ?? 0,
        price: dist.price ?? 0,
      });
    }
    // 2. Already sold or returned (in distribution but not Distributed)
    const assigned = (await pool.query('SELECT vendor_id FROM product_distribution WHERE barcode = $1 AND tenant_id = $2', [barcode, tenantId])).rows[0] as { vendor_id: string } | undefined;
    if (assigned) return res.json({ valid: false, error: 'Product already sold or returned' });
    // 3. Check if in inventory (Owner sale - not distributed to any vendor). Vendor users cannot sell Owner inventory.
    if (restrictToVendorId) return res.json({ valid: false, error: 'Barcode not assigned to your vendor' });
    const inv = (await pool.query(`
      SELECT pi.product_id, p.name as product_name, p.reward_points_value, p.price
      FROM product_inventory pi
      JOIN products p ON pi.product_id = p.id AND p.tenant_id = $2
      WHERE pi.barcode = $1 AND pi.status = 'InStock' AND pi.tenant_id = $2
    `, [barcode, tenantId])).rows[0] as { product_id: string; product_name: string; reward_points_value: number; price: number } | undefined;
    if (inv) {
      return res.json({
        valid: true,
        productId: inv.product_id,
        productName: inv.product_name,
        vendorId: 'OWNER',
        vendorName: 'Owner',
        barcode,
        rewardPointsValue: inv.reward_points_value ?? 0,
        price: inv.price ?? 0,
      });
    }
    // 4. Barcode not found in inventory at all
    const exists = (await pool.query('SELECT 1 FROM product_inventory WHERE barcode = $1 AND tenant_id = $2', [barcode, tenantId])).rows[0];
    if (exists) return res.json({ valid: false, error: 'Product already sold or distributed' });
    return res.json({ valid: false, error: 'Barcode not found' });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/api/sales', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { barcode, customerName, customerPhone, customerEmail, purchaseDate, salePrice } = req.body;
    const date = purchaseDate || new Date().toISOString().slice(0, 10);
    const id = uid('S');

    // Case 1: Distributed to vendor
    const dist = (await pool.query(`
      SELECT pd.*, p.id as product_id, p.reward_points_value, p.warranty_months
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $2
      WHERE pd.barcode = $1 AND pd.status = 'Distributed' AND pd.tenant_id = $2
    `, [barcode, tenantId])).rows[0] as { id: string; product_id: string; vendor_id: string; reward_points_value: number; warranty_months: number } | undefined;

    // Case 2: In inventory only (Owner sale)
    const inv = !dist ? (await pool.query(`
      SELECT pi.product_id, p.reward_points_value, p.warranty_months
      FROM product_inventory pi
      JOIN products p ON pi.product_id = p.id AND p.tenant_id = $2
      WHERE pi.barcode = $1 AND pi.status = 'InStock' AND pi.tenant_id = $2
    `, [barcode, tenantId])).rows[0] as { product_id: string; reward_points_value: number; warranty_months: number } | undefined : null;

    const saleData = dist
      ? { productId: dist.product_id, vendorId: dist.vendor_id, points: dist.reward_points_value ?? 0, warrantyMonths: dist.warranty_months ?? 12 }
      : inv
        ? { productId: inv.product_id, vendorId: 'OWNER', points: inv.reward_points_value ?? 0, warrantyMonths: inv.warranty_months ?? 12 }
        : null;

    if (!saleData) return res.status(400).json({ error: 'Invalid sale: barcode not found or already sold' });

    const { productId, vendorId, points, warrantyMonths } = saleData;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // #9 fix: lock the barcode rows inside the transaction to prevent double-sell race
      const dist = (await client.query(`
        SELECT pd.*, p.id as product_id, p.reward_points_value, p.warranty_months
        FROM product_distribution pd
        JOIN products p ON pd.product_id = p.id AND p.tenant_id = $2
        WHERE pd.barcode = $1 AND pd.status = 'Distributed' AND pd.tenant_id = $2
        FOR UPDATE
      `, [barcode, tenantId])).rows[0] as { id: string; product_id: string; vendor_id: string; reward_points_value: number; warranty_months: number } | undefined;

      const inv = !dist ? (await client.query(`
        SELECT pi.id as inv_id, pi.product_id, p.reward_points_value, p.warranty_months
        FROM product_inventory pi
        JOIN products p ON pi.product_id = p.id AND p.tenant_id = $2
        WHERE pi.barcode = $1 AND pi.status = 'InStock' AND pi.tenant_id = $2
        FOR UPDATE
      `, [barcode, tenantId])).rows[0] as { inv_id: string; product_id: string; reward_points_value: number; warranty_months: number } | undefined : null;

      const saleDataTxn = dist
        ? { productId: dist.product_id, vendorId: dist.vendor_id, points: dist.reward_points_value ?? 0, warrantyMonths: dist.warranty_months ?? 12 }
        : inv
          ? { productId: inv.product_id, vendorId: 'OWNER', points: inv.reward_points_value ?? 0, warrantyMonths: inv.warranty_months ?? 12 }
          : null;

      if (!saleDataTxn) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid sale: barcode not found or already sold' });
      }

      const { productId, vendorId, points, warrantyMonths } = saleDataTxn;

      // Find or create customer - match by phone AND name to avoid merging different people
      const phoneNorm = String(customerPhone ?? '').trim();
      const existingCustomer = phoneNorm
        ? (await client.query("SELECT id FROM customers WHERE TRIM(COALESCE(phone, '')) = $1 AND TRIM(COALESCE(name, '')) = $2 AND tenant_id = $3", [phoneNorm, String(customerName ?? '').trim(), tenantId])).rows[0] as { id: string } | undefined
        : undefined;
      let customerId: string;
      if (existingCustomer) {
        customerId = existingCustomer.id;
        await client.query('UPDATE customers SET vendor_id = COALESCE(vendor_id, $1) WHERE id = $2 AND tenant_id = $3', [vendorId, customerId, tenantId]);
      } else {
        customerId = uid('C');
        await client.query('INSERT INTO customers (id, tenant_id, name, phone, email, address, vendor_id) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [customerId, tenantId, customerName, customerPhone, customerEmail || null, null, vendorId]);
      }
      const priceVal = salePrice !== undefined && salePrice !== '' ? parseFloat(String(salePrice)) : null;
      await client.query(`
        INSERT INTO product_sales (id, tenant_id, barcode, product_id, vendor_id, customer_id, customer_name, customer_phone, customer_email, purchase_date, reward_points_earned, sale_price)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [id, tenantId, barcode, productId, vendorId, customerId, customerName, customerPhone, customerEmail || null, date, points, priceVal]);
      if (dist) await client.query("UPDATE product_distribution SET status = 'Sold' WHERE barcode = $1 AND tenant_id = $2", [barcode, tenantId]);
      await client.query("UPDATE product_inventory SET status = 'Sold' WHERE barcode = $1 AND tenant_id = $2", [barcode, tenantId]);
      await client.query('UPDATE vendors SET total_sales = total_sales + 1, total_reward_points = total_reward_points + $1 WHERE id = $2 AND tenant_id = $3', [points, vendorId, tenantId]);
      const productName = (await client.query('SELECT name FROM products WHERE id = $1 AND tenant_id = $2', [productId, tenantId])).rows[0] as { name: string } | undefined;
      const rewardId = uid('R');
      await client.query(`
        INSERT INTO rewards (id, tenant_id, user_id, points, type, description, date, vendor_id, sale_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [rewardId, tenantId, 'D1', points, 'Earned', `${productName?.name ?? 'Product'} sold`, date, vendorId, id]);
      // Auto-create warranty based on product warranty_months
      const activationDate = date;
      const actDate = new Date(activationDate);
      const expiryDateObj = new Date(actDate.getFullYear(), actDate.getMonth() + warrantyMonths, Math.min(actDate.getDate(), 28));
      const expiryDate = expiryDateObj.toISOString().slice(0, 10);
      const warrantyId = uid('W');
      await client.query(`
        INSERT INTO warranties (id, tenant_id, product_id, barcode, customer_name, customer_phone, activation_date, expiry_date, status)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Active')
      `, [warrantyId, tenantId, productId, barcode, customerName, customerPhone, activationDate, expiryDate]);

      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await logAudit(pool, tenantId, 'Sale Created', 'sale', id, `Barcode: ${barcode}, Customer: ${customerName}, Price: ${salePrice ?? 'N/A'}`);
    const row = (await pool.query('SELECT * FROM product_sales WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0] as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      barcode: row.barcode,
      productId: row.product_id,
      vendorId: row.vendor_id,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      customerEmail: row.customer_email,
      purchaseDate: row.purchase_date,
      rewardPointsEarned: row.reward_points_earned,
      salePrice: row.sale_price ?? null,
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/api/sales', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { vendorId } = req.query;
    const { limit, offset, page } = parsePagination(req.query as Record<string, unknown>);
    let where = 'WHERE ps.tenant_id = $1';
    const params: unknown[] = [tenantId];
    // H1 fix: Vendor JWT can only see their own sales — override query param with JWT vendorId
    const jwtUser = (req as AuthRequest).user;
    const enforcedVendorId = (jwtUser?.role === 'Vendor' && jwtUser?.vendorId) ? jwtUser.vendorId : (typeof vendorId === 'string' && vendorId ? vendorId : null);
    if (enforcedVendorId) { where += ` AND ps.vendor_id = $${params.length + 1}`; params.push(enforcedVendorId); }
    where += applyDateFilter(req.query as Record<string, unknown>, 'ps.purchase_date', params);
    const countParams = [...params];
    const total = ((await pool.query(`SELECT COUNT(*) as c FROM product_sales ps ${where}`, countParams)).rows[0] as { c: string }).c;
    const sql = `SELECT ps.*, p.name as product_name FROM product_sales ps JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1 ${where} ORDER BY ps.purchase_date DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);
    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    res.json({
      data: rows.map((r) => ({
        id: r.id, barcode: r.barcode, productId: r.product_id, productName: r.product_name, vendorId: r.vendor_id,
        customerName: r.customer_name, customerPhone: r.customer_phone, customerEmail: r.customer_email,
        purchaseDate: r.purchase_date, rewardPointsEarned: r.reward_points_earned, salePrice: r.sale_price ?? null,
      })),
      total: Number(total), page, totalPages: Math.ceil(Number(total) / limit),
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ SALES BILL ============
router.get('/api/sales/:id/bill', async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { id } = req.params;
    const sale = (await pool.query(`
      SELECT ps.*, p.name as product_name, p.warranty_months, p.price as product_price,
             p.description as product_description, p.batch_number, p.hsn_code, p.gst_rate,
             v.name as vendor_name, v.contact_person as vendor_contact, v.phone as vendor_phone, v.email as vendor_email, v.address as vendor_address
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id AND p.tenant_id = $2
      LEFT JOIN vendors v ON ps.vendor_id = v.id AND v.tenant_id = $2
      WHERE ps.id = $1 AND ps.tenant_id = $2
    `, [id, tenantId])).rows[0] as Record<string, unknown> | undefined;
    if (!sale) return res.status(404).json({ error: 'Sale not found' });

    const denied = assertVendorAccess(req, (sale.vendor_id as string) || '');
    if (denied) return res.status(403).json({ error: denied });
    // Vendors without a matching vendor on the sale cannot read bank/bill details
    if (vendorScopeId(req) && !sale.vendor_id) {
      return res.status(403).json({ error: 'Access denied for this sale.' });
    }
    const warranty = (await pool.query('SELECT activation_date, expiry_date, status FROM warranties WHERE barcode = $1 AND tenant_id = $2 ORDER BY activation_date DESC LIMIT 1', [sale.barcode, tenantId])).rows[0] as { activation_date: string; expiry_date: string; status: string } | undefined;
    const company = (await pool.query("SELECT name, company_name, phone, address, gst_number, default_gst_rate FROM users WHERE role IN ('Super Admin', 'Admin') AND tenant_id = $1 ORDER BY id LIMIT 1", [tenantId])).rows[0] as { name: string; company_name: string | null; phone: string | null; address: string | null; gst_number: string | null; default_gst_rate: number | null } | undefined;
    const billSettingsRow = (await pool.query('SELECT * FROM bill_settings WHERE tenant_id = $1', [tenantId])).rows[0] as Record<string, unknown> | undefined;

    // Compute vendorFinance before building response
    let vendorFinance: { totalDistributedValue: number; totalPaid: number; balance: number } | null = null;
    const vid = sale.vendor_id as string;
    if (vid && vid !== 'OWNER') {
      const totalValue = (await pool.query('SELECT COALESCE(SUM(COALESCE(pd.billed_price, pd.net_price, p.price)), 0) as t FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $2 WHERE pd.vendor_id = $1 AND pd.tenant_id = $2', [vid, tenantId])).rows[0] as { t: number };
      const totalPaid = (await pool.query('SELECT COALESCE(SUM(amount), 0) as t FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2', [vid, tenantId])).rows[0] as { t: number };
      vendorFinance = { totalDistributedValue: Number(totalValue.t), totalPaid: Number(totalPaid.t), balance: Number(totalValue.t) - Number(totalPaid.t) };
    }

    res.json({
      id: sale.id,
      barcode: sale.barcode,
      productName: sale.product_name,
      productDescription: sale.product_description ?? null,
      category: null,
      batchNumber: sale.batch_number ?? null,
      productPrice: sale.product_price ?? 0,
      salePrice: sale.sale_price ?? sale.product_price ?? 0,
      warrantyMonths: sale.warranty_months ?? 12,
      customerName: sale.customer_name,
      customerPhone: sale.customer_phone,
      customerEmail: sale.customer_email ?? null,
      purchaseDate: sale.purchase_date,
      rewardPointsEarned: sale.reward_points_earned ?? 0,
      vendor: {
        name: sale.vendor_name ?? 'Owner',
        contactPerson: sale.vendor_contact ?? null,
        phone: sale.vendor_phone ?? null,
        email: sale.vendor_email ?? null,
        address: sale.vendor_address ?? null,
      },
      warranty: warranty ? {
        activationDate: warranty.activation_date,
        expiryDate: warranty.expiry_date,
        status: warranty.status,
      } : null,
      hsnCode: sale.hsn_code ?? null,
      gstRate: Number(sale.gst_rate) || Number(company?.default_gst_rate) || 18,
      company: {
        name: company?.company_name ?? 'Dhandho',
        contactName: company?.name ?? null,
        phone: company?.phone ?? null,
        address: company?.address ?? null,
        gstNumber: company?.gst_number ?? null,
      },
      vendorFinance,
      billSettings: billSettingsRow ? {
        logoBase64: billSettingsRow.logo_base64 ?? null,
        primaryColor: (billSettingsRow.primary_color as string) || '#F27D26',
        tagline: billSettingsRow.tagline ?? null,
        invoicePrefix: billSettingsRow.invoice_prefix ?? null,
        challanPrefix: billSettingsRow.challan_prefix ?? null,
        bankAccountName: billSettingsRow.bank_account_name ?? null,
        bankAccountNumber: billSettingsRow.bank_account_number ?? null,
        bankName: billSettingsRow.bank_name ?? null,
        bankBranch: billSettingsRow.bank_branch ?? null,
        bankIfsc: billSettingsRow.bank_ifsc ?? null,
        bankUpiId: billSettingsRow.bank_upi_id ?? null,
        termsAndConditions: billSettingsRow.terms_and_conditions ?? null,
        signatoryName: billSettingsRow.signatory_name ?? null,
        signatoryDesignation: billSettingsRow.signatory_designation ?? null,
        signatureBase64: billSettingsRow.signature_base64 ?? null,
        showRewards: billSettingsRow.show_rewards !== false,
        showBarcode: billSettingsRow.show_barcode !== false,
        showWarranty: billSettingsRow.show_warranty !== false,
        footerText: (billSettingsRow.footer_text as string) || 'Powered by Dhandho Management',
      } : undefined,
    });
  } catch (err) {
    console.error(`💥 ${req.method} ${req.originalUrl} failed:`, (err as Error).message); res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
