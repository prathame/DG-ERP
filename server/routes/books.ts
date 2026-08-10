import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { handleApiError } from '../utils/http-error';
import { uid, logAudit } from '../utils/helpers';
import { extractArchive, importMiracleCompany, locateCompanyDir } from '../services/miracleImport';

const router = Router();
const uploadDir = path.join(os.tmpdir(), 'miracle-uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  dest: uploadDir,
  limits: { fileSize: 80 * 1024 * 1024 },
});

function tenantOf(req: AuthRequest): string | null {
  return (req.headers['x-tenant-id'] as string) || null;
}

router.get('/api/books/summary', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const [ledgers, products, vouchers, jobs] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS c FROM book_ledgers WHERE tenant_id = $1`, [tenantId]),
      pool.query(`SELECT COUNT(*)::int AS c FROM book_products WHERE tenant_id = $1`, [tenantId]),
      pool.query(`SELECT COUNT(*)::int AS c FROM book_vouchers WHERE tenant_id = $1`, [tenantId]),
      pool.query(
        `SELECT id, status, company_name, miracle_version, summary, error_message, created_at, finished_at
         FROM book_import_jobs WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5`,
        [tenantId],
      ),
    ]);
    res.json({
      ledgers: ledgers.rows[0]?.c ?? 0,
      products: products.rows[0]?.c ?? 0,
      vouchers: vouchers.rows[0]?.c ?? 0,
      recentImports: jobs.rows.map(r => ({
        id: r.id,
        status: r.status,
        companyName: r.company_name,
        miracleVersion: r.miracle_version,
        summary: r.summary,
        errorMessage: r.error_message,
        createdAt: r.created_at,
        finishedAt: r.finished_at,
      })),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/books/ledgers', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT l.*, g.name AS group_name, d.city, d.state, d.contact_person, d.mobile, d.phone
      FROM book_ledgers l
      LEFT JOIN book_account_groups g ON g.id = l.group_id AND g.tenant_id = l.tenant_id
      LEFT JOIN book_ledger_details d ON d.ledger_id = l.id AND d.tenant_id = l.tenant_id
      WHERE l.tenant_id = $1`;
    if (search) {
      params.push(`%${search}%`);
      sql += ` AND (l.name ILIKE $${params.length} OR COALESCE(l.gstin,'') ILIKE $${params.length})`;
    }
    if (type) {
      params.push(type);
      sql += ` AND l.ledger_type = $${params.length}`;
    }
    sql += ` ORDER BY l.name LIMIT 2000`;
    const { rows } = await pool.query(sql, params);
    res.json(
      rows.map(r => ({
        id: r.id,
        name: r.name,
        groupId: r.group_id,
        groupName: r.group_name,
        nature: r.nature,
        ledgerType: r.ledger_type,
        gstin: r.gstin,
        openingBalance: Number(r.opening_balance || 0),
        openingSide: r.opening_side,
        city: r.city,
        state: r.state,
        contactPerson: r.contact_person,
        mobile: r.mobile || r.phone,
        externalRef: r.external_ref,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/books/products', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { rows } = await pool.query(`SELECT * FROM book_products WHERE tenant_id = $1 ORDER BY name LIMIT 2000`, [
      tenantId,
    ]);
    res.json(
      rows.map(r => ({
        id: r.id,
        name: r.name,
        code: r.code,
        unit: r.unit,
        hsnCode: r.hsn_code,
        saleRate: Number(r.sale_rate || 0),
        purchaseRate: Number(r.purchase_rate || 0),
        mrp: Number(r.mrp || 0),
        taxClass: r.tax_class,
        externalRef: r.external_ref,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/books/vouchers', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const type = typeof req.query.type === 'string' ? req.query.type.trim() : '';
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT v.*, pl.name AS party_name, cl.name AS contra_name
      FROM book_vouchers v
      LEFT JOIN book_ledgers pl ON pl.id = v.party_ledger_id AND pl.tenant_id = v.tenant_id
      LEFT JOIN book_ledgers cl ON cl.id = v.contra_ledger_id AND cl.tenant_id = v.tenant_id
      WHERE v.tenant_id = $1`;
    if (type) {
      params.push(type);
      sql += ` AND v.voucher_type = $${params.length}`;
    }
    sql += ` ORDER BY v.voucher_date DESC, v.voucher_number DESC NULLS LAST LIMIT 2000`;
    const { rows } = await pool.query(sql, params);
    res.json(
      rows.map(r => ({
        id: r.id,
        voucherType: r.voucher_type,
        voucherDate: r.voucher_date,
        voucherNumber: r.voucher_number,
        partyName: r.party_name,
        contraName: r.contra_name,
        amount: Number(r.amount || 0),
        narration: r.narration,
        miracleType: r.miracle_type,
        miracleSubtype: r.miracle_subtype,
        externalRef: r.external_ref,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/books/vouchers/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id } = req.params;
    const v = (
      await pool.query(
        `SELECT v.*, pl.name AS party_name, cl.name AS contra_name
         FROM book_vouchers v
         LEFT JOIN book_ledgers pl ON pl.id = v.party_ledger_id AND pl.tenant_id = v.tenant_id
         LEFT JOIN book_ledgers cl ON cl.id = v.contra_ledger_id AND cl.tenant_id = v.tenant_id
         WHERE v.id = $1 AND v.tenant_id = $2`,
        [id, tenantId],
      )
    ).rows[0];
    if (!v) return res.status(404).json({ error: 'Voucher not found' });

    const entries = (
      await pool.query(
        `SELECT e.*, l.name AS ledger_name
         FROM book_voucher_entries e
         JOIN book_ledgers l ON l.id = e.ledger_id AND l.tenant_id = e.tenant_id
         WHERE e.voucher_id = $1 AND e.tenant_id = $2
         ORDER BY e.line_no`,
        [id, tenantId],
      )
    ).rows;
    const items = (
      await pool.query(
        `SELECT i.*, p.name AS product_name
         FROM book_voucher_items i
         LEFT JOIN book_products p ON p.id = i.product_id AND p.tenant_id = i.tenant_id
         WHERE i.voucher_id = $1 AND i.tenant_id = $2
         ORDER BY i.line_no`,
        [id, tenantId],
      )
    ).rows;

    res.json({
      id: v.id,
      voucherType: v.voucher_type,
      voucherDate: v.voucher_date,
      voucherNumber: v.voucher_number,
      partyName: v.party_name,
      contraName: v.contra_name,
      amount: Number(v.amount || 0),
      narration: v.narration,
      miracleType: v.miracle_type,
      entries: entries.map(e => ({
        id: e.id,
        lineNo: e.line_no,
        ledgerName: e.ledger_name,
        debit: Number(e.debit || 0),
        credit: Number(e.credit || 0),
      })),
      items: items.map(i => ({
        id: i.id,
        lineNo: i.line_no,
        productName: i.product_name,
        qty: Number(i.qty || 0),
        rate: Number(i.rate || 0),
        amount: Number(i.amount || 0),
      })),
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/books/day-book', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = tenantOf(req);
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const from = typeof req.query.from === 'string' ? req.query.from : null;
    const to = typeof req.query.to === 'string' ? req.query.to : null;
    const params: unknown[] = [tenantId];
    let sql = `
      SELECT e.voucher_id, v.voucher_date, v.voucher_number, v.voucher_type, v.narration,
             l.name AS ledger_name, e.debit, e.credit
      FROM book_voucher_entries e
      JOIN book_vouchers v ON v.id = e.voucher_id AND v.tenant_id = e.tenant_id
      JOIN book_ledgers l ON l.id = e.ledger_id AND l.tenant_id = e.tenant_id
      WHERE e.tenant_id = $1`;
    if (from) {
      params.push(from);
      sql += ` AND v.voucher_date >= $${params.length}`;
    }
    if (to) {
      params.push(to);
      sql += ` AND v.voucher_date <= $${params.length}`;
    }
    sql += ` ORDER BY v.voucher_date, v.voucher_number NULLS LAST, e.line_no LIMIT 5000`;
    const { rows } = await pool.query(sql, params);
    res.json(
      rows.map(r => ({
        voucherId: r.voucher_id,
        date: r.voucher_date,
        voucherNumber: r.voucher_number,
        voucherType: r.voucher_type,
        ledgerName: r.ledger_name,
        debit: Number(r.debit || 0),
        credit: Number(r.credit || 0),
        narration: r.narration,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Upload Miracle CMP .rar / .zip and import into Books tables. */
router.post('/api/books/import/miracle', requireAdmin, upload.single('file'), async (req: AuthRequest, res) => {
  const tenantId = tenantOf(req);
  if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
  if (!req.file) return res.status(400).json({ error: 'Upload a Miracle CMP .rar or .zip file' });

  const jobId = uid('BJ');
  let extractRoot: string | null = null;
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,'miracle','pending')`,
      [jobId, tenantId],
    );

    extractRoot = await extractArchive(req.file.path);
    const companyDir = locateCompanyDir(extractRoot);

    await client.query('BEGIN');
    const summary = await importMiracleCompany(client, tenantId, companyDir, jobId);
    await client.query('COMMIT');

    await logAudit(
      pool,
      tenantId,
      'Miracle Import',
      'book_import',
      jobId,
      `Imported ${summary.companyName}: ${summary.ledgers} ledgers, ${summary.products} products, ${summary.vouchers} vouchers`,
    );

    res.status(201).json({ jobId, summary });
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    const message = err instanceof Error ? err.message : String(err);
    await pool.query(
      `UPDATE book_import_jobs SET status = 'failed', error_message = $1, finished_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
      [message.slice(0, 2000), jobId, tenantId],
    );
    return handleApiError(req, res, err, 'Miracle import failed', { publicMessage: message });
  } finally {
    client.release();
    try {
      if (req.file?.path) fs.unlinkSync(req.file.path);
    } catch {
      /* ignore */
    }
    if (extractRoot) {
      try {
        fs.rmSync(extractRoot, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }
});

export default router;
