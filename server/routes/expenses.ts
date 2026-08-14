import { Router } from 'express';
import { blockVendors, AuthRequest } from '../middleware/auth';
import { pool, setTenantContext } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { parsePagination } from '../utils/pagination';
import { postExpenseToBooks } from '../services/opsToBooks';
import { withBooks } from '../utils/booksStrict';
import { deleteBookVoucher, BookVoucherNotFoundError, BookVoucherValidationError } from '../services/bookVouchers';
import {
  BOOKS_EXPENSE_SQL,
  booksDeskHasData,
  EXCLUDE_STAFF_PAYROLL_EXPENSE_CATEGORY_SQL,
  isStaffPayrollExpenseCategory,
} from '../services/booksExpenses';

const router = Router();

type ExpenseRowOut = {
  id: string;
  category: string;
  description: string | null;
  amount: number;
  expenseDate: string | Date;
  paymentMethod: string;
  referenceNumber: string | null;
  notes: string | null;
  source: 'ops' | 'books';
  booksVoucherId: string | null;
};

function mapBooksExpense(r: Record<string, unknown>): ExpenseRowOut {
  const ext = String(r.external_ref || '');
  const opsId = ext.startsWith('ops:ex:') ? ext.slice('ops:ex:'.length) : null;
  return {
    id: opsId || String(r.voucher_id),
    category: String(r.category || 'Expense'),
    description: (r.narration as string) || null,
    amount: Number(r.amount) || 0,
    expenseDate: r.voucher_date as string | Date,
    paymentMethod: String(r.payment_method || 'Cash'),
    referenceNumber: (r.voucher_number as string) || null,
    notes: opsId ? null : ext.startsWith('miracle:') ? 'Imported from Miracle' : null,
    source: 'books',
    booksVoucherId: String(r.voucher_id),
  };
}

