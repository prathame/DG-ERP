import { Router } from 'express';
import { blockVendors, requireAdmin, AuthRequest } from '../middleware/auth';
import { pool } from '../pg-db';
import { uid, logAudit } from '../utils/helpers';
import { handleApiError } from '../utils/http-error';
import { postInvoicePaymentToBooks } from '../services/opsToBooks';
import type { PoolClient } from 'pg';

async function booksPostPayment(
  client: PoolClient,
  tenantId: string,
  payment: {
    id: string;
    amount: number;
    paymentDate: string;
    paymentMethod: string;
    referenceNumber?: string | null;
    notes?: string | null;
    partyId?: string | null;
    partyName: string;
  },
) {
  try {
    await postInvoicePaymentToBooks(client, tenantId, payment);
  } catch {
    /* Books dual-write must not block collections */
  }
}

const router = Router();

/** partyKey: vendor:ID | customer:ID | name:DisplayName (legacy unlinked invoices) */
export function parsePartyKey(raw: string): {
  partyType: 'vendor' | 'customer' | null;
  partyId: string | null;
  clientName: string | null;
  partyKey: string;
} {
  const key = decodeURIComponent(raw || '').trim();
  if (key.startsWith('vendor:') || key.startsWith('customer:')) {
    const i = key.indexOf(':');
    const partyType = key.slice(0, i) as 'vendor' | 'customer';
    const partyId = key.slice(i + 1).trim();
    if (!partyId) {
      return { partyType: null, partyId: null, clientName: '', partyKey: 'name:' };
    }
    return { partyType, partyId, clientName: null, partyKey: `${partyType}:${partyId}` };
  }
  const name = key.startsWith('name:') ? key.slice(5) : key;
  return { partyType: null, partyId: null, clientName: name, partyKey: `name:${name}` };
}

export type InvoiceFinancePaymentRow = {
  id: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  amount: number;
  paymentDate: unknown;
  paymentMethod: string;
  referenceNumber?: string | null;
  notes?: string | null;
  isAdvance?: boolean;
};

/**
 * Service-only: Miracle unallocated cash lives in vendor_payments (clients are vendors).
 * Dealer/manufacturer use vendor_payments for distribution — do not merge there.
 */
export function mergeServiceVendorAdvances(input: {
  businessType: string | null | undefined;
  partyType: string | null;
  totalInvoiced: number;
  invoicePaid: number;
  invoicePayments: InvoiceFinancePaymentRow[];
  vendorPayments: {
    id: string;
    amount: unknown;
    payment_date: unknown;
    payment_method?: string | null;
    reference_number?: string | null;
    notes?: string | null;
  }[];
}): {
  totalPaid: number;
  advanceBalance: number;
  balance: number;
  payments: InvoiceFinancePaymentRow[];
} {
  const isServiceVendor = input.businessType === 'service' && input.partyType === 'vendor';
  if (!isServiceVendor || input.vendorPayments.length === 0) {
    return {
      totalPaid: input.invoicePaid,
      advanceBalance: 0,
      balance: input.totalInvoiced - input.invoicePaid,
      payments: input.invoicePayments,
    };
  }

  const advances: InvoiceFinancePaymentRow[] = input.vendorPayments.map(vp => ({
    id: String(vp.id),
    invoiceId: null,
    invoiceNumber: 'Advance',
    amount: Number(vp.amount) || 0,
    paymentDate: vp.payment_date,
    paymentMethod: (vp.payment_method as string) || 'Cash',
    referenceNumber: vp.reference_number || null,
    notes: vp.notes || null,
    isAdvance: true,
  }));
  const advanceBalance = advances.reduce((s, p) => s + p.amount, 0);
  const totalPaid = input.invoicePaid + advanceBalance;
  const payments = [...input.invoicePayments, ...advances].sort((a, b) => {
    const da = String(a.paymentDate || '');
    const db = String(b.paymentDate || '');
    return db.localeCompare(da);
  });
  return {
    totalPaid,
    advanceBalance,
    balance: input.totalInvoiced - totalPaid,
    payments,
  };
}

async function tenantBusinessType(tenantId: string): Promise<string> {
  const row = (await pool.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0] as
    { business_type?: string } | undefined;
  return (row?.business_type as string) || 'manufacturer';
}

