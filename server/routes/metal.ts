import { Router } from 'express';
import { blockVendors, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { barcodeExists, generateBarcodesFromPrefix } from '../utils/barcode';
import { checkPlanLimit } from '../utils/planLimits';
import { computeFineWeight, computeMakingAmount, computeMetalSalePrice } from '../../shared/metal';

const router = Router();

async function getBusinessType(tenantId: string): Promise<string> {
  const row = (await pool.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0] as
    { business_type: string } | undefined;
  return row?.business_type || 'manufacturer';
}

/** POST /api/metal/intake — weigh one piece → barcode → inventory row */
router.post('/api/metal/intake', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const bizType = await getBusinessType(tenantId);
    if (bizType !== 'silver_casting') {
      return res.status(403).json({ error: 'Metal intake is only available for Silver Casting tenants' });
    }

    const {
      productId,
      grossWeight,
      netWeight,
      purity,
      makingRate,
      makingAmount,
      huid,
      metalRate,
      barcodePrefix,
      barcode,
    } = req.body || {};

    if (!productId) return res.status(400).json({ error: 'productId is required' });

    const product = (
      await pool.query('SELECT id, name, price FROM products WHERE id = $1 AND tenant_id = $2', [productId, tenantId])
    ).rows[0] as { id: string; name: string; price: number } | undefined;
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const net = parseFloat(String(netWeight ?? grossWeight ?? ''));
    if (!Number.isFinite(net) || net <= 0) {
      return res.status(400).json({ error: 'netWeight (or grossWeight) must be a positive number' });
    }
    const gross = parseFloat(String(grossWeight ?? net));
    const pur = parseFloat(String(purity ?? 999));
    if (!Number.isFinite(pur) || pur <= 0 || pur > 1000) {
      return res.status(400).json({ error: 'purity must be between 0 and 1000 (parts per thousand)' });
    }

    const fine = computeFineWeight(net, pur);
    let makingAmt = makingAmount !== undefined && makingAmount !== '' ? parseFloat(String(makingAmount)) : NaN;
    const mRate = makingRate !== undefined && makingRate !== '' ? parseFloat(String(makingRate)) : NaN;
    if (!Number.isFinite(makingAmt)) {
      makingAmt = Number.isFinite(mRate) ? computeMakingAmount(net, mRate) : 0;
    }
    const rate =
      metalRate !== undefined && metalRate !== '' ? parseFloat(String(metalRate)) : Number(product.price) || 0;
    if (metalRate !== undefined && metalRate !== '' && (!Number.isFinite(rate) || rate < 0)) {
      return res.status(400).json({ error: 'metalRate must be a non-negative number' });
    }
    if (Number.isFinite(mRate) && mRate < 0) {
      return res.status(400).json({ error: 'makingRate must be a non-negative number' });
    }

    // Enforce plan barcode cap before allocating a code
    const limitErr = await checkPlanLimit(tenantId, 'barcodes');
    if (limitErr) return res.status(403).json(limitErr);

    let pieceBarcode = String(barcode || '').trim();
    if (pieceBarcode) {
      if (await barcodeExists(pool, tenantId, pieceBarcode)) {
        return res.status(400).json({ error: `Barcode ${pieceBarcode} already exists` });
      }
    } else {
      const prefix =
        String(barcodePrefix || 'AG')
          .trim()
          .replace(/[^A-Za-z0-9_-]/g, '') || 'AG';
      const generated = await generateBarcodesFromPrefix(pool, tenantId, prefix, 1);
      pieceBarcode = generated[0];
      if (await barcodeExists(pool, tenantId, pieceBarcode)) {
        return res.status(409).json({ error: 'Could not allocate unique barcode; retry' });
      }
    }

    const id = uid('PI');
    const batchId = uid('MB');
    await pool.query(
      `INSERT INTO product_inventory (
         id, tenant_id, product_id, barcode, batch_id, status, unit_type,
         gross_weight, net_weight, purity, fine_weight, making_rate, making_amount, huid, metal_rate
       ) VALUES ($1,$2,$3,$4,$5,'InStock','piece',$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        id,
        tenantId,
        productId,
        pieceBarcode,
        batchId,
        Number.isFinite(gross) ? gross : net,
        net,
        pur,
        fine,
        Number.isFinite(mRate) ? mRate : null,
        makingAmt,
        huid ? String(huid).trim() : null,
        Number.isFinite(rate) ? rate : null,
      ],
    );

    // Keep product.stock roughly in sync when stock column is used
    await pool
      .query(`UPDATE products SET stock = COALESCE(stock, 0) + 1 WHERE id = $1 AND tenant_id = $2`, [
        productId,
        tenantId,
      ])
      .catch(() => undefined);

    const suggestedPrice = computeMetalSalePrice(net, rate, makingAmt);

    await logAudit(
      pool,
      tenantId,
      'Metal Intake',
      'inventory',
      id,
      `Barcode ${pieceBarcode}: ${net}g @ ${pur}, fine ${fine}g`,
      req.user?.userId,
      req.user?.name || req.user?.email,
    );

    res.status(201).json({
      id,
      productId,
      productName: product.name,
      barcode: pieceBarcode,
      batchId,
      status: 'InStock',
      grossWeight: Number.isFinite(gross) ? gross : net,
      netWeight: net,
      purity: pur,
      fineWeight: fine,
      makingRate: Number.isFinite(mRate) ? mRate : null,
      makingAmount: makingAmt,
      huid: huid ? String(huid).trim() : null,
      metalRate: Number.isFinite(rate) ? rate : null,
      suggestedPrice,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** GET /api/metal/fine-ledger — fine in (InStock+Sold intake) vs fine out (sold) by purity */
router.get('/api/metal/fine-ledger', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const bizType = await getBusinessType(tenantId);
    if (bizType !== 'silver_casting') {
      return res.status(403).json({ error: 'Fine ledger is only available for Silver Casting tenants' });
    }

    const from = typeof req.query.from === 'string' ? req.query.from : null;
    const to = typeof req.query.to === 'string' ? req.query.to : null;

    const params: unknown[] = [tenantId];
    let dateFilter = '';
    if (from) {
      params.push(from);
      dateFilter += ` AND pi.created_at::date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      dateFilter += ` AND pi.created_at::date <= $${params.length}`;
    }

    const intake = await pool.query(
      `SELECT COALESCE(purity, 0) AS purity,
              COUNT(*)::int AS pieces,
              COALESCE(SUM(net_weight), 0)::float AS net_weight,
              COALESCE(SUM(fine_weight), 0)::float AS fine_weight
       FROM product_inventory pi
       WHERE tenant_id = $1 ${dateFilter}
       GROUP BY COALESCE(purity, 0)
       ORDER BY purity DESC`,
      params,
    );

    const soldParams: unknown[] = [tenantId];
    let soldDate = '';
    if (from) {
      soldParams.push(from);
      soldDate += ` AND ps.purchase_date >= $${soldParams.length}`;
    }
    if (to) {
      soldParams.push(to);
      soldDate += ` AND ps.purchase_date <= $${soldParams.length}`;
    }

    const sold = await pool.query(
      `SELECT COALESCE(pi.purity, 0) AS purity,
              COUNT(*)::int AS pieces,
              COALESCE(SUM(pi.net_weight), 0)::float AS net_weight,
              COALESCE(SUM(pi.fine_weight), 0)::float AS fine_weight
       FROM product_sales ps
       JOIN product_inventory pi ON pi.barcode = ps.barcode AND pi.tenant_id = ps.tenant_id
       WHERE ps.tenant_id = $1 ${soldDate}
       GROUP BY COALESCE(pi.purity, 0)
       ORDER BY purity DESC`,
      soldParams,
    );

    const inStock = await pool.query(
      `SELECT COALESCE(purity, 0) AS purity,
              COUNT(*)::int AS pieces,
              COALESCE(SUM(net_weight), 0)::float AS net_weight,
              COALESCE(SUM(fine_weight), 0)::float AS fine_weight
       FROM product_inventory
       WHERE tenant_id = $1 AND status = 'InStock'
       GROUP BY COALESCE(purity, 0)
       ORDER BY purity DESC`,
      [tenantId],
    );

    const mapRow = (r: Record<string, unknown>) => ({
      purity: Number(r.purity),
      pieces: Number(r.pieces),
      netWeight: Number(r.net_weight),
      fineWeight: Number(r.fine_weight),
    });

    const intakeRows = intake.rows.map(mapRow);
    const soldRows = sold.rows.map(mapRow);
    const stockRows = inStock.rows.map(mapRow);

    const sumFine = (rows: { fineWeight: number }[]) =>
      Math.round(rows.reduce((a, r) => a + r.fineWeight, 0) * 1000) / 1000;

    res.json({
      from,
      to,
      intake: intakeRows,
      sold: soldRows,
      inStock: stockRows,
      totals: {
        fineIn: sumFine(intakeRows),
        fineOut: sumFine(soldRows),
        fineOnHand: sumFine(stockRows),
      },
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
