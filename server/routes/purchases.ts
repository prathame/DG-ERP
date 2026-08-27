import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool, setTenantContext } from '../pg-db';
import { round2, purchaseUnitPrices, normalizeGstRate } from '../../shared/gstRound';
import { uid, logAudit, indianFinancialYear, nextSelfInvoiceNumber } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { postPurchaseBatchToBooks, postSupplierPaymentToBooks } from '../services/opsToBooks';
import { withBooks } from '../utils/booksStrict';
import { isQtyStockUnit } from '../../shared/qtyStock';
import { isBarcodeAddonOn } from '../utils/barcode';

const router = Router();

/** Next SI/FY/#### under a tenant advisory lock (safe under concurrency). */
async function allocateNextSelfInvoiceNumber(client: { query: typeof pool.query }, tenantId: string): Promise<string> {
  await client.query(`SELECT pg_advisory_xact_lock(hashtext($1 || ':purchase_self_invoice_seq'))`, [tenantId]);
  const fy = indianFinancialYear();
  const prefix = `SI/${fy}/`;
  const { rows } = await client.query(
    `SELECT invoice_number FROM product_purchases
     WHERE tenant_id = $1 AND invoice_number LIKE $2
     ORDER BY invoice_number DESC
     LIMIT 1`,
    [tenantId, `${prefix}%`],
  );
  return nextSelfInvoiceNumber(rows[0]?.invoice_number as string | undefined, fy);
}

// ============ SUPPLIERS CRUD ============