// Client-wise summary: prefer stable party_id grouping; fall back to customer_name
router.get('/api/invoice-finance/summary', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const businessType = await tenantBusinessType(tenantId);

    const rows = (
      await pool.query(
        `
      SELECT
        CASE
          WHEN si.party_type IS NOT NULL AND si.party_id IS NOT NULL
            THEN si.party_type || ':' || si.party_id
          ELSE 'name:' || si.customer_name
        END AS party_key,
        MAX(si.party_type) AS party_type,
        MAX(si.party_id) AS party_id,
        MAX(si.customer_name) AS customer_name,
        MAX(si.customer_phone) AS customer_phone,
        COUNT(si.id) AS invoice_count,
        SUM(si.grand_total) AS total_invoiced,
        COALESCE(SUM(ip.paid), 0) AS total_paid
      FROM standalone_invoices si
      LEFT JOIN (
        SELECT invoice_id, SUM(amount) as paid
        FROM invoice_payments WHERE tenant_id = $1
        GROUP BY invoice_id
      ) ip ON si.id = ip.invoice_id
      WHERE si.tenant_id = $1 AND si.status != 'cancelled'
        AND COALESCE(si.invoice_kind, 'sale') = 'sale'
      GROUP BY 1
      ORDER BY (SUM(si.grand_total) - COALESCE(SUM(ip.paid), 0)) DESC
    `,
        [tenantId],
      )
    ).rows;

    type SummaryRow = {
      partyKey: string;
      partyType: string | null;
      partyId: string | null;
      clientName: string;
      clientPhone: string | null;
      invoiceCount: number;
      totalInvoiced: number;
      totalPaid: number;
      advanceBalance: number;
      balance: number;
    };

    const byKey = new Map<string, SummaryRow>();
    for (const r of rows) {
      const totalInvoiced = Number(r.total_invoiced) || 0;
      const totalPaid = Number(r.total_paid) || 0;
      byKey.set(r.party_key as string, {
        partyKey: r.party_key as string,
        partyType: (r.party_type as string) || null,
        partyId: (r.party_id as string) || null,
        clientName: r.customer_name as string,
        clientPhone: (r.customer_phone as string) || null,
        invoiceCount: Number(r.invoice_count) || 0,
        totalInvoiced,
        totalPaid,
        advanceBalance: 0,
        balance: totalInvoiced - totalPaid,
      });
    }

    // Service: fold Miracle vendor_payments (unallocated receipts) into client totals
    if (businessType === 'service') {
      const vpRows = (
        await pool.query(
          `
          SELECT vp.vendor_id, v.name, v.phone,
                 COALESCE(SUM(vp.amount), 0) AS advance
          FROM vendor_payments vp
          JOIN vendors v ON v.id = vp.vendor_id AND v.tenant_id = vp.tenant_id
          WHERE vp.tenant_id = $1
          GROUP BY vp.vendor_id, v.name, v.phone
        `,
          [tenantId],
        )
      ).rows as { vendor_id: string; name: string; phone: string | null; advance: number }[];

      for (const vp of vpRows) {
        const advance = Number(vp.advance) || 0;
        if (advance <= 0) continue;
        const partyKey = `vendor:${vp.vendor_id}`;
        const existing = byKey.get(partyKey);
        if (existing) {
          existing.totalPaid += advance;
          existing.advanceBalance = advance;
          existing.balance = existing.totalInvoiced - existing.totalPaid;
        } else {
          byKey.set(partyKey, {
            partyKey,
            partyType: 'vendor',
            partyId: vp.vendor_id,
            clientName: vp.name,
            clientPhone: vp.phone || null,
            invoiceCount: 0,
            totalInvoiced: 0,
            totalPaid: advance,
            advanceBalance: advance,
            balance: -advance,
          });
        }
      }
    }

    const merged = [...byKey.values()].sort((a, b) => b.balance - a.balance);
    res.json(merged);
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/**
 * Bifurcated KPIs: party sales (GT/…) vs Miracle cash-income (rent/scrap/MIR-CASH…).
 * Party list stays on /summary; cash-income rows stay out of party outstanding.
 */
router.get('/api/invoice-finance/breakdown', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const kindTotals = (
      await pool.query(
        `
        SELECT
          COALESCE(si.invoice_kind, 'sale') AS invoice_kind,
          COUNT(si.id)::int AS invoice_count,
          COALESCE(SUM(si.grand_total), 0) AS invoiced,
          COALESCE(SUM(ip.paid), 0) AS paid
        FROM standalone_invoices si
        LEFT JOIN (
          SELECT invoice_id, SUM(amount) AS paid
          FROM invoice_payments WHERE tenant_id = $1
          GROUP BY invoice_id
        ) ip ON si.id = ip.invoice_id
        WHERE si.tenant_id = $1 AND si.status IS DISTINCT FROM 'cancelled'
        GROUP BY 1
      `,
        [tenantId],
      )
    ).rows as { invoice_kind: string; invoice_count: number; invoiced: number; paid: number }[];

    const byKind = new Map(kindTotals.map(r => [r.invoice_kind, r]));
    const sale = byKind.get('sale') || { invoice_count: 0, invoiced: 0, paid: 0 };
    const cash = byKind.get('cash_income') || { invoice_count: 0, invoiced: 0, paid: 0 };

    const businessType = await tenantBusinessType(tenantId);
    let partyAdvances = 0;
    if (businessType === 'service') {
      partyAdvances = Number(
        (await pool.query(`SELECT COALESCE(SUM(amount), 0) AS v FROM vendor_payments WHERE tenant_id = $1`, [tenantId]))
          .rows[0]?.v,
      );
    }

    const partyInvoiced = Number(sale.invoiced) || 0;
    const partyReceivedOnBills = Number(sale.paid) || 0;
    const partyReceived = partyReceivedOnBills + partyAdvances;
    const cashIncome = Number(cash.invoiced) || 0;

    res.json({
      partyInvoiced,
      partyReceived,
      partyReceivedOnBills,
      partyAdvances,
      partyOutstanding: partyInvoiced - partyReceived,
      partyInvoiceCount: Number(sale.invoice_count) || 0,
      cashIncome,
      cashIncomeReceived: Number(cash.paid) || 0,
      cashIncomeCount: Number(cash.invoice_count) || 0,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Cash-income invoices (Miracle CB→income) — not party bills. */
router.get('/api/invoice-finance/cash-income', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rows = (
      await pool.query(
        `
        SELECT si.id, si.invoice_number, si.invoice_date, si.customer_name, si.grand_total, si.status, si.notes,
               COALESCE(ip.paid, 0) AS paid
        FROM standalone_invoices si
        LEFT JOIN (
          SELECT invoice_id, SUM(amount) AS paid
          FROM invoice_payments WHERE tenant_id = $1
          GROUP BY invoice_id
        ) ip ON si.id = ip.invoice_id
        WHERE si.tenant_id = $1
          AND si.status IS DISTINCT FROM 'cancelled'
          AND COALESCE(si.invoice_kind, 'sale') = 'cash_income'
        ORDER BY si.invoice_date DESC NULLS LAST, si.id DESC
      `,
        [tenantId],
      )
    ).rows;

    res.json(
      rows.map((r: Record<string, unknown>) => ({
        id: r.id as string,
        invoiceNumber: r.invoice_number as string,
        invoiceDate: r.invoice_date,
        incomeHead: r.customer_name as string,
        grandTotal: Number(r.grand_total) || 0,
        paid: Number(r.paid) || 0,
        status: r.status as string,
        notes: (r.notes as string) || null,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

/** Flat open bills (Miracle-style bill-wise outstanding) — balance > 0 only. */
router.get('/api/invoice-finance/open-bills', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const rows = (
      await pool.query(
        `
      SELECT
        CASE
          WHEN si.party_type IS NOT NULL AND si.party_id IS NOT NULL
            THEN si.party_type || ':' || si.party_id
          ELSE 'name:' || si.customer_name
        END AS party_key,
        si.party_type,
        si.party_id,
        si.customer_name AS client_name,
        si.customer_phone AS client_phone,
        si.id AS invoice_id,
        si.invoice_number,
        si.invoice_date,
        si.due_date,
        si.grand_total,
        COALESCE(ip.paid, 0) AS paid,
        (si.grand_total - COALESCE(ip.paid, 0)) AS balance,
        si.status
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
      ORDER BY si.customer_name ASC NULLS LAST, si.invoice_date ASC NULLS LAST, si.id ASC
    `,
        [tenantId],
      )
    ).rows;

    res.json(
      rows.map((r: Record<string, unknown>) => ({
        partyKey: r.party_key as string,
        partyType: (r.party_type as string) || null,
        partyId: (r.party_id as string) || null,
        clientName: r.client_name as string,
        clientPhone: (r.client_phone as string) || null,
        invoiceId: r.invoice_id as string,
        invoiceNumber: r.invoice_number as string,
        invoiceDate: r.invoice_date,
        dueDate: r.due_date || null,
        grandTotal: Number(r.grand_total) || 0,
        paid: Number(r.paid) || 0,
        balance: Number(r.balance) || 0,
        status: r.status as string,
      })),
    );
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Invoices for a party key (vendor:ID / customer:ID / name:… or plain name for legacy)
router.get('/api/invoice-finance/client/:clientName', blockVendors, async (req: AuthRequest, res) => {
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });
    const { partyType, partyId, clientName, partyKey } = parsePartyKey(req.params.clientName);

    let invoices;
    let payments;
    if (partyType && partyId) {
      invoices = (
        await pool.query(
          `
        SELECT si.id, si.invoice_number, si.invoice_date, si.due_date,
          si.grand_total, si.subtotal, si.tax_total, si.status, si.notes,
          si.customer_name, si.customer_phone, si.customer_gstin, si.customer_address,
          si.party_type, si.party_id,
          COALESCE(SUM(ip.amount), 0) as paid
        FROM standalone_invoices si
        LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $1
        WHERE si.tenant_id = $1 AND si.party_type = $2 AND si.party_id = $3 AND si.status != 'cancelled'
        GROUP BY si.id ORDER BY si.invoice_date DESC
      `,
          [tenantId, partyType, partyId],
        )
      ).rows;
      payments = (
        await pool.query(
          `
        SELECT ip.*, si.invoice_number
        FROM invoice_payments ip
        JOIN standalone_invoices si ON ip.invoice_id = si.id AND si.tenant_id = $1
        WHERE ip.tenant_id = $1 AND si.party_type = $2 AND si.party_id = $3
        ORDER BY ip.payment_date DESC, ip.created_at DESC
      `,
          [tenantId, partyType, partyId],
        )
      ).rows;
    } else {
      invoices = (
        await pool.query(
          `
        SELECT si.id, si.invoice_number, si.invoice_date, si.due_date,
          si.grand_total, si.subtotal, si.tax_total, si.status, si.notes,
          si.customer_name, si.customer_phone, si.customer_gstin, si.customer_address,
          si.party_type, si.party_id,
          COALESCE(SUM(ip.amount), 0) as paid
        FROM standalone_invoices si
        LEFT JOIN invoice_payments ip ON si.id = ip.invoice_id AND ip.tenant_id = $1
        WHERE si.tenant_id = $1 AND si.customer_name = $2
          AND (si.party_type IS NULL OR si.party_id IS NULL)
          AND si.status != 'cancelled'
        GROUP BY si.id ORDER BY si.invoice_date DESC
      `,
          [tenantId, clientName],
        )
      ).rows;
      payments = (
        await pool.query(
          `
        SELECT ip.*, si.invoice_number
        FROM invoice_payments ip
        JOIN standalone_invoices si ON ip.invoice_id = si.id AND si.tenant_id = $1
        WHERE ip.tenant_id = $1 AND si.customer_name = $2
          AND (si.party_type IS NULL OR si.party_id IS NULL)
        ORDER BY ip.payment_date DESC, ip.created_at DESC
      `,
          [tenantId, clientName],
        )
      ).rows;
    }

    // Prefer invoice customer_name; with no invoices look up Masters (Cap Offline parity — never return raw party id).
    let displayName = (invoices[0]?.customer_name as string) || clientName || null;
    let displayPhone = (invoices[0]?.customer_phone as string) || null;
    let displayGstin = (invoices[0]?.customer_gstin as string) || null;
    let displayAddress = (invoices[0]?.customer_address as string) || null;
    if ((!displayName || !invoices[0]) && partyType && partyId) {
      if (partyType === 'vendor') {
        const v = (
          await pool.query('SELECT name, phone, gst_number, address FROM vendors WHERE id = $1 AND tenant_id = $2', [
            partyId,
            tenantId,
          ])
        ).rows[0] as
          { name: string; phone: string | null; gst_number: string | null; address: string | null } | undefined;
        if (v) {
          displayName = displayName || v.name;
          displayPhone = displayPhone || v.phone;
          displayGstin = displayGstin || v.gst_number;
          displayAddress = displayAddress || v.address;
        }
      } else if (partyType === 'customer') {
        const c = (
          await pool.query('SELECT name, phone, address FROM customers WHERE id = $1 AND tenant_id = $2', [
            partyId,
            tenantId,
          ])
        ).rows[0] as { name: string; phone: string | null; address: string | null } | undefined;
        if (c) {
          displayName = displayName || c.name;
          displayPhone = displayPhone || c.phone;
          displayAddress = displayAddress || c.address;
        }
      }
    }
    displayName = displayName || 'Client';

    const totalInvoiced = invoices.reduce((s, r) => s + (Number(r.grand_total) || 0), 0);
    const invoicePaid = invoices.reduce((s, r) => s + (Number(r.paid) || 0), 0);
    const invoicePaymentRows: InvoiceFinancePaymentRow[] = payments.map((r: Record<string, unknown>) => ({
      id: String(r.id),
      invoiceId: (r.invoice_id as string) || null,
      invoiceNumber: (r.invoice_number as string) || null,
      amount: Number(r.amount) || 0,
      paymentDate: r.payment_date,
      paymentMethod: (r.payment_method as string) || 'Cash',
      referenceNumber: (r.reference_number as string) || null,
      notes: (r.notes as string) || null,
      isAdvance: false,
    }));

    const businessType = await tenantBusinessType(tenantId);
    let vendorPaymentRows: {
      id: string;
      amount: unknown;
      payment_date: unknown;
      payment_method?: string | null;
      reference_number?: string | null;
      notes?: string | null;
    }[] = [];
    if (businessType === 'service' && partyType === 'vendor' && partyId) {
      vendorPaymentRows = (
        await pool.query(
          `SELECT id, amount, payment_date, payment_method, reference_number, notes
           FROM vendor_payments
           WHERE tenant_id = $1 AND vendor_id = $2
           ORDER BY payment_date DESC, created_at DESC`,
          [tenantId, partyId],
        )
      ).rows;
    }

    const {
      totalPaid,
      advanceBalance,
      balance,
      payments: mergedPayments,
    } = mergeServiceVendorAdvances({
      businessType,
      partyType,
      totalInvoiced,
      invoicePaid,
      invoicePayments: invoicePaymentRows,
      vendorPayments: vendorPaymentRows,
    });

    res.json({
      partyKey,
      partyType,
      partyId,
      clientName: displayName,
      clientPhone: displayPhone,
      customerGstin: displayGstin,
      customerAddress: displayAddress,
      totalInvoiced,
      totalPaid,
      advanceBalance,
      balance,
      invoices: invoices.map((r: Record<string, unknown>) => ({
        id: r.id,
        invoiceNumber: r.invoice_number,
        invoiceDate: r.invoice_date,
        dueDate: r.due_date,
        grandTotal: Number(r.grand_total) || 0,
        subtotal: Number(r.subtotal) || 0,
        taxTotal: Number(r.tax_total) || 0,
        paid: Number(r.paid) || 0,
        balance: (Number(r.grand_total) || 0) - (Number(r.paid) || 0),
        status: r.status,
        notes: r.notes,
      })),
      payments: mergedPayments,
    });
  } catch (err) {
    return handleApiError(req, res, err);
  }
});

// Record a payment against one invoice, or collectively (partyKey) across open invoices FIFO
router.post('/api/invoice-finance/payments', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    const { readIdempotencyKey } = await import('../utils/idempotency');
    const idemKey = readIdempotencyKey(req);

    const {
      invoiceId,
      partyKey: partyKeyRaw,
      amount,
      paymentDate,
      paymentMethod,
      referenceNumber,
      notes,
      allocations: allocationsRaw,
    } = req.body;
    const allocations = Array.isArray(allocationsRaw)
      ? (allocationsRaw as { invoiceId?: string; amount?: number }[])
          .map(a => ({
            invoiceId: String(a.invoiceId || '').trim(),
            amount: Number(a.amount),
          }))
          .filter(a => a.invoiceId && Number.isFinite(a.amount) && a.amount > 0)
      : [];
    const payAmt = allocations.length
      ? Math.round(allocations.reduce((s, a) => s + a.amount, 0) * 100) / 100
      : Number(amount);
    // Reject NaN/Infinity — `Number("abc") <= 0` is false, so a bare `<= 0` check is not enough
    if (!Number.isFinite(payAmt) || payAmt <= 0) return res.status(400).json({ error: 'Positive amount required' });
    if (payAmt > 100_000_000) return res.status(400).json({ error: 'Amount exceeds maximum limit' });
    if (!invoiceId && !partyKeyRaw && !allocations.length) {
      return res.status(400).json({ error: 'Invoice ID, partyKey, or allocations required' });
    }
    const pDate = paymentDate || new Date().toISOString().slice(0, 10);
    const pMethod = paymentMethod || 'Cash';

    await client.query('BEGIN');
    if (idemKey) {
      const existing = (
        await client.query(
          `SELECT id, invoice_id, amount, payment_date, payment_method
           FROM invoice_payments WHERE tenant_id = $1 AND idempotency_key = $2`,
          [tenantId, idemKey],
        )
      ).rows[0] as
        { id: string; invoice_id: string; amount: number; payment_date: string; payment_method: string } | undefined;
      if (existing) {
        await client.query('COMMIT');
        return res.status(200).json({
          id: existing.id,
          invoiceId: existing.invoice_id,
          amount: Number(existing.amount),
          paymentDate: existing.payment_date,
          paymentMethod: existing.payment_method || 'Cash',
          replayed: true,
        });
      }
    }

    // Bill-wise: explicit splits across selected open invoices
    if (allocations.length) {
      let firstId: string | null = null;
      let appliedCount = 0;
      let partyLabel = '';
      for (const alloc of allocations) {
        const inv = (
          await client.query(
            `SELECT id, grand_total, customer_name, party_id FROM standalone_invoices
             WHERE id = $1 AND tenant_id = $2 AND status IS DISTINCT FROM 'cancelled' FOR UPDATE`,
            [alloc.invoiceId, tenantId],
          )
        ).rows[0] as { id: string; grand_total: number; customer_name: string; party_id: string | null } | undefined;
        if (!inv) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: `Invoice not found: ${alloc.invoiceId}` });
        }
        const alreadyPaid = Number(
          (
            await client.query(
              'SELECT COALESCE(SUM(amount),0) as t FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
              [alloc.invoiceId, tenantId],
            )
          ).rows[0].t,
        );
        const remaining = Number(inv.grand_total) - alreadyPaid;
        if (alloc.amount > remaining + 0.001) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            error: `Payment for ${inv.customer_name} exceeds remaining (₹${Math.max(0, remaining).toFixed(2)})`,
          });
        }
        const id = uid('IP');
        if (!firstId) firstId = id;
        if (!partyLabel) partyLabel = inv.customer_name;
        await client.query(
          `INSERT INTO invoice_payments
             (id, tenant_id, invoice_id, amount, payment_date, payment_method, reference_number, notes, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            id,
            tenantId,
            alloc.invoiceId,
            alloc.amount,
            pDate,
            pMethod,
            referenceNumber || null,
            notes ? `${notes} (bill-wise)` : `Bill-wise payment`,
            firstId === id ? idemKey : null,
          ],
        );
        await booksPostPayment(client, tenantId, {
          id,
          amount: alloc.amount,
          paymentDate: pDate,
          paymentMethod: pMethod,
          referenceNumber: referenceNumber || null,
          notes: notes ? `${notes} (bill-wise)` : 'Bill-wise payment',
          partyId: inv.party_id,
          partyName: inv.customer_name,
        });
        if (alreadyPaid + alloc.amount >= Number(inv.grand_total) - 0.001) {
          await client.query("UPDATE standalone_invoices SET status = 'paid' WHERE id = $1 AND tenant_id = $2", [
            alloc.invoiceId,
            tenantId,
          ]);
        }
        appliedCount += 1;
      }
      await client.query('COMMIT');
      await logAudit(
        pool,
        tenantId,
        'Invoice Payment',
        'invoice_payment',
        firstId || '',
        `₹${payAmt.toLocaleString()} bill-wise across ${appliedCount} invoice(s) for ${partyLabel}`,
        req.user?.userId,
        req.user?.name,
      );
      return res.status(201).json({
        id: firstId,
        invoiceId: null,
        amount: payAmt,
        paymentDate: pDate,
        paymentMethod: pMethod,
        appliedInvoices: appliedCount,
        billWise: true,
      });
    }

    // Collective: apply toward party's total due, oldest invoice first
    if (!invoiceId && partyKeyRaw) {
      const { partyType, partyId, clientName, partyKey } = parsePartyKey(String(partyKeyRaw));
      let openInvoices: {
        id: string;
        grand_total: number;
        customer_name: string;
        party_id: string | null;
        paid: number;
      }[] = [];
      if (partyType && partyId) {
        openInvoices = (
          await client.query(
            `
            SELECT si.id, si.grand_total, si.customer_name, si.party_id,
              COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = si.id AND ip.tenant_id = $1), 0) AS paid
            FROM standalone_invoices si
            WHERE si.tenant_id = $1 AND si.party_type = $2 AND si.party_id = $3 AND si.status != 'cancelled'
            ORDER BY si.invoice_date ASC, si.created_at ASC
          `,
            [tenantId, partyType, partyId],
          )
        ).rows as { id: string; grand_total: number; customer_name: string; party_id: string | null; paid: number }[];
      } else if (clientName) {
        openInvoices = (
          await client.query(
            `
            SELECT si.id, si.grand_total, si.customer_name, si.party_id,
              COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id = si.id AND ip.tenant_id = $1), 0) AS paid
            FROM standalone_invoices si
            WHERE si.tenant_id = $1 AND si.customer_name = $2
              AND (si.party_type IS NULL OR si.party_id IS NULL)
              AND si.status != 'cancelled'
            ORDER BY si.invoice_date ASC, si.created_at ASC
          `,
            [tenantId, clientName],
          )
        ).rows as { id: string; grand_total: number; customer_name: string; party_id: string | null; paid: number }[];
      } else {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'Invalid partyKey' });
      }

      const dues = openInvoices
        .map(inv => ({
          ...inv,
          remaining: Number(inv.grand_total) - Number(inv.paid),
        }))
        .filter(inv => inv.remaining > 0.001);
      const totalDue = dues.reduce((s, inv) => s + inv.remaining, 0);
      if (totalDue <= 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: 'No outstanding balance for this party' });
      }
      if (payAmt > totalDue + 0.01) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `Amount exceeds remaining balance of ₹${totalDue.toFixed(2)}` });
      }

      let remaining = payAmt;
      let firstId: string | null = null;
      let appliedCount = 0;
      const partyLabel = dues[0]?.customer_name || clientName || partyKey;
      for (const inv of dues) {
        if (remaining <= 0.001) break;
        const apply = Math.min(remaining, inv.remaining);
        const id = uid('IP');
        if (!firstId) firstId = id;
        await client.query(
          `INSERT INTO invoice_payments
             (id, tenant_id, invoice_id, amount, payment_date, payment_method, reference_number, notes, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            id,
            tenantId,
            inv.id,
            apply,
            pDate,
            pMethod,
            referenceNumber || null,
            notes ? `${notes} (collective)` : `Collective payment toward ${partyLabel}`,
            firstId === id ? idemKey : null,
          ],
        );
        await booksPostPayment(client, tenantId, {
          id,
          amount: apply,
          paymentDate: pDate,
          paymentMethod: pMethod,
          referenceNumber: referenceNumber || null,
          notes: notes ? `${notes} (collective)` : `Collective payment toward ${partyLabel}`,
          partyId: inv.party_id || partyId,
          partyName: inv.customer_name || partyLabel,
        });
        if (Number(inv.paid) + apply >= Number(inv.grand_total) - 0.001) {
          await client.query("UPDATE standalone_invoices SET status = 'paid' WHERE id = $1 AND tenant_id = $2", [
            inv.id,
            tenantId,
          ]);
        }
        remaining -= apply;
        appliedCount += 1;
      }
      await client.query('COMMIT');
      await logAudit(
        pool,
        tenantId,
        'Invoice Payment',
        'invoice_payment',
        firstId || '',
        `₹${payAmt.toLocaleString()} collective across ${appliedCount} invoice(s) for ${partyLabel}`,
        req.user?.userId,
        req.user?.name,
      );
      return res.status(201).json({
        id: firstId,
        invoiceId: null,
        partyKey,
        amount: payAmt,
        paymentDate: pDate,
        paymentMethod: pMethod,
        appliedInvoices: appliedCount,
      });
    }

    const id = uid('IP');
    const inv = (
      await client.query(
        'SELECT id, grand_total, customer_name, party_id FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 AND status != $3 FOR UPDATE',
        [invoiceId, tenantId, 'cancelled'],
      )
    ).rows[0] as { id: string; grand_total: number; customer_name: string; party_id: string | null } | undefined;
    if (!inv) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const alreadyPaid = Number(
      (
        await client.query(
          'SELECT COALESCE(SUM(amount),0) as t FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
          [invoiceId, tenantId],
        )
      ).rows[0].t,
    );
    const remaining = Number(inv.grand_total) - alreadyPaid;
    if (payAmt > remaining + 0.001) {
      await client.query('ROLLBACK');
      return res
        .status(400)
        .json({ error: `Payment exceeds remaining balance (₹${Math.max(0, remaining).toFixed(2)})` });
    }

    try {
      await client.query(
        `INSERT INTO invoice_payments
           (id, tenant_id, invoice_id, amount, payment_date, payment_method, reference_number, notes, idempotency_key)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, tenantId, invoiceId, payAmt, pDate, pMethod, referenceNumber || null, notes || null, idemKey],
      );
    } catch (insErr) {
      const code = (insErr as { code?: string }).code;
      if (code === '23505' && idemKey) {
        const existing = (
          await client.query(
            `SELECT id, invoice_id, amount, payment_date, payment_method
             FROM invoice_payments WHERE tenant_id = $1 AND idempotency_key = $2`,
            [tenantId, idemKey],
          )
        ).rows[0] as
          { id: string; invoice_id: string; amount: number; payment_date: string; payment_method: string } | undefined;
        await client.query('COMMIT');
        if (existing) {
          return res.status(200).json({
            id: existing.id,
            invoiceId: existing.invoice_id,
            amount: Number(existing.amount),
            paymentDate: existing.payment_date,
            paymentMethod: existing.payment_method || 'Cash',
            replayed: true,
          });
        }
      }
      throw insErr;
    }

    // Auto-mark invoice as paid if fully paid
    const totalPaid = alreadyPaid + payAmt;
    if (totalPaid >= Number(inv.grand_total)) {
      await client.query("UPDATE standalone_invoices SET status = 'paid' WHERE id = $1 AND tenant_id = $2", [
        invoiceId,
        tenantId,
      ]);
    }

    await booksPostPayment(client, tenantId, {
      id,
      amount: payAmt,
      paymentDate: pDate,
      paymentMethod: pMethod,
      referenceNumber: referenceNumber || null,
      notes: notes || null,
      partyId: inv.party_id,
      partyName: inv.customer_name,
    });

    await client.query('COMMIT');
    await logAudit(
      pool,
      tenantId,
      'Invoice Payment',
      'invoice_payment',
      id,
      `₹${payAmt.toLocaleString()} for ${inv.customer_name}`,
      req.user?.userId,
      req.user?.name,
    );
    res.status(201).json({ id, invoiceId, amount: payAmt, paymentDate: pDate, paymentMethod: pMethod });
  } catch (err) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, err);
  } finally {
    client.release();
  }
});

// Delete a payment (locks invoice so concurrent pay/delete can't race)
router.delete('/api/invoice-finance/payments/:id', blockVendors, async (req: AuthRequest, res) => {
  const client = await pool.connect();
  try {
    const tenantId = req.headers['x-tenant-id'] as string;
    if (!tenantId) return res.status(401).json({ error: 'Tenant ID required' });

    await client.query('BEGIN');
    const payment = (
      await client.query(
        'SELECT id, invoice_id, amount FROM invoice_payments WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [req.params.id, tenantId],
      )
    ).rows[0] as { id: string; invoice_id: string; amount: number } | undefined;
    if (!payment) {
      // Service: Miracle unallocated cash is in vendor_payments (shown as advances)
      const biz = (await client.query('SELECT business_type FROM tenants WHERE id = $1', [tenantId])).rows[0] as
        { business_type?: string } | undefined;
      if (biz?.business_type === 'service') {
        const vp = (
          await client.query('SELECT id, amount FROM vendor_payments WHERE id = $1 AND tenant_id = $2 FOR UPDATE', [
            req.params.id,
            tenantId,
          ])
        ).rows[0] as { id: string; amount: number } | undefined;
        if (vp) {
          await client.query('DELETE FROM vendor_payments WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);
          await client.query('COMMIT');
          await logAudit(
            pool,
            tenantId,
            'Vendor Payment',
            'vendor_payment',
            vp.id,
            `Deleted ₹${Number(vp.amount).toLocaleString()} (service advance)`,
            req.user?.userId,
            req.user?.name,
          );
          return res.json({ success: true });
        }
      }
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment not found' });
    }

    const inv = (
      await client.query(
        'SELECT id, grand_total, status FROM standalone_invoices WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [payment.invoice_id, tenantId],
      )
    ).rows[0] as { id: string; grand_total: number; status: string } | undefined;
    if (!inv) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Invoice not found for payment' });
    }

    await client.query('DELETE FROM invoice_payments WHERE id = $1 AND tenant_id = $2', [req.params.id, tenantId]);

    const remaining = Number(
      (
        await client.query(
          'SELECT COALESCE(SUM(amount),0) as t FROM invoice_payments WHERE invoice_id = $1 AND tenant_id = $2',
          [payment.invoice_id, tenantId],
        )
      ).rows[0].t,
    );
    if (remaining + 0.001 < Number(inv.grand_total) && inv.status === 'paid') {
      await client.query(
        "UPDATE standalone_invoices SET status = 'sent', updated_at = NOW() WHERE id = $1 AND tenant_id = $2",
        [payment.invoice_id, tenantId],
      );
    }

    await client.query('COMMIT');
    await logAudit(
      pool,
      tenantId,
      'Invoice Payment Deleted',
      'invoice_payment',
      req.params.id as string,
      `₹${Number(payment.amount).toLocaleString()} removed from invoice ${payment.invoice_id}`,
      req.user?.userId,
      req.user?.name,
    );
    res.status(204).send();
  } catch (err) {
    await client.query('ROLLBACK');
    return handleApiError(req, res, err);
  } finally {
    client.release();
  }
});

export default router;
