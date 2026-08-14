import { Router } from 'express';
import { blockVendors } from '../middleware/auth';
import { pool } from '../pg-db';
import { DISTRIBUTION_BILL_UNIT_SQL, INVOICE_IS_GST_SQL, gstFromExclusive, splitGst } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { foldVendorAdvancesIntoOutstanding, type OutstandingPartyAgg } from '../services/outstandingAdvances';

const router = Router();

// Reports are staff-only — Vendors must not see full-tenant registers
router.use(blockVendors);

type OutstandingAgeBucket = '0-30' | '31-60' | '61-90' | '90+';

type OutstandingBillRow = {
  partyId: string;
  partyName: string;
  billId: string;
  billNumber: string;
  billDate: string;
  billed: number;
  paid: number;
  balance: number;
  days: number;
  ageBucket: OutstandingAgeBucket;
};

function outstandingAge(days: number): OutstandingAgeBucket {
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

function daysSince(dateStr: string, now: Date): number {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 86400000));
}

router.get('/api/reports/sales-register', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { from, to, vendorId, productId } = req.query;
    let sql = `
      SELECT ps.id, ps.barcode, ps.purchase_date, ps.customer_name, ps.customer_phone, ps.sale_price,
             p.name as product_name, p.hsn_code, p.price as product_price, p.gst_rate,
             v.name as vendor_name
      FROM product_sales ps
      JOIN products p ON ps.product_id = p.id AND p.tenant_id = $1
      LEFT JOIN vendors v ON ps.vendor_id = v.id AND v.tenant_id = $1
      WHERE ps.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let idx = 1;
    if (from) {
      idx++;
      sql += ` AND ps.purchase_date >= $${idx}`;
      params.push(from);
    }
    if (to) {
      idx++;
      sql += ` AND ps.purchase_date <= $${idx}`;
      params.push(to);
    }
    if (vendorId) {
      idx++;
      sql += ` AND ps.vendor_id = $${idx}`;
      params.push(vendorId);
    }
    if (productId) {
      idx++;
      sql += ` AND ps.product_id = $${idx}`;
      params.push(productId);
    }
    sql += ' ORDER BY ps.purchase_date DESC, ps.id DESC';

    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    // sale_price is taxable (exclusive) — matches tax invoice print
    const mapped = rows.map(r => {
      const taxable = Number(r.sale_price ?? r.product_price ?? 0);
      const gstRate = Number(r.gst_rate ?? 18);
      const { tax: gstAmt, total } = gstFromExclusive(taxable, gstRate);
      const { cgst, sgst } = splitGst(gstAmt);
      return {
        id: r.id,
        date: r.purchase_date,
        barcode: r.barcode,
        customerName: r.customer_name,
        customerPhone: r.customer_phone,
        vendorName: r.vendor_name,
        productName: r.product_name,
        hsnCode: r.hsn_code || '',
        gstRate,
        rate: taxable,
        taxableValue: taxable,
        cgst,
        sgst,
        total,
      };
    });
    const totals = mapped.reduce(
      (acc, r) => {
        acc.taxableValue += r.taxableValue;
        acc.cgst += r.cgst;
        acc.sgst += r.sgst;
        acc.total += r.total;
        return acc;
      },
      { taxableValue: 0, cgst: 0, sgst: 0, total: 0 },
    );
    res.json({ rows: mapped, totals, count: mapped.length, pricing: 'exclusive' });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/reports/distribution-register', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { from, to, vendorId, productId } = req.query;
    let sql = `
      SELECT pd.batch_id, pd.distribution_date, pd.barcode, pd.status, pd.discount_percent,
             pd.net_price, pd.gst_applied, pd.billed_price,
             p.name as product_name, p.hsn_code, p.price as product_price, p.gst_rate,
             v.name as vendor_name, v.gst_number as vendor_gstin
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let idx = 1;
    if (from) {
      idx++;
      sql += ` AND pd.distribution_date >= $${idx}`;
      params.push(from);
    }
    if (to) {
      idx++;
      sql += ` AND pd.distribution_date <= $${idx}`;
      params.push(to);
    }
    if (vendorId) {
      idx++;
      sql += ` AND pd.vendor_id = $${idx}`;
      params.push(vendorId);
    }
    if (productId) {
      idx++;
      sql += ` AND pd.product_id = $${idx}`;
      params.push(productId);
    }
    sql += ' ORDER BY pd.distribution_date DESC, pd.batch_id DESC';

    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    const mapped = rows.map(r => {
      const netPrice = Number(r.net_price ?? r.product_price ?? 0);
      const billedPrice = Number(r.billed_price ?? netPrice);
      const gstAmt = r.gst_applied ? billedPrice - netPrice : 0;
      const halfGst = Math.round((gstAmt / 2) * 100) / 100;
      return {
        batchId: r.batch_id,
        date: r.distribution_date,
        barcode: r.barcode,
        status: r.status,
        vendorName: r.vendor_name,
        vendorGstin: r.vendor_gstin || '',
        productName: r.product_name,
        hsnCode: r.hsn_code || '',
        gstRate: Number(r.gst_rate ?? 18),
        rate: Number(r.product_price),
        discountPercent: Number(r.discount_percent ?? 0),
        taxableValue: netPrice,
        cgst: halfGst,
        sgst: gstAmt - halfGst,
        total: billedPrice,
      };
    });
    const totals = mapped.reduce(
      (acc, r) => {
        acc.taxableValue += r.taxableValue;
        acc.cgst += r.cgst;
        acc.sgst += r.sgst;
        acc.total += r.total;
        return acc;
      },
      { taxableValue: 0, cgst: 0, sgst: 0, total: 0 },
    );
    res.json({ rows: mapped, totals, count: mapped.length });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/reports/outstanding', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const businessType =
      (
        (await pool.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0] as
          { business_type?: string } | undefined
      )?.business_type || 'manufacturer';

    // Service / hotel: bill-wise party AR (Miracle invoices) — not distribution aging
    if (businessType === 'service' || businessType === 'hotel_restaurant') {
      const now = new Date();
      const open = (
        await pool.query(
          `
          SELECT
            CASE
              WHEN si.party_type IS NOT NULL AND si.party_id IS NOT NULL
                THEN si.party_type || ':' || si.party_id
              ELSE 'name:' || si.customer_name
            END AS party_key,
            si.customer_name AS party_name,
            si.id AS invoice_id,
            si.invoice_number,
            si.invoice_date,
            si.grand_total::float AS grand_total,
            COALESCE(ip.paid, 0)::float AS paid
          FROM standalone_invoices si
          LEFT JOIN (
            SELECT invoice_id, SUM(amount) AS paid
            FROM invoice_payments WHERE tenant_id = $1
            GROUP BY invoice_id
          ) ip ON si.id = ip.invoice_id
          WHERE si.tenant_id = $1
            AND si.status IS DISTINCT FROM 'cancelled'
            AND COALESCE(si.invoice_kind, 'sale') = 'sale'
            AND (si.grand_total - COALESCE(ip.paid, 0)) > 0.001
          ORDER BY si.customer_name ASC NULLS LAST, si.invoice_date ASC NULLS LAST
        `,
          [tenantId],
        )
      ).rows as {
        party_key: string;
        party_name: string;
        invoice_id: string;
        invoice_number: string;
        invoice_date: string;
        grand_total: number;
        paid: number;
      }[];

      type Agg = OutstandingPartyAgg;
      const byParty = new Map<string, Agg>();
      const bills: OutstandingBillRow[] = [];
      for (const inv of open) {
        const billed = Number(inv.grand_total) || 0;
        const paid = Number(inv.paid) || 0;
        const due = Math.round((billed - paid) * 100) / 100;
        if (due <= 0) continue;
        let row = byParty.get(inv.party_key);
        if (!row) {
          row = {
            vendorId: inv.party_key,
            vendorName: inv.party_name || 'Unknown',
            totalBilled: 0,
            totalPaid: 0,
            balance: 0,
            advanceBalance: 0,
            d0_30: 0,
            d31_60: 0,
            d61_90: 0,
            d90plus: 0,
          };
          byParty.set(inv.party_key, row);
        }
        row.totalBilled += billed;
        row.totalPaid += paid;
        row.balance += due;
        const days = daysSince(String(inv.invoice_date), now);
        const ageBucket = outstandingAge(days);
        if (ageBucket === '0-30') row.d0_30 += due;
        else if (ageBucket === '31-60') row.d31_60 += due;
        else if (ageBucket === '61-90') row.d61_90 += due;
        else row.d90plus += due;
        bills.push({
          partyId: inv.party_key,
          partyName: inv.party_name || 'Unknown',
          billId: inv.invoice_id,
          billNumber: inv.invoice_number || inv.invoice_id,
          billDate: String(inv.invoice_date).slice(0, 10),
          billed,
          paid,
          balance: due,
          days,
          ageBucket,
        });
      }

      // Service only: fold unallocated vendor_payments (Miracle advances) — same as Collections /summary
      if (businessType === 'service') {
        const vpRows = (
          await pool.query(
            `
            SELECT vp.vendor_id, v.name,
                   COALESCE(SUM(vp.amount), 0)::float AS advance
            FROM vendor_payments vp
            JOIN vendors v ON v.id = vp.vendor_id AND v.tenant_id = vp.tenant_id
            WHERE vp.tenant_id = $1
            GROUP BY vp.vendor_id, v.name
          `,
            [tenantId],
          )
        ).rows as { vendor_id: string; name: string; advance: number }[];
        foldVendorAdvancesIntoOutstanding(
          byParty,
          vpRows.map(vp => ({ vendorId: vp.vendor_id, vendorName: vp.name, advance: Number(vp.advance) || 0 })),
        );
      }

      const rows = [...byParty.values()].sort((a, b) => b.balance - a.balance);
      bills.sort((a, b) => b.days - a.days || b.balance - a.balance);
      const totals = rows.reduce(
        (acc, r) => {
          acc.totalBilled += r.totalBilled;
          acc.totalPaid += r.totalPaid;
          acc.balance += r.balance;
          acc.advanceBalance += r.advanceBalance;
          acc.d0_30 += r.d0_30;
          acc.d31_60 += r.d31_60;
          acc.d61_90 += r.d61_90;
          acc.d90plus += r.d90plus;
          return acc;
        },
        {
          totalBilled: 0,
          totalPaid: 0,
          balance: 0,
          advanceBalance: 0,
          d0_30: 0,
          d31_60: 0,
          d61_90: 0,
          d90plus: 0,
        },
      );
      return res.json({
        rows,
        bills,
        totals,
        count: rows.length,
        billCount: bills.length,
        source: 'invoice_finance',
      });
    }

    const vendors = (
      await pool.query(
        `
      SELECT v.id, v.name,
        COALESCE((SELECT SUM(${DISTRIBUTION_BILL_UNIT_SQL}) FROM product_distribution pd JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1 WHERE pd.vendor_id = v.id AND pd.tenant_id = $1), 0) as total_billed,
        COALESCE((SELECT SUM(amount) FROM vendor_payments WHERE vendor_id = v.id AND tenant_id = $1), 0) as total_paid
      FROM vendors v WHERE v.id != 'OWNER' AND v.tenant_id = $1 ORDER BY v.name
    `,
        [tenantId],
      )
    ).rows as Record<string, unknown>[];

    const now = new Date();
    const rows: {
      vendorId: unknown;
      vendorName: unknown;
      totalBilled: number;
      totalPaid: number;
      balance: number;
      d0_30: number;
      d31_60: number;
      d61_90: number;
      d90plus: number;
    }[] = [];
    const bills: OutstandingBillRow[] = [];
    for (const v of vendors) {
      const billed = Number(v.total_billed);
      const paid = Number(v.total_paid);
      const balance = billed - paid;
      if (balance <= 0) continue;

      const batches = (
        await pool.query(
          `
        SELECT COALESCE(pd.batch_id, pd.id) as batch_id, MIN(pd.distribution_date) as dist_date,
          SUM(${DISTRIBUTION_BILL_UNIT_SQL}) as batch_billed
        FROM product_distribution pd
        JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
        WHERE pd.vendor_id = $2 AND pd.tenant_id = $1
        GROUP BY COALESCE(pd.batch_id, pd.id)
        ORDER BY MIN(pd.distribution_date)
      `,
          [tenantId, v.id],
        )
      ).rows as { batch_id: string; dist_date: string; batch_billed: string }[];

      const batchPayments: Record<string, number> = {};
      const payRows = (
        await pool.query(
          'SELECT batch_id, SUM(amount) as paid FROM vendor_payments WHERE vendor_id = $1 AND tenant_id = $2 AND batch_id IS NOT NULL GROUP BY batch_id',
          [v.id, tenantId],
        )
      ).rows as { batch_id: string; paid: string }[];
      for (const pr of payRows) batchPayments[pr.batch_id] = Number(pr.paid);

      const unlinkedPaid = paid - Object.values(batchPayments).reduce((s, p) => s + p, 0);
      let remainingUnlinked = Math.max(0, unlinkedPaid);

      let d0_30 = 0,
        d31_60 = 0,
        d61_90 = 0,
        d90plus = 0;
      for (const b of batches) {
        const batchBilled = Number(b.batch_billed) || 0;
        const batchPaidLinked = batchPayments[b.batch_id] ?? 0;
        let batchBal = batchBilled - batchPaidLinked;
        let appliedUnlinked = 0;
        if (remainingUnlinked > 0 && batchBal > 0) {
          appliedUnlinked = Math.min(remainingUnlinked, batchBal);
          batchBal -= appliedUnlinked;
          remainingUnlinked -= appliedUnlinked;
        }
        if (batchBal <= 0) continue;
        const days = daysSince(String(b.dist_date), now);
        const ageBucket = outstandingAge(days);
        if (ageBucket === '0-30') d0_30 += batchBal;
        else if (ageBucket === '31-60') d31_60 += batchBal;
        else if (ageBucket === '61-90') d61_90 += batchBal;
        else d90plus += batchBal;
        bills.push({
          partyId: String(v.id),
          partyName: String(v.name || 'Unknown'),
          billId: b.batch_id,
          billNumber: b.batch_id,
          billDate: String(b.dist_date).slice(0, 10),
          billed: batchBilled,
          paid: batchPaidLinked + appliedUnlinked,
          balance: Math.round(batchBal * 100) / 100,
          days,
          ageBucket,
        });
      }
      const agingTotal = d0_30 + d31_60 + d61_90 + d90plus;
      if (agingTotal > 0 && Math.abs(agingTotal - balance) > 1) {
        const scale = balance / agingTotal;
        d0_30 = Math.round(d0_30 * scale);
        d31_60 = Math.round(d31_60 * scale);
        d61_90 = Math.round(d61_90 * scale);
        d90plus = balance - d0_30 - d31_60 - d61_90;
      }
      rows.push({
        vendorId: v.id,
        vendorName: v.name,
        totalBilled: billed,
        totalPaid: paid,
        balance,
        d0_30,
        d31_60,
        d61_90,
        d90plus,
      });
    }
    bills.sort((a, b) => b.days - a.days || b.balance - a.balance);
    const totals = rows.reduce(
      (acc, r) => {
        acc.totalBilled += r.totalBilled;
        acc.totalPaid += r.totalPaid;
        acc.balance += r.balance;
        acc.d0_30 += r.d0_30;
        acc.d31_60 += r.d31_60;
        acc.d61_90 += r.d61_90;
        acc.d90plus += r.d90plus;
        return acc;
      },
      { totalBilled: 0, totalPaid: 0, balance: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90plus: 0 },
    );
    res.json({
      rows,
      bills,
      totals,
      count: rows.length,
      billCount: bills.length,
      source: 'distribution',
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/reports/payment-register', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { from, to, vendorId, method } = req.query;
    let sql = `
      SELECT vp.id, vp.payment_date, vp.amount, vp.payment_method, vp.reference_number, vp.notes, vp.batch_id,
             v.name as vendor_name
      FROM vendor_payments vp
      JOIN vendors v ON vp.vendor_id = v.id AND v.tenant_id = $1
      WHERE vp.tenant_id = $1
    `;
    const params: unknown[] = [tenantId];
    let idx = 1;
    if (from) {
      idx++;
      sql += ` AND vp.payment_date >= $${idx}`;
      params.push(from);
    }
    if (to) {
      idx++;
      sql += ` AND vp.payment_date <= $${idx}`;
      params.push(to);
    }
    if (vendorId) {
      idx++;
      sql += ` AND vp.vendor_id = $${idx}`;
      params.push(vendorId);
    }
    if (method) {
      idx++;
      sql += ` AND vp.payment_method = $${idx}`;
      params.push(method);
    }
    sql += ' ORDER BY vp.payment_date DESC, vp.id DESC';

    const rows = (await pool.query(sql, params)).rows as Record<string, unknown>[];
    const mapped = rows.map(r => ({
      id: r.id,
      date: r.payment_date,
      vendorName: r.vendor_name,
      amount: Number(r.amount),
      method: r.payment_method,
      reference: r.reference_number || '',
      batchId: r.batch_id || '',
      notes: r.notes || '',
    }));
    const totals = { amount: mapped.reduce((s, r) => s + r.amount, 0) };
    res.json({ rows: mapped, totals, count: mapped.length });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/reports/stock-summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rows = (
      await pool.query(
        `
      SELECT p.id, p.name, p.hsn_code, p.price,
        (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.tenant_id = $1) as total_inventory,
        (SELECT COUNT(*) FROM product_inventory pi WHERE pi.product_id = p.id AND pi.status = 'InStock' AND pi.tenant_id = $1) as in_stock,
        (SELECT COUNT(*) FROM product_distribution pd WHERE pd.product_id = p.id AND pd.status = 'Distributed' AND pd.tenant_id = $1) as with_vendors,
        (SELECT COUNT(*) FROM product_distribution pd WHERE pd.product_id = p.id AND pd.status = 'Sold' AND pd.tenant_id = $1) as sold
      FROM products p WHERE p.tenant_id = $1 ORDER BY p.name
    `,
        [tenantId],
      )
    ).rows as Record<string, unknown>[];
    const mapped = rows.map(r => {
      const total = Number(r.total_inventory);
      const inStock = Number(r.in_stock);
      const withVendors = Number(r.with_vendors);
      const sold = Number(r.sold);
      const price = Number(r.price);
      return {
        id: r.id,
        name: r.name,
        hsnCode: r.hsn_code || '',
        unitPrice: price,
        totalInventory: total,
        inStock,
        withVendors,
        sold,
        closingStock: inStock + withVendors,
        stockValue: (inStock + withVendors) * price,
      };
    });
    const totals = mapped.reduce(
      (acc, r) => {
        acc.totalInventory += r.totalInventory;
        acc.inStock += r.inStock;
        acc.withVendors += r.withVendors;
        acc.sold += r.sold;
        acc.closingStock += r.closingStock;
        acc.stockValue += r.stockValue;
        return acc;
      },
      { totalInventory: 0, inStock: 0, withVendors: 0, sold: 0, closingStock: 0, stockValue: 0 },
    );
    res.json({ rows: mapped, totals, count: mapped.length });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/reports/gst-summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { month, year } = req.query;
    const m = parseInt(String(month), 10) || new Date().getMonth() + 1;
    const y = parseInt(String(year), 10) || new Date().getFullYear();
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

    const distRows = (
      await pool.query(
        `
      SELECT v.name as vendor_name, v.gst_number as vendor_gstin,
             p.name as product_name, p.hsn_code, p.gst_rate,
             pd.batch_id, pd.net_price, pd.billed_price, pd.gst_applied
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.tenant_id = $1 AND pd.distribution_date >= $2 AND pd.distribution_date < $3
      ORDER BY v.name, pd.batch_id
    `,
        [tenantId, startDate, endDate],
      )
    ).rows as Record<string, unknown>[];

    const b2b: Record<
      string,
      {
        vendorName: string;
        gstin: string;
        taxable: number;
        cgst: number;
        sgst: number;
        total: number;
        invoiceCount: number;
      }
    > = {};
    let b2cTaxable = 0,
      b2cCgst = 0,
      b2cSgst = 0,
      b2cTotal = 0;
    const hsnMap: Record<
      string,
      { hsn: string; description: string; qty: number; taxable: number; cgst: number; sgst: number; total: number }
    > = {};

    for (const r of distRows) {
      // Align with accounts GSTR-3B: only gst_applied distribution is taxable outward
      if (!r.gst_applied) continue;
      const net = Number(r.net_price ?? 0);
      const billed = Number(r.billed_price ?? net);
      const gstAmt = billed - net;
      const halfGst = Math.round((gstAmt / 2) * 100) / 100;
      const gstin = (r.vendor_gstin as string) || '';
      const hsn = (r.hsn_code as string) || 'N/A';

      if (gstin) {
        if (!b2b[gstin])
          b2b[gstin] = {
            vendorName: r.vendor_name as string,
            gstin,
            taxable: 0,
            cgst: 0,
            sgst: 0,
            total: 0,
            invoiceCount: 0,
          };
        b2b[gstin].taxable += net;
        b2b[gstin].cgst += halfGst;
        b2b[gstin].sgst += gstAmt - halfGst;
        b2b[gstin].total += billed;
        b2b[gstin].invoiceCount++;
      } else {
        b2cTaxable += net;
        b2cCgst += halfGst;
        b2cSgst += gstAmt - halfGst;
        b2cTotal += billed;
      }

      if (!hsnMap[hsn])
        hsnMap[hsn] = { hsn, description: r.product_name as string, qty: 0, taxable: 0, cgst: 0, sgst: 0, total: 0 };
      hsnMap[hsn].qty++;
      hsnMap[hsn].taxable += net;
      hsnMap[hsn].cgst += halfGst;
      hsnMap[hsn].sgst += gstAmt - halfGst;
      hsnMap[hsn].total += billed;
    }

    // GST-enabled standalone invoices (service / Offline-style bills)
    const invRows = (
      await pool.query(
        `
      SELECT si.customer_name, si.customer_gstin, si.subtotal, si.tax_total, si.grand_total, si.items
      FROM standalone_invoices si
      WHERE si.tenant_id = $1 AND si.invoice_date >= $2 AND si.invoice_date < $3
        AND si.status NOT IN ('cancelled','draft')
        AND ${INVOICE_IS_GST_SQL}
    `,
        [tenantId, startDate, endDate],
      )
    ).rows as Record<string, unknown>[];

    for (const inv of invRows) {
      const taxable = Number(inv.subtotal) || 0;
      const tax = Number(inv.tax_total) || 0;
      const { cgst, sgst } = splitGst(tax);
      const gstin = String(inv.customer_gstin || '');
      const billed = Number(inv.grand_total) || taxable + tax;
      if (gstin && gstin.length >= 15) {
        if (!b2b[gstin])
          b2b[gstin] = {
            vendorName: String(inv.customer_name || 'Customer'),
            gstin,
            taxable: 0,
            cgst: 0,
            sgst: 0,
            total: 0,
            invoiceCount: 0,
          };
        b2b[gstin].taxable += taxable;
        b2b[gstin].cgst += cgst;
        b2b[gstin].sgst += sgst;
        b2b[gstin].total += billed;
        b2b[gstin].invoiceCount++;
      } else {
        b2cTaxable += taxable;
        b2cCgst += cgst;
        b2cSgst += sgst;
        b2cTotal += billed;
      }
      const items = Array.isArray(inv.items) ? inv.items : [];
      for (const it of items as {
        hsnSac?: string;
        description?: string;
        qty?: number;
        taxable?: number;
        tax?: number;
        total?: number;
      }[]) {
        const hsn = String(it.hsnSac || 'N/A');
        const lineTaxable = Number(it.taxable) || 0;
        const lineTax = Number(it.tax) || 0;
        const half = Math.round((lineTax / 2) * 100) / 100;
        if (!hsnMap[hsn])
          hsnMap[hsn] = {
            hsn,
            description: String(it.description || inv.customer_name || 'Invoice'),
            qty: 0,
            taxable: 0,
            cgst: 0,
            sgst: 0,
            total: 0,
          };
        hsnMap[hsn].qty += Number(it.qty) || 1;
        hsnMap[hsn].taxable += lineTaxable;
        hsnMap[hsn].cgst += half;
        hsnMap[hsn].sgst += lineTax - half;
        hsnMap[hsn].total += Number(it.total) || lineTaxable + lineTax;
      }
    }

    res.json({
      period: `${String(m).padStart(2, '0')}/${y}`,
      b2b: Object.values(b2b),
      b2c: { taxable: b2cTaxable, cgst: b2cCgst, sgst: b2cSgst, total: b2cTotal },
      hsnSummary: Object.values(hsnMap),
      totalTaxable: Object.values(b2b).reduce((s, v) => s + v.taxable, 0) + b2cTaxable,
      totalTax: Object.values(b2b).reduce((s, v) => s + v.cgst + v.sgst, 0) + b2cCgst + b2cSgst,
      totalValue: Object.values(b2b).reduce((s, v) => s + v.total, 0) + b2cTotal,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// GSTR-1 JSON export (GST Return format)
router.get('/api/reports/gstr1', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { month, year } = req.query;
    const m = parseInt(String(month), 10) || new Date().getMonth() + 1;
    const y = parseInt(String(year), 10) || new Date().getFullYear();
    const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
    const endDate = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const period = `${String(m).padStart(2, '0')}${y}`;

    const tenant = (await pool.query('SELECT company_name, gst_number FROM tenants WHERE id = $1', [tenantId]))
      .rows[0] as { company_name: string; gst_number: string | null } | undefined;
    const user = (
      await pool.query("SELECT gst_number FROM users WHERE tenant_id = $1 AND role = 'Admin' LIMIT 1", [tenantId])
    ).rows[0] as { gst_number: string | null } | undefined;
    const sellerGstin = tenant?.gst_number || user?.gst_number || '';

    const distRows = (
      await pool.query(
        `
      SELECT pd.batch_id, pd.distribution_date, pd.net_price, pd.billed_price, pd.gst_applied, pd.discount_percent,
             p.name as product_name, p.hsn_code, p.gst_rate, p.price as product_price,
             v.name as vendor_name, v.gst_number as vendor_gstin, v.id as vendor_id
      FROM product_distribution pd
      JOIN products p ON pd.product_id = p.id AND p.tenant_id = $1
      JOIN vendors v ON pd.vendor_id = v.id AND v.tenant_id = $1
      WHERE pd.tenant_id = $1 AND pd.distribution_date >= $2 AND pd.distribution_date < $3
      ORDER BY pd.distribution_date, pd.batch_id
    `,
        [tenantId, startDate, endDate],
      )
    ).rows as Record<string, unknown>[];

    // GST-enabled standalone invoices only (non-GST invoices are not outward supplies)
    const invDocRows = (
      await pool.query(
        `
      SELECT si.id, si.invoice_number, si.invoice_date, si.customer_name, si.customer_gstin,
             si.subtotal, si.tax_total, si.grand_total, si.items
      FROM standalone_invoices si
      WHERE si.tenant_id = $1 AND si.invoice_date >= $2 AND si.invoice_date < $3
        AND si.status NOT IN ('cancelled','draft')
        AND ${INVOICE_IS_GST_SQL}
    `,
        [tenantId, startDate, endDate],
      )
    ).rows as Record<string, unknown>[];

    // Credit notes for CDNR — only for registered buyers (vendor_id present with GSTIN)
    // Unregistered buyer credit notes belong in CDNS (not yet implemented); include here
    // only when a vendor with a GSTIN can be resolved. Fixes GSTN portal rejection.
    const cnRows = (
      await pool.query(
        `
      SELECT cdn.note_number, cdn.note_date, cdn.customer_name, cdn.vendor_name,
             cdn.subtotal, cdn.gst_amount, cdn.total, cdn.reference_invoice, cdn.gst_rate,
             v.gst_number AS vendor_gstin
      FROM credit_debit_notes cdn
      LEFT JOIN vendors v ON v.id = cdn.vendor_id AND v.tenant_id = cdn.tenant_id
      WHERE cdn.tenant_id = $1 AND cdn.note_date >= $2 AND cdn.note_date < $3
        AND cdn.note_type = 'credit'
        AND v.gst_number IS NOT NULL AND LENGTH(v.gst_number) >= 15
    `,
        [tenantId, startDate, endDate],
      )
    ).rows as Record<string, unknown>[];

    // Group by batch (invoice) for B2B
    const invoiceMap: Record<
      string,
      {
        batchId: string;
        date: string;
        vendorName: string;
        gstin: string;
        items: {
          hsn: string;
          name: string;
          qty: number;
          rate: number;
          taxable: number;
          cgst: number;
          sgst: number;
          total: number;
        }[];
      }
    > = {};
    const b2cItems: {
      hsn: string;
      name: string;
      qty: number;
      taxable: number;
      cgst: number;
      sgst: number;
      total: number;
    }[] = [];
    const hsnMap: Record<
      string,
      {
        hsn: string;
        desc: string;
        uqc: string;
        qty: number;
        taxable: number;
        igst: number;
        cgst: number;
        sgst: number;
        rate: number;
      }
    > = {};

    for (const r of distRows) {
      // Align with accounts: non-gst_applied distribution is not taxable outward supply
      if (!r.gst_applied) continue;
      const net = Number(r.net_price) || Number(r.product_price) || 0;
      const billed = Number(r.billed_price) || net;
      const gstAmt = billed - net;
      const halfGst = Math.round((gstAmt / 2) * 100) / 100;
      const gstin = (r.vendor_gstin as string) || '';
      const hsn = (r.hsn_code as string) || '';
      const gstRate = Number(r.gst_rate) || 18;
      const batchId = r.batch_id as string;

      // HSN summary (GST-applied distribution only)
      if (hsn) {
        if (!hsnMap[hsn])
          hsnMap[hsn] = {
            hsn,
            desc: r.product_name as string,
            uqc: 'PCS',
            qty: 0,
            taxable: 0,
            igst: 0,
            cgst: 0,
            sgst: 0,
            rate: gstRate,
          };
        hsnMap[hsn].qty++;
        hsnMap[hsn].taxable += net;
        hsnMap[hsn].cgst += halfGst;
        hsnMap[hsn].sgst += gstAmt - halfGst;
      }

      if (gstin && gstin.length >= 15) {
        // B2B — group by invoice (batch)
        const key = `${gstin}:${batchId}`;
        if (!invoiceMap[key])
          invoiceMap[key] = {
            batchId,
            date: r.distribution_date as string,
            vendorName: r.vendor_name as string,
            gstin,
            items: [],
          };
        const existing = invoiceMap[key].items.find(i => i.hsn === hsn && i.rate === gstRate);
        if (existing) {
          existing.qty++;
          existing.taxable += net;
          existing.cgst += halfGst;
          existing.sgst += gstAmt - halfGst;
          existing.total += billed;
        } else {
          invoiceMap[key].items.push({
            hsn,
            name: r.product_name as string,
            qty: 1,
            rate: gstRate,
            taxable: net,
            cgst: halfGst,
            sgst: gstAmt - halfGst,
            total: billed,
          });
        }
      } else {
        // B2C
        b2cItems.push({
          hsn,
          name: r.product_name as string,
          qty: 1,
          taxable: net,
          cgst: halfGst,
          sgst: gstAmt - halfGst,
          total: billed,
        });
      }
    }

    // Format B2B invoices (GSTR-1 Table 4)
    const b2bByGstin: Record<
      string,
      {
        ctin: string;
        cfs: string;
        inv: {
          inum: string;
          idt: string;
          val: number;
          pos: string;
          rchrg: string;
          inv_typ: string;
          itms: { num: number; itm_det: { rt: number; txval: number; camt: number; samt: number; iamt: number } }[];
        }[];
      }
    > = {};
    for (const inv of Object.values(invoiceMap)) {
      if (!b2bByGstin[inv.gstin]) b2bByGstin[inv.gstin] = { ctin: inv.gstin, cfs: 'Y', inv: [] };
      const invTotal = inv.items.reduce((s, i) => s + i.total, 0);
      const fmtDate = new Date(inv.date)
        .toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        .replace(/\//g, '-');
      b2bByGstin[inv.gstin].inv.push({
        inum: `INV-${inv.batchId}`,
        idt: fmtDate,
        val: invTotal,
        pos: inv.gstin.substring(0, 2),
        rchrg: 'N',
        inv_typ: 'R',
        itms: inv.items.map((item, idx) => ({
          num: idx + 1,
          itm_det: { rt: item.rate, txval: item.taxable, camt: item.cgst, samt: item.sgst, iamt: 0 },
        })),
      });
    }

    // Format B2C Small (GSTR-1 Table 7)
    const b2csGrouped: Record<string, { rt: number; txval: number; camt: number; samt: number; iamt: number }> = {};
    for (const item of b2cItems) {
      const rate = item.taxable > 0 ? Math.round(((item.cgst + item.sgst) / item.taxable) * 100) : 0;
      const key = `${rate}`;
      if (!b2csGrouped[key]) b2csGrouped[key] = { rt: rate, txval: 0, camt: 0, samt: 0, iamt: 0 };
      b2csGrouped[key].txval += item.taxable;
      b2csGrouped[key].camt += item.cgst;
      b2csGrouped[key].samt += item.sgst;
    }

    // Format HSN Summary (GSTR-1 Table 12)
    const hsnData = Object.values(hsnMap).map((h, i) => ({
      num: i + 1,
      hsn_sc: h.hsn,
      desc: h.desc,
      uqc: h.uqc,
      qty: h.qty,
      txval: h.taxable,
      iamt: 0,
      camt: h.cgst,
      samt: h.sgst,
      rt: h.rate,
    }));

    // Append standalone invoices into B2B / B2CS
    for (const inv of invDocRows) {
      const gstin = String(inv.customer_gstin || '');
      const taxable = Number(inv.subtotal) || 0;
      const tax = Number(inv.tax_total) || 0;
      const { cgst, sgst, igst } = splitGst(tax, sellerGstin, gstin);
      const fmtDate = new Date(inv.invoice_date as string)
        .toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        .replace(/\//g, '-');
      if (gstin && gstin.length >= 15) {
        if (!b2bByGstin[gstin]) b2bByGstin[gstin] = { ctin: gstin, cfs: 'Y', inv: [] };
        b2bByGstin[gstin].inv.push({
          inum: String(inv.invoice_number),
          idt: fmtDate,
          val: Number(inv.grand_total) || 0,
          pos: gstin.substring(0, 2),
          rchrg: 'N',
          inv_typ: 'R',
          itms: [
            {
              num: 1,
              itm_det: {
                rt: taxable > 0 ? Math.round((tax / taxable) * 100) : 0,
                txval: taxable,
                camt: cgst,
                samt: sgst,
                iamt: igst,
              },
            },
          ],
        });
      } else {
        const rate = taxable > 0 ? Math.round((tax / taxable) * 100) : 0;
        const key = `${rate}`;
        if (!b2csGrouped[key]) b2csGrouped[key] = { rt: rate, txval: 0, camt: 0, samt: 0, iamt: 0 };
        b2csGrouped[key].txval += taxable;
        b2csGrouped[key].camt += cgst;
        b2csGrouped[key].samt += sgst;
        b2csGrouped[key].iamt += igst;
      }
    }

    const cdnr = cnRows.map(n => {
      const tax = Number(n.gst_amount) || 0;
      const taxable = Number(n.subtotal) || 0;
      const half = Math.round((tax / 2) * 100) / 100;
      return {
        nt_num: String(n.note_number),
        nt_dt: n.note_date,
        ntty: 'C',
        rsn: '01',
        val: Number(n.total) || 0,
        itms: [
          {
            num: 1,
            itm_det: {
              rt: Number(n.gst_rate) || 18,
              txval: taxable,
              camt: half,
              samt: Math.round((tax - half) * 100) / 100,
              iamt: 0,
            },
          },
        ],
        ref: n.reference_invoice || null,
        party: n.customer_name || n.vendor_name || null,
      };
    });

    // gt = total invoice value for the period (B2B + B2CS + credit notes net)
    const totalB2B = Object.values(b2bByGstin).reduce(
      (s, g) => s + g.inv.reduce((is, inv) => is + Number(inv.val || 0), 0),
      0,
    );
    const totalB2CS = Object.values(b2csGrouped).reduce((s, g) => s + (g.txval + g.camt + g.samt + g.iamt), 0);
    const totalCDNR = cnRows.reduce((s, n) => s - Number(n.total || 0), 0); // deduct credit notes
    const gt = Math.round((totalB2B + totalB2CS + totalCDNR) * 100) / 100;

    const gstr1 = {
      gstin: sellerGstin,
      fp: period,
      gt,
      cur_gt: gt,
      disclaimer: 'Working draft for internal use — verify before GST portal upload.',
      b2b: Object.values(b2bByGstin),
      b2cs: Object.values(b2csGrouped).map(g => ({
        ...g,
        sply_ty: g.iamt > 0 ? 'INTER' : 'INTRA',
        pos: sellerGstin.substring(0, 2) || '24',
        typ: 'OE',
      })),
      cdnr,
      hsn: { data: hsnData },
      nil: {
        inv: [
          { sply_ty: 'INTRB2B', nil_amt: 0, expt_amt: 0, ngsup_amt: 0 },
          { sply_ty: 'INTRB2C', nil_amt: 0, expt_amt: 0, ngsup_amt: 0 },
        ],
      },
      doc_issue: {
        doc_det: [
          {
            doc_num: 1,
            docs: [
              {
                num: 1,
                from: invDocRows[0]?.invoice_number || `INV-${distRows[0]?.batch_id || '0'}`,
                to:
                  invDocRows[invDocRows.length - 1]?.invoice_number ||
                  `INV-${distRows[distRows.length - 1]?.batch_id || '0'}`,
                totnum: Object.keys(invoiceMap).length + invDocRows.length,
                cancel: 0,
                net_issue: Object.keys(invoiceMap).length + invDocRows.length,
              },
            ],
          },
        ],
      },
    };

    res.json(gstr1);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