router.get('/api/suppliers', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { search } = req.query;
    let sql = 'SELECT * FROM suppliers WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    if (typeof search === 'string' && search) {
      sql += ' AND (name ILIKE $2 OR contact_person ILIKE $3 OR phone ILIKE $4 OR email ILIKE $5)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY name';
    const { rows } = await pool.query(sql, params);
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        name: r.name,
        contactPerson: r.contact_person,
        phone: r.phone,
        email: r.email,
        address: r.address,
        gstNumber: r.gst_number ?? null,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/suppliers', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { name, contactPerson, phone, email, address, gstNumber } = req.body;
    if (!name || !name.trim()) return res.status(400).json({ error: 'Supplier name is required' });
    if (phone && !/^\+?\d[\d\s-]{6,14}$/.test(phone.trim()))
      return res.status(400).json({ error: 'Invalid phone number' });
    const dup = (
      await pool.query('SELECT id FROM suppliers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2)', [
        tenantId,
        name.trim(),
      ])
    ).rows[0];
    if (dup) return res.status(400).json({ error: `Supplier "${name}" already exists` });
    const id = uid('S');
    await pool.query(
      'INSERT INTO suppliers (id, tenant_id, name, contact_person, phone, email, address, gst_number) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
      [
        id,
        tenantId,
        name,
        contactPerson || null,
        phone?.trim() || null,
        email || null,
        address || null,
        gstNumber || null,
      ],
    );
    const row = (await pool.query('SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.status(201).json({
      id: row.id,
      name: row.name,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      address: row.address,
      gstNumber: row.gst_number ?? null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.put('/api/suppliers/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id } = req.params;
    const { name, contactPerson, phone, email, address, gstNumber } = req.body;
    if (phone && !/^\+?\d[\d\s-]{6,14}$/.test(phone.trim()))
      return res.status(400).json({ error: 'Invalid phone number' });
    if (name !== undefined && (!name || !name.trim()))
      return res.status(400).json({ error: 'Supplier name cannot be empty' });
    if (name) {
      const dup = (
        await pool.query('SELECT id FROM suppliers WHERE tenant_id = $1 AND LOWER(name) = LOWER($2) AND id != $3', [
          tenantId,
          name.trim(),
          id,
        ])
      ).rows[0];
      if (dup) return res.status(400).json({ error: `Supplier "${name}" already exists` });
    }
    const result = await pool.query(
      "UPDATE suppliers SET name=COALESCE(NULLIF($1,''),name), contact_person=COALESCE($2,contact_person), phone=COALESCE($3,phone), email=COALESCE($4,email), address=COALESCE($5,address), gst_number=COALESCE($8,gst_number) WHERE id=$6 AND tenant_id=$7",
      [name, contactPerson, phone?.trim() || null, email, address, id, tenantId, gstNumber ?? null],
    );
    if (result.rowCount === 0) return res.status(404).json({ error: 'Supplier not found' });
    const row = (await pool.query('SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2', [id, tenantId])).rows[0];
    res.json({
      id: row.id,
      name: row.name,
      contactPerson: row.contact_person,
      phone: row.phone,
      email: row.email,
      address: row.address,
      gstNumber: row.gst_number ?? null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/suppliers/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const hasPurchases = (
      await pool.query('SELECT 1 FROM product_purchases WHERE supplier_id = $1 AND tenant_id = $2 LIMIT 1', [
        req.params.id,
        tenantId,
      ])
    ).rows[0];
    if (hasPurchases)
      return res
        .status(400)
        .json({ error: 'Cannot delete supplier with existing purchases. Remove purchase records first.' });
    await pool.query('DELETE FROM supplier_payments WHERE supplier_id = $1 AND tenant_id = $2', [
      req.params.id,
      tenantId,
    ]);
    const result = await pool.query('DELETE FROM suppliers WHERE id = $1 AND tenant_id = $2', [
      req.params.id,
      tenantId,
    ]);
    if (result.rowCount === 0) return res.status(404).json({ error: 'Supplier not found' });
    res.status(204).send();
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ PURCHASE BATCHES ============

router.post('/api/purchases/batch', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const {
      supplierId,
      purchaseDate,
      amountPaid,
      items,
      gstRate: reqGstRate,
      invoiceNumber,
      isRcm: reqIsRcm,
    } = req.body as {
      supplierId?: string;
      purchaseDate?: string;
      amountPaid?: number;
      gstRate?: number;
      invoiceNumber?: string;
      isRcm?: boolean;
      items?: {
        productId: string;
        quantity: number;
        costPrice?: number;
        discountPercent?: number;
        withGst?: boolean;
        gstRate?: number;
        priceIncludesGst?: boolean;
        lotNumber?: string;
        mfgDate?: string;
        expiryDate?: string;
      }[];
    };
    const isRcm = !!reqIsRcm;
    if (!supplierId) return res.status(400).json({ error: 'Supplier is required' });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Add at least one product' });

    const supplier = (
      await pool.query('SELECT id, name, gst_number FROM suppliers WHERE id = $1 AND tenant_id = $2', [
        supplierId,
        tenantId,
      ])
    ).rows[0] as { id: string; name: string; gst_number?: string | null } | undefined;
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    const barcodeAddonOn = await isBarcodeAddonOn(pool, tenantId);

    const gstRate = Number(reqGstRate) || 18;
    const date = purchaseDate || new Date().toISOString().slice(0, 10);
    const batchId = uid('PB');
    const paidAmount = amountPaid ? Math.max(0, Number(amountPaid)) : 0;
    let resolvedInvoiceNumber = typeof invoiceNumber === 'string' ? invoiceNumber.trim() : '';

    let totalBilled = 0;
    let totalTaxable = 0;
    let totalTax = 0;
    let totalQty = 0;
    const productNames: string[] = [];
    const purchaseRows: {
      id: string;
      productId: string;
      qty: number;
      costPrice: number;
      gstApplied: boolean;
      billedPrice: number;
      disc: number;
      qtyStock: boolean;
      lotNumber: string | null;
      mfgDate: string | null;
      expiryDate: string | null;
    }[] = [];

    for (const item of items) {
      const qty = Math.max(1, parseInt(String(item.quantity), 10) || 1);
      const product = (
        await pool.query(
          'SELECT id, name, price, cost_price, pack_name, gst_rate, price_includes_gst FROM products WHERE id = $1 AND tenant_id = $2',
          [item.productId, tenantId],
        )
      ).rows[0] as
        | {
            id: string;
            name: string;
            price: number;
            cost_price: number | null;
            pack_name: string | null;
            gst_rate: number | null;
            price_includes_gst: boolean | null;
          }
        | undefined;
      if (!product) return res.status(404).json({ error: `Product not found: ${item.productId}` });

      const typed = item.costPrice != null && String(item.costPrice).trim() !== '' ? Number(item.costPrice) : NaN;
      const entered =
        Number.isFinite(typed) && typed > 0
          ? typed
          : Number(product.cost_price) > 0
            ? Number(product.cost_price)
            : Number(product.price) || 0;
      const disc = Math.min(100, Math.max(0, Number(item.discountPercent) || 0));
      const afterDisc = Math.round(((entered * (100 - disc)) / 100) * 100) / 100;
      const lineRate = normalizeGstRate(item.gstRate ?? product.gst_rate, gstRate);
      const inclusive = item.priceIncludesGst != null ? !!item.priceIncludesGst : !!product.price_includes_gst;
      const gstApplied = isRcm ? true : item.withGst !== false;
      const unit = purchaseUnitPrices({
        enteredCost: afterDisc,
        gstRate: lineRate,
        withGst: gstApplied,
        priceIncludesGst: inclusive,
        isRcm,
      });
      const supplierUnit = isRcm ? unit.cost : unit.billed;

      productNames.push(product.name);
      purchaseRows.push({
        id: `${batchId}-${totalQty + 1}`,
        productId: product.id,
        qty,
        costPrice: unit.cost,
        gstApplied,
        billedPrice: unit.billed,
        disc,
        qtyStock: isQtyStockUnit(product.pack_name) || !barcodeAddonOn,
        lotNumber: typeof item.lotNumber === 'string' && item.lotNumber.trim() ? item.lotNumber.trim() : null,
        mfgDate: typeof item.mfgDate === 'string' && item.mfgDate.trim() ? item.mfgDate.trim() : null,
        expiryDate: typeof item.expiryDate === 'string' && item.expiryDate.trim() ? item.expiryDate.trim() : null,
      });
      totalBilled += supplierUnit * qty;
      totalTaxable += unit.cost * qty;
      totalTax += unit.gst * qty;
      totalQty += qty;
    }

    if (paidAmount > totalBilled)
      return res
        .status(400)
        .json({ error: `Amount paid (₹${paidAmount}) cannot exceed billed amount (₹${totalBilled})` });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await setTenantContext(client, tenantId);
      if (isRcm && !resolvedInvoiceNumber) {
        resolvedInvoiceNumber = await allocateNextSelfInvoiceNumber(client, tenantId);
      }
      // Bulk INSERT all purchase rows in one query
      const purchaseVals: string[] = [];
      const purchasePs: unknown[] = [];
      let seq = 0;
      let pIdx = 1;
      for (const u of purchaseRows) {
        for (let i = 0; i < u.qty; i++) {
          seq++;
          purchaseVals.push(
            `($${pIdx},$${pIdx + 1},$${pIdx + 2},$${pIdx + 3},$${pIdx + 4},$${pIdx + 5},$${pIdx + 6},$${pIdx + 7},$${pIdx + 8},$${pIdx + 9},$${pIdx + 10},$${pIdx + 11},$${pIdx + 12},$${pIdx + 13},$${pIdx + 14})`,
          );
          purchasePs.push(
            `${batchId}-${seq}`,
            tenantId,
            batchId,
            u.productId,
            supplierId,
            date,
            u.costPrice,
            u.gstApplied,
            u.billedPrice,
            u.disc,
            resolvedInvoiceNumber || null,
            isRcm,
            u.lotNumber,
            u.mfgDate,
            u.expiryDate,
          );
          pIdx += 15;
        }
      }
      if (purchaseVals.length > 0) {
        await client.query(
          `INSERT INTO product_purchases (id,tenant_id,batch_id,product_id,supplier_id,purchase_date,cost_price,gst_applied,billed_price,discount_percent,invoice_number,is_rcm,lot_number,mfg_date,expiry_date) VALUES ${purchaseVals.join(',')}`,
          purchasePs,
        );
      }

      // H8 fix: create product_inventory rows so purchased goods are immediately sellable
      // Auto-generate barcodes using the purchase batch prefix
      const { uid: uidFn } = await import('../utils/helpers');
      const invVals: string[] = [];
      const invPs: unknown[] = [];
      let invIdx = 1;
      for (const u of purchaseRows) {
        if (u.qtyStock) continue;
        for (let i = 0; i < u.qty; i++) {
          const invId = `PI-${batchId}-${invVals.length + 1}`;
          const barcode = `${batchId}-${String(invVals.length + 1).padStart(4, '0')}`;
          invVals.push(
            `($${invIdx},$${invIdx + 1},$${invIdx + 2},$${invIdx + 3},$${invIdx + 4},$${invIdx + 5},$${invIdx + 6})`,
          );
          invPs.push(invId, u.productId, barcode, batchId, 'InStock', tenantId, 'piece');
          invIdx += 7;
        }
      }
      // Chunk at 5000 rows to stay under PG's 65535 param limit
      const INV_CHUNK = 5000;
      for (let off = 0; off < invVals.length; off += INV_CHUNK) {
        await client.query(
          `INSERT INTO product_inventory (id,product_id,barcode,batch_id,status,tenant_id,unit_type) VALUES ${invVals.slice(off, off + INV_CHUNK).join(',')}`,
          invPs.slice(off * 7, (off + INV_CHUNK) * 7),
        );
      }
      // Update product.stock totals
      const productQtys = new Map<string, number>();
      for (const u of purchaseRows) productQtys.set(u.productId, (productQtys.get(u.productId) || 0) + u.qty);
      for (const [pid, qty] of productQtys) {
        await client.query('UPDATE products SET stock = stock + $1 WHERE id = $2 AND tenant_id = $3', [
          qty,
          pid,
          tenantId,
        ]);
      }
      for (const u of purchaseRows) {
        if (!u.lotNumber && !u.mfgDate && !u.expiryDate) continue;
        await client.query(
          `UPDATE products SET
             batch_number = COALESCE($1, batch_number),
             manufacturing_date = COALESCE($2::date, manufacturing_date),
             expiry_date = COALESCE($3::date, expiry_date)
           WHERE id = $4 AND tenant_id = $5`,
          [u.lotNumber, u.mfgDate, u.expiryDate, u.productId, tenantId],
        );
      }

      if (paidAmount > 0) {
        const payId = uid('SP');
        await client.query(
          'INSERT INTO supplier_payments (id, tenant_id, supplier_id, amount, payment_date, payment_method, notes, batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
          [payId, tenantId, supplierId, paidAmount, date, 'Cash', `Payment with purchase ${batchId}`, batchId],
        );
        await withBooks(async () => {
          await postPurchaseBatchToBooks(client, tenantId, {
            batchId,
            supplierId,
            supplierName: supplier.name,
            billValue: totalBilled,
            purchaseDate: date,
            taxableValue: totalTaxable,
            taxAmount: totalTax,
            isRcm,
            buyerGstin: supplier.gst_number,
          });
          await postSupplierPaymentToBooks(client, tenantId, {
            id: payId,
            amount: paidAmount,
            paymentDate: date,
            paymentMethod: 'Cash',
            notes: `Payment with purchase ${batchId}`,
            supplierId,
            supplierName: supplier.name,
          });
        }, 'purchase-batch-with-payment');
      } else {
        await withBooks(
          () =>
            postPurchaseBatchToBooks(client, tenantId, {
              batchId,
              supplierId,
              supplierName: supplier.name,
              billValue: totalBilled,
              purchaseDate: date,
              taxableValue: totalTaxable,
              taxAmount: totalTax,
              isRcm,
              buyerGstin: supplier.gst_number,
            }),
          'purchase-batch',
        );
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await logAudit(
      pool,
      tenantId,
      'Purchase Created',
      'purchase',
      batchId,
      `${totalQty} units from ${supplier.name}, Bill: ₹${totalBilled}`,
    );

    res.status(201).json({
      batchId,
      supplierId,
      supplierName: supplier.name,
      purchaseDate: date,
      productNames: [...new Set(productNames)],
      total: totalQty,
      billValue: totalBilled,
      amountPaid: paidAmount,
      balanceRemaining: totalBilled - paidAmount,
      isRcm,
      invoiceNumber: resolvedInvoiceNumber || null,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/purchases/batches', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    // CSV handled after data is fetched — falls through to shared logic below
    const { supplierId } = req.query;
    let sql = `
      SELECT pp.batch_id, pp.supplier_id, s.name as supplier_name, MIN(pp.purchase_date) as purchase_date,
        COUNT(*) as total, SUM(COALESCE(pp.billed_price, pp.cost_price)) as bill_value,
        STRING_AGG(DISTINCT p.name, ',') as product_names,
        BOOL_OR(COALESCE(pp.is_rcm, false)) as is_rcm,
        MAX(pp.invoice_number) as invoice_number
      FROM product_purchases pp
      JOIN products p ON pp.product_id = p.id AND p.tenant_id = $1
      JOIN suppliers s ON pp.supplier_id = s.id AND s.tenant_id = $1
      WHERE pp.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let idx = 1;
    if (typeof supplierId === 'string' && supplierId) {
      idx++;
      sql += ` AND pp.supplier_id = $${idx}`;
      params.push(supplierId);
    }
    sql += ' GROUP BY pp.batch_id, pp.supplier_id, s.name ORDER BY MIN(pp.purchase_date) DESC';
    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];

    const batchIds = rows.map(r => r.batch_id as string);
    const paymentMap: Record<string, number> = {};
    if (batchIds.length > 0) {
      const payRows = (
        await pool.query(
          'SELECT batch_id, SUM(amount) as total_paid FROM supplier_payments WHERE batch_id = ANY($1) AND tenant_id = $2 GROUP BY batch_id',
          [batchIds, tenantId],
        )
      ).rows as { batch_id: string; total_paid: string }[];
      for (const pr of payRows) paymentMap[pr.batch_id] = Number(pr.total_paid);
    }

    const mapped = rows.map(r => {
      const paid = paymentMap[r.batch_id as string] ?? 0;
      const billVal = Number(r.bill_value);
      return {
        batchId: r.batch_id,
        supplierId: r.supplier_id,
        supplierName: r.supplier_name,
        purchaseDate: r.purchase_date,
        productNames: ((r.product_names as string) || '').split(',').filter(Boolean),
        total: Number(r.total),
        billValue: billVal,
        amountPaid: paid,
        balanceRemaining: billVal - paid,
        isRcm: !!r.is_rcm,
        invoiceNumber: (r.invoice_number as string) || null,
      };
    });

    if (req.query.format === 'csv') {
      const csvStr = [
        'Date,Supplier,Invoice No,Products,Bill Value,Amount Paid,Balance,RCM',
        ...mapped.map(r =>
          [
            r.purchaseDate,
            r.supplierName,
            r.invoiceNumber || '',
            r.productNames.join('; '),
            r.billValue.toFixed(2),
            r.amountPaid.toFixed(2),
            r.balanceRemaining.toFixed(2),
            r.isRcm ? 'Yes' : 'No',
          ]
            .map(v => `"${String(v ?? '').replace(/"/g, '""')}"`)
            .join(','),
        ),
      ].join('\r\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="purchase-register-${new Date().toISOString().slice(0, 10)}.csv"`,
      );
      return res.send('﻿' + csvStr);
    }

    res.json(mapped);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/purchases/batch/:batchId', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { batchId } = req.params;

    const rows = (
      await pool.query(
        `
      SELECT pp.product_id, pp.cost_price, pp.gst_applied, pp.discount_percent, pp.billed_price,
             p.name as product_name, p.price
      FROM product_purchases pp
      JOIN products p ON pp.product_id = p.id AND p.tenant_id = $1
      WHERE pp.batch_id = $2 AND pp.tenant_id = $1
    `,
        [tenantId, batchId],
      )
    ).rows as Record<string, unknown>[];
    if (rows.length === 0) return res.status(404).json({ error: 'Purchase batch not found' });

    const batch = (
      await pool.query(
        `
      SELECT pp.batch_id, pp.supplier_id, s.name as supplier_name, MIN(pp.purchase_date) as purchase_date,
        COUNT(*) as total, SUM(COALESCE(pp.billed_price, pp.cost_price)) as bill_value,
        STRING_AGG(DISTINCT p.name, ',') as product_names,
        BOOL_OR(COALESCE(pp.is_rcm, false)) as is_rcm,
        MAX(pp.invoice_number) as invoice_number
      FROM product_purchases pp
      JOIN products p ON pp.product_id = p.id AND p.tenant_id = $1
      JOIN suppliers s ON pp.supplier_id = s.id AND s.tenant_id = $1
      WHERE pp.batch_id = $2 AND pp.tenant_id = $1
      GROUP BY pp.batch_id, pp.supplier_id, s.name
    `,
        [tenantId, batchId],
      )
    ).rows[0] as Record<string, unknown>;

    const groups: Record<
      string,
      {
        productId: string;
        productName: string;
        quantity: number;
        costPrice: number;
        billedPrice: number;
        discountPercent: number;
        withGst: boolean;
      }
    > = {};
    for (const r of rows) {
      const pid = r.product_id as string;
      if (!groups[pid])
        groups[pid] = {
          productId: pid,
          productName: r.product_name as string,
          quantity: 0,
          costPrice: Number(r.cost_price),
          billedPrice: Number(r.billed_price ?? r.cost_price),
          discountPercent: Number(r.discount_percent) || 0,
          withGst: !!r.gst_applied,
        };
      groups[pid].quantity++;
    }

    const batchPaid = Number(
      (
        await pool.query(
          'SELECT COALESCE(SUM(amount), 0) as t FROM supplier_payments WHERE batch_id = $1 AND tenant_id = $2',
          [batchId, tenantId],
        )
      ).rows[0]?.t ?? 0,
    );
    const billValue = Number(batch.bill_value);

    res.json({
      batchId,
      supplierId: batch.supplier_id,
      supplierName: batch.supplier_name,
      purchaseDate: batch.purchase_date,
      productNames: String(batch.product_names || '')
        .split(',')
        .filter(Boolean),
      total: Number(batch.total),
      billValue,
      amountPaid: batchPaid,
      balanceRemaining: billValue - batchPaid,
      isRcm: !!batch.is_rcm,
      invoiceNumber: (batch.invoice_number as string) || null,
      items: Object.values(groups),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// ============ SUPPLIER FINANCE ============

router.get('/api/supplier-finance/summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const suppliers = (
      await pool.query(
        `
      SELECT s.id, s.name, s.phone,
        COALESCE((SELECT SUM(COALESCE(pp.billed_price, pp.cost_price)) FROM product_purchases pp WHERE pp.supplier_id = s.id AND pp.tenant_id = $1), 0) as total_purchased_value,
        COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id = s.id AND tenant_id = $1), 0) as total_paid,
        (SELECT COUNT(*) FROM product_purchases WHERE supplier_id = s.id AND tenant_id = $1) as units_purchased
      FROM suppliers s WHERE s.tenant_id = $1 ORDER BY s.name
    `,
        [tenantId],
      )
    ).rows as Record<string, unknown>[];
    res.json(
      suppliers.map(s => {
        const purchased = Number(s.total_purchased_value) || 0;
        const paid = Number(s.total_paid) || 0;
        return {
          supplierId: s.id,
          supplierName: s.name,
          supplierPhone: s.phone ?? '',
          totalPurchasedValue: purchased,
          totalPaid: paid,
          balance: purchased - paid,
          unitsPurchased: Number(s.units_purchased) || 0,
        };
      }),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/supplier-finance/:supplierId', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { supplierId } = req.params;
    const supplier = (
      await pool.query('SELECT * FROM suppliers WHERE id = $1 AND tenant_id = $2', [supplierId, tenantId])
    ).rows[0] as Record<string, unknown> | undefined;
    if (!supplier) return res.status(404).json({ error: 'Supplier not found' });
    const totalValue =
      Number(
        (
          await pool.query(
            'SELECT COALESCE(SUM(COALESCE(billed_price, cost_price)), 0) as t FROM product_purchases WHERE supplier_id = $1 AND tenant_id = $2',
            [supplierId, tenantId],
          )
        ).rows[0]?.t ?? 0,
      ) || 0;
    const totalPaid =
      Number(
        (
          await pool.query(
            'SELECT COALESCE(SUM(amount), 0) as t FROM supplier_payments WHERE supplier_id = $1 AND tenant_id = $2',
            [supplierId, tenantId],
          )
        ).rows[0]?.t ?? 0,
      ) || 0;
    const payments = (
      await pool.query(
        'SELECT * FROM supplier_payments WHERE supplier_id = $1 AND tenant_id = $2 ORDER BY payment_date DESC',
        [supplierId, tenantId],
      )
    ).rows as Record<string, unknown>[];
    res.json({
      supplier: {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        email: supplier.email,
        address: supplier.address,
        gstNumber: supplier.gst_number,
      },
      totalPurchasedValue: totalValue,
      totalPaid,
      balance: totalValue - totalPaid,
      payments: payments.map(p => ({
        id: p.id,
        amount: Number(p.amount),
        paymentDate: p.payment_date,
        paymentMethod: p.payment_method,
        referenceNumber: p.reference_number,
        notes: p.notes,
      })),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/supplier-finance/:supplierId/payments', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { supplierId } = req.params;
    const { amount, paymentDate, paymentMethod, referenceNumber, notes, batchId } = req.body;
    const parsedAmount = Number(amount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0)
      return res.status(400).json({ error: 'Amount must be a valid number greater than 0' });
    if (parsedAmount > 100000000) return res.status(400).json({ error: 'Amount exceeds maximum limit' });

    await client.query('BEGIN');

    await setTenantContext(client, tenantId);
    const supplier = (
      await client.query('SELECT id, name FROM suppliers WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [
        supplierId,
        tenantId,
      ])
    ).rows[0] as { id: string; name: string } | undefined;
    if (!supplier) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Supplier not found' });
    }

    if (batchId) {
      const batchDue = (
        await client.query(
          `SELECT
           SUM(COALESCE(pp.billed_price, pp.cost_price, 0)) as bill_value,
           COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.batch_id = $1 AND sp.supplier_id = $2 AND sp.tenant_id = $3), 0) as paid
         FROM product_purchases pp
         WHERE pp.batch_id = $1 AND pp.supplier_id = $2 AND pp.tenant_id = $3`,
          [batchId, supplierId, tenantId],
        )
      ).rows[0] as { bill_value: string | number | null; paid: string | number } | undefined;
      if (!batchDue || batchDue.bill_value == null || Number(batchDue.bill_value) <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Batch does not belong to this supplier' });
      }
      const remaining = Number(batchDue.bill_value) - Number(batchDue.paid);
      if (remaining <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Batch is already fully paid' });
      }
      if (parsedAmount > remaining + 0.01) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Amount exceeds remaining balance of ₹${remaining.toFixed(2)}` });
      }
    } else {
      const due = (
        await client.query(
          `SELECT
           COALESCE((SELECT SUM(COALESCE(pp.billed_price, pp.cost_price, 0)) FROM product_purchases pp WHERE pp.supplier_id = $1 AND pp.tenant_id = $2), 0) as bill_value,
           COALESCE((SELECT SUM(sp.amount) FROM supplier_payments sp WHERE sp.supplier_id = $1 AND sp.tenant_id = $2), 0) as paid`,
          [supplierId, tenantId],
        )
      ).rows[0] as { bill_value: string | number; paid: string | number };
      const remaining = Number(due.bill_value) - Number(due.paid);
      if (remaining <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Supplier balance is already fully paid' });
      }
      if (parsedAmount > remaining + 0.01) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Amount exceeds remaining balance of ₹${remaining.toFixed(2)}` });
      }
    }

    const id = uid('SP');
    await client.query(
      'INSERT INTO supplier_payments (id, tenant_id, supplier_id, amount, payment_date, payment_method, reference_number, notes, batch_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
      [
        id,
        tenantId,
        supplierId,
        parsedAmount,
        paymentDate || new Date().toISOString().slice(0, 10),
        paymentMethod || 'Cash',
        referenceNumber || null,
        notes || null,
        batchId || null,
      ],
    );
    await withBooks(
      () =>
        postSupplierPaymentToBooks(client, tenantId, {
          id,
          amount: parsedAmount,
          paymentDate: paymentDate || new Date().toISOString().slice(0, 10),
          paymentMethod: paymentMethod || 'Cash',
          referenceNumber: referenceNumber || null,
          notes: notes || null,
          supplierId,
          supplierName: supplier.name,
        }),
      'supplier-payment',
    );
    await client.query('COMMIT');
    const row = (await pool.query('SELECT * FROM supplier_payments WHERE id = $1 AND tenant_id = $2', [id, tenantId]))
      .rows[0] as Record<string, unknown>;
    res.status(201).json({
      id: row.id,
      amount: Number(row.amount),
      paymentDate: row.payment_date,
      paymentMethod: row.payment_method,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, err);
  } finally {
    client.release();
  }
});

export default router;