router.get('/api/expenses', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { category, from, to } = req.query;
    const { page, limit, offset } = parsePagination(req.query as Record<string, unknown>);
    const useBooks = await booksDeskHasData(pool, tenantId);

    if (useBooks) {
      const cteParams: unknown[] = [tenantId];
      let cteIdx = 2;
      let cteWhere = '';
      if (typeof category === 'string' && category) {
        cteWhere += ` AND category = $${cteIdx++}`;
        cteParams.push(category);
      }
      if (typeof from === 'string' && from) {
        cteWhere += ` AND voucher_date >= $${cteIdx++}`;
        cteParams.push(from);
      }
      if (typeof to === 'string' && to) {
        cteWhere += ` AND voucher_date <= $${cteIdx++}`;
        cteParams.push(to);
      }

      const countRow = (
        await pool.query(
          `WITH books_exp AS (${BOOKS_EXPENSE_SQL}) SELECT COUNT(*)::int AS c FROM books_exp WHERE 1=1 ${cteWhere}`,
          cteParams,
        )
      ).rows[0] as { c: number };

      const listLimit = offset === 0 ? Math.max(limit, 500) : limit;
      const { rows } = await pool.query(
        `WITH books_exp AS (${BOOKS_EXPENSE_SQL})
         SELECT * FROM books_exp WHERE 1=1 ${cteWhere}
         ORDER BY voucher_date DESC
         LIMIT $${cteIdx++} OFFSET $${cteIdx}`,
        [...cteParams, listLimit, offset],
      );

      // Ops expenses that never dual-wrote to Books (rare). Exclude payroll sync rows —
      // those live under Staff → Staff Salary (Books salary vouchers are already filtered out).
      const orphanOps = (
        await pool.query(
          `SELECT e.* FROM expenses e
           WHERE e.tenant_id = $1
             AND NOT EXISTS (
               SELECT 1 FROM book_vouchers v
               WHERE v.tenant_id = e.tenant_id AND v.external_ref = 'ops:ex:' || e.id
             )
           ORDER BY e.expense_date DESC
           LIMIT 200`,
          [tenantId],
        )
      ).rows as Record<string, unknown>[];

      const booksMapped = rows.map((r: Record<string, unknown>) => mapBooksExpense(r));
      const orphanMapped: ExpenseRowOut[] = orphanOps
        .filter(r => !isStaffPayrollExpenseCategory(String(r.category || '')))
        .map(r => ({
          id: String(r.id),
          category: String(r.category),
          description: (r.description as string) || null,
          amount: Number(r.amount),
          expenseDate: r.expense_date as string | Date,
          paymentMethod: String(r.payment_method || 'Cash'),
          referenceNumber: (r.reference_number as string) || null,
          notes: (r.notes as string) || null,
          source: 'ops' as const,
          booksVoucherId: null,
        }));

      const seen = new Set(booksMapped.map(b => b.id));
      const merged = [...booksMapped, ...orphanMapped.filter(o => !seen.has(o.id))];
      const out = merged;

      res.setHeader('X-Total-Count', String(Number(countRow?.c || 0) + orphanMapped.length));
      res.setHeader('X-Page', String(page));
      res.setHeader('X-Limit', String(listLimit));
      res.setHeader('X-Expenses-Source', 'books');
      return res.json(out);
    }

    let where = 'WHERE tenant_id = $1';
    const params: unknown[] = [tenantId];
    let idx = 2;
    if (typeof category === 'string' && category) {
      where += ` AND category = $${idx++}`;
      params.push(category);
    }
    if (typeof from === 'string' && from) {
      where += ` AND expense_date >= $${idx++}`;
      params.push(from);
    }
    if (typeof to === 'string' && to) {
      where += ` AND expense_date <= $${idx++}`;
      params.push(to);
    }
    // Staff payroll rows are mirrored into expenses for audit; list them only under Staff.
    where += ` ${EXCLUDE_STAFF_PAYROLL_EXPENSE_CATEGORY_SQL}`;
    const total = Number((await pool.query(`SELECT COUNT(*)::int AS c FROM expenses ${where}`, params)).rows[0].c);
    const { rows } = await pool.query(
      `SELECT * FROM expenses ${where} ORDER BY expense_date DESC LIMIT $${idx++} OFFSET $${idx}`,
      [...params, limit, offset],
    );
    res.setHeader('X-Total-Count', String(total));
    res.setHeader('X-Page', String(page));
    res.setHeader('X-Limit', String(limit));
    res.setHeader('X-Expenses-Source', 'ops');
    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id,
        category: r.category,
        description: r.description,
        amount: Number(r.amount),
        expenseDate: r.expense_date,
        paymentMethod: r.payment_method,
        referenceNumber: r.reference_number,
        notes: r.notes,
        source: 'ops' as const,
        booksVoucherId: null,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.get('/api/expenses/summary', async (req, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const year = parseInt(String(req.query.year), 10) || new Date().getFullYear();
    const useBooks = await booksDeskHasData(pool, tenantId);

    if (useBooks) {
      const byCategory = (
        await pool.query(
          `WITH books_exp AS (${BOOKS_EXPENSE_SQL})
           SELECT category, SUM(amount) AS total, COUNT(*)::int AS count
           FROM books_exp
           WHERE EXTRACT(YEAR FROM voucher_date) = $2
           GROUP BY category
           ORDER BY total DESC`,
          [tenantId, year],
        )
      ).rows as { category: string; total: number; count: number }[];
      const byMonth = (
        await pool.query(
          `WITH books_exp AS (${BOOKS_EXPENSE_SQL})
           SELECT to_char(voucher_date, 'YYYY-MM') AS month, SUM(amount) AS total
           FROM books_exp
           WHERE EXTRACT(YEAR FROM voucher_date) = $2
           GROUP BY to_char(voucher_date, 'YYYY-MM')
           ORDER BY month`,
          [tenantId, year],
        )
      ).rows as { month: string; total: number }[];
      const grand = byCategory.reduce((s, r) => s + Number(r.total), 0);
      return res.json({
        year,
        grandTotal: grand,
        byCategory: byCategory.map(r => ({ category: r.category, total: Number(r.total), count: Number(r.count) })),
        byMonth: byMonth.map(r => ({ month: r.month, total: Number(r.total) })),
        source: 'books',
      });
    }

    const byCategory = (
      await pool.query(
        `SELECT category, SUM(amount) as total, COUNT(*) as count FROM expenses
         WHERE tenant_id = $1 AND EXTRACT(YEAR FROM expense_date) = $2
           ${EXCLUDE_STAFF_PAYROLL_EXPENSE_CATEGORY_SQL}
         GROUP BY category ORDER BY total DESC`,
        [tenantId, year],
      )
    ).rows as { category: string; total: number; count: number }[];
    const byMonth = (
      await pool.query(
        `SELECT to_char(expense_date, 'YYYY-MM') as month, SUM(amount) as total FROM expenses
         WHERE tenant_id = $1 AND EXTRACT(YEAR FROM expense_date) = $2
           ${EXCLUDE_STAFF_PAYROLL_EXPENSE_CATEGORY_SQL}
         GROUP BY to_char(expense_date, 'YYYY-MM') ORDER BY month`,
        [tenantId, year],
      )
    ).rows as { month: string; total: number }[];
    const grand = byCategory.reduce((s, r) => s + Number(r.total), 0);
    res.json({
      year,
      grandTotal: grand,
      byCategory: byCategory.map(r => ({ category: r.category, total: Number(r.total), count: Number(r.count) })),
      byMonth: byMonth.map(r => ({ month: r.month, total: Number(r.total) })),
      source: 'ops',
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.post('/api/expenses', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { category, description, amount, expenseDate, paymentMethod, referenceNumber, notes } = req.body;
    if (!category?.trim()) return res.status(400).json({ error: 'Category is required' });
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0)
      return res.status(400).json({ error: 'Amount must be greater than 0' });
    if (parsedAmount > 100_000_000) return res.status(400).json({ error: 'Amount exceeds maximum limit' });
    const id = uid('EXP');
    const date = expenseDate || new Date().toISOString().slice(0, 10);
    let booksVoucherId: string | null = null;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await setTenantContext(client, tenantId);
      await client.query(
        'INSERT INTO expenses (id, tenant_id, category, description, amount, expense_date, payment_method, reference_number, notes) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [
          id,
          tenantId,
          category.trim(),
          description || null,
          parsedAmount,
          date,
          paymentMethod || 'Cash',
          referenceNumber || null,
          notes || null,
        ],
      );
      await withBooks(async () => {
        booksVoucherId = await postExpenseToBooks(client, tenantId, {
          id,
          amount: parsedAmount,
          expenseDate: date,
          category: category.trim(),
          description: description || notes || null,
          paymentMethod: paymentMethod || 'Cash',
        });
      }, 'expense-create');
      await client.query('COMMIT');
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      throw err;
    } finally {
      client.release();
    }
    await logAudit(
      pool,
      tenantId,
      'Expense Recorded',
      'expense',
      id,
      `${category}: ₹${parsedAmount.toLocaleString('en-IN')}`,
    );
    res.status(201).json({
      id,
      category: category.trim(),
      description,
      amount: parsedAmount,
      expenseDate: date,
      paymentMethod: paymentMethod || 'Cash',
      referenceNumber,
      notes,
      source: booksVoucherId ? 'books' : 'ops',
      booksVoucherId,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

router.delete('/api/expenses/:id', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { id } = req.params;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await setTenantContext(client, tenantId);

      // Ops row (id = EXP…) and/or Books voucher (id = BV… or linked via ops:ex:)
      const ops = (await client.query(`SELECT id FROM expenses WHERE id = $1 AND tenant_id = $2`, [id, tenantId]))
        .rows[0] as { id: string } | undefined;

      let voucherId: string | null = null;
      const byId = (await client.query(`SELECT id FROM book_vouchers WHERE id = $1 AND tenant_id = $2`, [id, tenantId]))
        .rows[0] as { id: string } | undefined;
      if (byId) voucherId = byId.id;
      if (!voucherId) {
        const byExt = (
          await client.query(`SELECT id FROM book_vouchers WHERE tenant_id = $1 AND external_ref = $2`, [
            tenantId,
            `ops:ex:${id}`,
          ])
        ).rows[0] as { id: string } | undefined;
        if (byExt) voucherId = byExt.id;
      }

      if (!ops && !voucherId) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Expense not found' });
      }

      if (voucherId) {
        await deleteBookVoucher(client, tenantId, voucherId);
      }
      if (ops) {
        await client.query(`DELETE FROM expenses WHERE id = $1 AND tenant_id = $2`, [ops.id, tenantId]);
      } else if (voucherId) {
        // Books-only (Miracle): clear any ops twin that pointed at this voucher
        await client.query(`DELETE FROM expenses WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);
      }

      await client.query('COMMIT');
      await logAudit(pool, tenantId, 'Expense Deleted', 'expense', id, voucherId ? `books:${voucherId}` : 'ops');
      res.json({ ok: true });
    } catch (err) {
      try {
        await client.query('ROLLBACK');
      } catch {
        /* ignore */
      }
      if (err instanceof BookVoucherNotFoundError || err instanceof BookVoucherValidationError) {
        return res.status(err.status).json({ error: err.message });
      }
      throw err;
    } finally {
      client.release();
    }
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

export default router;
