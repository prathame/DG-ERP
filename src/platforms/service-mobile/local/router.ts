/**
 * In-process local API for Service Mobile — ERP traffic stays on-device.
 * Cloud license/sync/backup paths are NOT handled here (see cloud.ts).
 */
import { localQuery } from './db';
import { localLogin, verifyLocalToken, type LocalJwtPayload } from './auth';
import { SERVICE_TAB_PRESET } from './schema';
import {
  mapBank,
  mapCustomer,
  mapExpense,
  mapInvoice,
  mapOrder,
  mapPriceRule,
  mapProduct,
  mapQuotation,
  mapStaff,
  mapSupplier,
  mapVendor,
} from './mappers';

function uid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

type Ctx = {
  method: string;
  path: string;
  body: unknown;
  auth: LocalJwtPayload | null;
};

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function tenantId(auth: LocalJwtPayload | null): string | null {
  return auth?.tenantId ?? null;
}

async function listTable(table: string, tid: string, order = 'created_at DESC') {
  const { rows } = await localQuery(`SELECT * FROM ${table} WHERE tenant_id = $1 ORDER BY ${order}`, [tid]);
  return rows;
}

async function syncInvoicePaidStatus(tenantId: string, invoiceId: string) {
  const { rows: invRows } = await localQuery(
    `SELECT COALESCE(grand_total, total, 0) AS grand_total, status
     FROM standalone_invoices WHERE id=$1 AND tenant_id=$2`,
    [invoiceId, tenantId],
  );
  const inv = invRows[0] as { grand_total: number; status: string } | undefined;
  if (!inv) return;
  const { rows: sumRows } = await localQuery(
    `SELECT COALESCE(SUM(amount),0) AS t FROM invoice_payments WHERE invoice_id=$1 AND tenant_id=$2`,
    [invoiceId, tenantId],
  );
  const paid = Number((sumRows[0] as { t: number }).t) || 0;
  const grand = Number(inv.grand_total) || 0;
  if (paid >= grand - 0.001 && grand > 0) {
    await localQuery(`UPDATE standalone_invoices SET status='paid' WHERE id=$1 AND tenant_id=$2`, [
      invoiceId,
      tenantId,
    ]);
  } else if (inv.status === 'paid') {
    await localQuery(`UPDATE standalone_invoices SET status='sent' WHERE id=$1 AND tenant_id=$2`, [
      invoiceId,
      tenantId,
    ]);
  }
}

export async function handleLocalApiRequest(
  method: string,
  rawPath: string,
  headers: HeadersInit | undefined,
  bodyText: string | null,
): Promise<Response | null> {
  // Normalize: /api/foo or foo
  let path = rawPath.replace(/^https?:\/\/[^/]+/, '');
  if (!path.startsWith('/')) path = `/${path}`;
  if (path.startsWith('/api')) path = path.slice(4) || '/';
  const query = new URLSearchParams(path.includes('?') ? path.split('?')[1] : '');
  // strip query (e.g. /settings/profile?userId=…)
  path = path.split('?')[0] || '/';

  // Cloud license routes — let real fetch handle
  if (path.startsWith('/service-mobile/')) return null;

  let body: unknown = null;
  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = null;
    }
  }

  const hdrs = new Headers(headers);
  const bearer = hdrs.get('Authorization')?.replace(/^Bearer\s+/i, '') || '';
  const auth = bearer ? await verifyLocalToken(bearer) : null;

  const ctx: Ctx = { method: method.toUpperCase(), path, body, auth };

  try {
    if (ctx.path === '/health' && ctx.method === 'GET') {
      return json(200, { ok: true, mode: 'service-mobile' });
    }

    if (ctx.path === '/auth/login' && ctx.method === 'POST') {
      const { email, password } = (ctx.body || {}) as { email?: string; password?: string };
      if (!email || !password) return json(400, { error: 'Email and password required' });
      const result = await localLogin(email, password);
      if (!result) return json(401, { error: 'Invalid credentials' });
      return json(200, {
        token: result.token,
        tenantId: result.user.tenantId,
        companyName: result.companyName,
        tenantSlug: (await localQuery<{ value: string }>(`SELECT value FROM sm_meta WHERE key='slug'`)).rows[0]?.value,
        id: result.user.userId,
        email: result.user.email,
        name: result.user.name,
        role: result.user.role,
        businessType: 'service',
        permissions: null,
        vendorId: null,
        autoWhatsapp: false,
        tabConfig: result.tabConfig || SERVICE_TAB_PRESET,
        barcodeSystemEnabled: false,
        multiLanguageEnabled: true,
        vendorPortalEnabled: false,
        quotationsEnabled: true,
        accountsEnabled: true,
        purchasesEnabled: true,
      });
    }

    if (ctx.path.startsWith('/tenant/by-slug/') && ctx.method === 'GET') {
      const slug = ctx.path.replace('/tenant/by-slug/', '');
      const { rows } = await localQuery(
        `SELECT id, company_name, slug, business_type, tab_config, status FROM tenants WHERE slug = $1`,
        [slug],
      );
      if (!rows[0]) return json(404, { error: 'Not found' });
      const t = rows[0] as Record<string, unknown>;
      return json(200, {
        id: t.id,
        companyName: t.company_name,
        slug: t.slug,
        businessType: t.business_type,
        tabConfig: t.tab_config,
        status: t.status,
      });
    }

    // Auth required below
    const tid = tenantId(ctx.auth);
    if (!tid && ctx.path !== '/auth/login') {
      if (ctx.path.startsWith('/super-admin')) return json(403, { error: 'Not available offline' });
      return json(401, { error: 'Unauthorized' });
    }

    // Dashboard / analytics summary
    if ((ctx.path === '/dashboard' || ctx.path === '/dashboard/stats') && ctx.method === 'GET') {
      const inv = await localQuery(
        `SELECT COUNT(*)::int AS c, COALESCE(SUM(total),0) AS s FROM standalone_invoices WHERE tenant_id=$1`,
        [tid],
      );
      const clients = await localQuery(`SELECT COUNT(*)::int AS c FROM vendors WHERE tenant_id=$1`, [tid]);
      return json(200, {
        invoiceCount: (inv.rows[0] as { c: number }).c,
        invoiceRevenue: Number((inv.rows[0] as { s: number }).s),
        clientCount: (clients.rows[0] as { c: number }).c,
        invoiceOutstanding: 0,
      });
    }

    // Masters hub counts
    if (ctx.path === '/masters/counts' && ctx.method === 'GET') {
      const { rows } = await localQuery(
        `SELECT
          (SELECT COUNT(*)::int FROM customers WHERE tenant_id=$1) AS customers,
          (SELECT COUNT(*)::int FROM vendors WHERE tenant_id=$1) AS vendors,
          (SELECT COUNT(*)::int FROM products WHERE tenant_id=$1) AS products,
          (SELECT COUNT(*)::int FROM banks WHERE tenant_id=$1) AS banks,
          (SELECT COUNT(*)::int FROM categories WHERE tenant_id=$1) AS categories,
          (SELECT COUNT(*)::int FROM staff_members WHERE tenant_id=$1) AS staff`,
        [tid],
      );
      const r = rows[0] as Record<string, number>;
      return json(200, {
        customerMaster: r.customers || 0,
        vendorMaster: r.vendors || 0,
        itemMaster: r.products || 0,
        bankMaster: r.banks || 0,
        categoryMaster: r.categories || 0,
        staffCount: r.staff || 0,
      });
    }

    // Vendors = Clients for service
    if (ctx.path === '/vendors' || ctx.path === '/vendors/') {
      if (ctx.method === 'GET') {
        const rows = await listTable('vendors', tid!);
        return json(
          200,
          rows.map(r => mapVendor(r as Record<string, unknown>)),
        );
      }
      if (ctx.method === 'POST') {
        const b = ctx.body as Record<string, unknown>;
        const id = uid('V');
        await localQuery(
          `INSERT INTO vendors (id, tenant_id, name, phone, email, address, gstin) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, tid, b.name, b.phone ?? null, b.email ?? null, b.address ?? null, b.gstin ?? null],
        );
        const { rows } = await localQuery(`SELECT * FROM vendors WHERE id=$1`, [id]);
        return json(201, mapVendor(rows[0] as Record<string, unknown>));
      }
    }
    const vendorMatch = ctx.path.match(/^\/vendors\/([^/]+)$/);
    if (vendorMatch) {
      const id = vendorMatch[1]!;
      if (ctx.method === 'GET') {
        const { rows } = await localQuery(`SELECT * FROM vendors WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return rows[0] ? json(200, mapVendor(rows[0] as Record<string, unknown>)) : json(404, { error: 'Not found' });
      }
      if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
        const b = ctx.body as Record<string, unknown>;
        await localQuery(
          `UPDATE vendors SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email),
           address=COALESCE($4,address), gstin=COALESCE($5,gstin) WHERE id=$6 AND tenant_id=$7`,
          [b.name ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, b.gstin ?? null, id, tid],
        );
        const { rows } = await localQuery(`SELECT * FROM vendors WHERE id=$1`, [id]);
        return json(200, mapVendor(rows[0] as Record<string, unknown>));
      }
      if (ctx.method === 'DELETE') {
        await localQuery(`DELETE FROM vendors WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return json(200, { ok: true });
      }
    }

    // Customers
    if (ctx.path === '/customers' && ctx.method === 'GET') {
      const rows = await listTable('customers', tid!);
      return json(
        200,
        rows.map(r => mapCustomer(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/customers' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('C');
      await localQuery(
        `INSERT INTO customers (id, tenant_id, name, phone, email, address) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, tid, b.name, b.phone ?? null, b.email ?? null, b.address ?? null],
      );
      const { rows } = await localQuery(`SELECT * FROM customers WHERE id=$1`, [id]);
      return json(201, mapCustomer(rows[0] as Record<string, unknown>));
    }

    // Categories / products (masters)
    if (ctx.path === '/categories' && ctx.method === 'GET') return json(200, await listTable('categories', tid!));
    if (ctx.path === '/categories' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('CAT');
      await localQuery(`INSERT INTO categories (id, tenant_id, name) VALUES ($1,$2,$3)`, [id, tid, b.name]);
      return json(201, { id, name: b.name });
    }
    if (ctx.path === '/products' && ctx.method === 'GET') {
      const rows = await listTable('products', tid!);
      return json(
        200,
        rows.map(r => mapProduct(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/products' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('P');
      await localQuery(
        `INSERT INTO products (id, tenant_id, name, sku, price, gst_percent) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, tid, b.name, b.sku ?? null, b.price ?? 0, b.gstPercent ?? b.gst_percent ?? 18],
      );
      const { rows } = await localQuery(`SELECT * FROM products WHERE id=$1`, [id]);
      return json(201, mapProduct(rows[0] as Record<string, unknown>));
    }
    // Manufacturer-only product sub-routes — safe empty responses offline
    if (ctx.path.startsWith('/products/') && ctx.path.includes('low-stock')) {
      return json(200, { count: 0, threshold: Number(query.get('threshold')) || 0 });
    }
    if (
      ctx.path.startsWith('/products/') &&
      (ctx.path.includes('barcode') || ctx.path.includes('verify') || ctx.path.includes('add-stock'))
    ) {
      if (ctx.path.includes('verify')) return json(200, { valid: false, found: false });
      if (ctx.method === 'GET') return json(200, []);
      return json(200, { ok: true });
    }
    const productMatch = ctx.path.match(/^\/products\/([^/]+)$/);
    if (productMatch) {
      const id = productMatch[1]!;
      if (ctx.method === 'GET') {
        const { rows } = await localQuery(`SELECT * FROM products WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return rows[0] ? json(200, mapProduct(rows[0] as Record<string, unknown>)) : json(404, { error: 'Not found' });
      }
      if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
        const b = ctx.body as Record<string, unknown>;
        await localQuery(
          `UPDATE products SET name=COALESCE($1,name), sku=COALESCE($2,sku), price=COALESCE($3,price),
           gst_percent=COALESCE($4,gst_percent) WHERE id=$5 AND tenant_id=$6`,
          [
            b.name ?? null,
            b.sku ?? null,
            b.price != null ? Number(b.price) : null,
            b.gstPercent != null ? Number(b.gstPercent) : null,
            id,
            tid,
          ],
        );
        const { rows } = await localQuery(`SELECT * FROM products WHERE id=$1`, [id]);
        return rows[0] ? json(200, mapProduct(rows[0] as Record<string, unknown>)) : json(404, { error: 'Not found' });
      }
      if (ctx.method === 'DELETE') {
        await localQuery(`DELETE FROM products WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return json(200, { ok: true });
      }
    }

    // Suppliers (purchases module)
    if (ctx.path === '/suppliers' && ctx.method === 'GET') {
      const rows = await listTable('suppliers', tid!, 'name ASC');
      return json(
        200,
        rows.map(r => mapSupplier(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/suppliers' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      if (!b.name || !String(b.name).trim()) return json(400, { error: 'Supplier name is required' });
      const id = uid('S');
      await localQuery(
        `INSERT INTO suppliers (id, tenant_id, name, contact_person, phone, email, address, gst_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          tid,
          String(b.name).trim(),
          b.contactPerson ?? null,
          b.phone ?? null,
          b.email ?? null,
          b.address ?? null,
          b.gstNumber ?? null,
        ],
      );
      const { rows } = await localQuery(`SELECT * FROM suppliers WHERE id=$1`, [id]);
      return json(201, mapSupplier(rows[0] as Record<string, unknown>));
    }

    // Purchase batches (service offline — simplified)
    if (ctx.path === '/purchases/batches' && ctx.method === 'GET') {
      const params: unknown[] = [tid];
      let supplierFilter = '';
      const supplierIdQ = query.get('supplierId');
      if (supplierIdQ) {
        supplierFilter = ' AND pp.supplier_id = $2';
        params.push(supplierIdQ);
      }
      const { rows } = await localQuery(
        `SELECT pp.batch_id, pp.supplier_id, COALESCE(s.name,'') AS supplier_name,
                MIN(pp.purchase_date) AS purchase_date,
                COUNT(*)::int AS total,
                COALESCE(SUM(COALESCE(pp.billed_price, pp.cost_price) * COALESCE(pp.qty,1)),0) AS bill_value,
                STRING_AGG(DISTINCT p.name, ',') AS product_names
         FROM product_purchases pp
         LEFT JOIN suppliers s ON s.id = pp.supplier_id AND s.tenant_id = pp.tenant_id
         LEFT JOIN products p ON p.id = pp.product_id AND p.tenant_id = pp.tenant_id
         WHERE pp.tenant_id=$1 AND pp.batch_id IS NOT NULL${supplierFilter}
         GROUP BY pp.batch_id, pp.supplier_id, s.name
         ORDER BY MIN(pp.purchase_date) DESC NULLS LAST`,
        params,
      );
      const batchIds = rows.map(r => String(r.batch_id));
      const paymentMap: Record<string, number> = {};
      for (const bid of batchIds) {
        const { rows: payRows } = await localQuery(
          `SELECT COALESCE(SUM(amount),0) AS total_paid FROM supplier_payments WHERE tenant_id=$1 AND batch_id=$2`,
          [tid, bid],
        );
        paymentMap[bid] = Number((payRows[0] as { total_paid: number }).total_paid) || 0;
      }
      return json(
        200,
        rows.map(r => {
          const billValue = Number(r.bill_value) || 0;
          const amountPaid = paymentMap[String(r.batch_id)] || 0;
          return {
            batchId: r.batch_id,
            supplierId: r.supplier_id,
            supplierName: r.supplier_name || '',
            purchaseDate: r.purchase_date,
            productNames: String(r.product_names || '')
              .split(',')
              .filter(Boolean),
            total: Number(r.total) || 0,
            billValue,
            amountPaid,
            balanceRemaining: billValue - amountPaid,
          };
        }),
      );
    }
    if (ctx.path === '/purchases/batch' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const batchId = uid('PB');
      const items = Array.isArray(b.items) ? b.items : [];
      for (const it of items as Record<string, unknown>[]) {
        await localQuery(
          `INSERT INTO product_purchases
             (id, tenant_id, batch_id, product_id, barcode, supplier_id, purchase_date, cost_price, billed_price, qty, gst_applied, discount_percent)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
          [
            uid('PP'),
            tid,
            batchId,
            it.productId ?? null,
            it.barcode ?? null,
            b.supplierId ?? null,
            b.purchaseDate ?? new Date().toISOString().slice(0, 10),
            it.costPrice ?? it.price ?? 0,
            it.billedPrice ?? it.costPrice ?? it.price ?? 0,
            it.qty ?? it.quantity ?? 1,
            !!it.withGst || !!it.gstApplied,
            it.discountPercent ?? 0,
          ],
        );
      }
      return json(201, { batchId, ok: true });
    }
    const purchaseBatchMatch = ctx.path.match(/^\/purchases\/batch\/([^/]+)$/);
    if (purchaseBatchMatch && ctx.method === 'GET') {
      const batchId = purchaseBatchMatch[1]!;
      const { rows } = await localQuery(
        `SELECT pp.*, p.name AS product_name, s.name AS supplier_name
         FROM product_purchases pp
         LEFT JOIN products p ON p.id = pp.product_id AND p.tenant_id = pp.tenant_id
         LEFT JOIN suppliers s ON s.id = pp.supplier_id AND s.tenant_id = pp.tenant_id
         WHERE pp.tenant_id=$1 AND pp.batch_id=$2 ORDER BY pp.created_at`,
        [tid, batchId],
      );
      if (!rows.length) return json(404, { error: 'Purchase batch not found' });
      const groups: Record<
        string,
        {
          productId: string;
          productName: string;
          quantity: number;
          costPrice: number;
          discountPercent: number;
          withGst: boolean;
        }
      > = {};
      for (const r of rows) {
        const pid = String(r.product_id || 'unknown');
        if (!groups[pid]) {
          groups[pid] = {
            productId: pid,
            productName: String(r.product_name || ''),
            quantity: 0,
            costPrice: Number(r.cost_price) || 0,
            discountPercent: Number(r.discount_percent) || 0,
            withGst: !!r.gst_applied,
          };
        }
        groups[pid].quantity += Number(r.qty) || 1;
      }
      const billValue = rows.reduce(
        (s, r) => s + (Number(r.billed_price ?? r.cost_price) || 0) * (Number(r.qty) || 1),
        0,
      );
      const { rows: payRows } = await localQuery(
        `SELECT COALESCE(SUM(amount),0) AS t FROM supplier_payments WHERE batch_id=$1 AND tenant_id=$2`,
        [batchId, tid],
      );
      const amountPaid = Number((payRows[0] as { t: number }).t) || 0;
      const first = rows[0] as Record<string, unknown>;
      return json(200, {
        batchId,
        supplierId: first.supplier_id,
        supplierName: first.supplier_name || '',
        purchaseDate: first.purchase_date,
        productNames: Object.values(groups)
          .map(g => g.productName)
          .filter(Boolean),
        total: rows.length,
        billValue,
        amountPaid,
        balanceRemaining: billValue - amountPaid,
        items: Object.values(groups),
      });
    }
    if (ctx.path === '/supplier-finance/summary' && ctx.method === 'GET') {
      const { rows } = await localQuery(
        `SELECT s.id, s.name, s.phone,
           COALESCE((SELECT SUM(COALESCE(pp.billed_price, pp.cost_price) * COALESCE(pp.qty,1))
                     FROM product_purchases pp WHERE pp.supplier_id=s.id AND pp.tenant_id=$1),0) AS total_purchased_value,
           COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE supplier_id=s.id AND tenant_id=$1),0) AS total_paid
         FROM suppliers s WHERE s.tenant_id=$1 ORDER BY s.name`,
        [tid],
      );
      return json(
        200,
        rows.map(r => {
          const totalPurchasedValue = Number(r.total_purchased_value) || 0;
          const totalPaid = Number(r.total_paid) || 0;
          return {
            supplierId: r.id,
            supplierName: r.name,
            supplierPhone: r.phone || null,
            totalPurchasedValue,
            totalPaid,
            balance: totalPurchasedValue - totalPaid,
          };
        }),
      );
    }
    const supplierPayMatch = ctx.path.match(/^\/supplier-finance\/([^/]+)\/payments$/);
    if (supplierPayMatch && ctx.method === 'POST') {
      const supplierId = supplierPayMatch[1]!;
      const b = ctx.body as Record<string, unknown>;
      const id = uid('SP');
      await localQuery(
        `INSERT INTO supplier_payments (id, tenant_id, supplier_id, amount, payment_date, payment_method, notes, batch_id)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          tid,
          supplierId,
          b.amount,
          b.paymentDate ?? null,
          b.paymentMethod ?? 'Cash',
          b.notes ?? null,
          b.batchId ?? null,
        ],
      );
      return json(201, { id, ok: true });
    }

    // Staff
    if (ctx.path === '/staff' && ctx.method === 'GET') {
      const { rows } = await localQuery(
        `SELECT s.*,
           COALESCE(agg.total_paid,0) AS total_paid,
           COALESCE(agg.total_advance,0) AS total_advance,
           COALESCE(agg.total_repaid,0) AS total_repaid,
           COALESCE(agg.payment_count,0) AS payment_count,
           agg.last_payment
         FROM staff_members s
         LEFT JOIN (
           SELECT staff_name,
             SUM(CASE WHEN payment_type IN ('salary','bonus') THEN amount ELSE 0 END) AS total_paid,
             SUM(CASE WHEN payment_type = 'advance' THEN amount ELSE 0 END) AS total_advance,
             SUM(CASE WHEN payment_type = 'advance_repay' THEN amount ELSE 0 END) AS total_repaid,
             COUNT(*) AS payment_count,
             MAX(payment_date) AS last_payment
           FROM staff_payments WHERE tenant_id=$1 GROUP BY staff_name
         ) agg ON agg.staff_name = s.name
         WHERE s.tenant_id=$1 ORDER BY s.name`,
        [tid],
      );
      return json(
        200,
        rows.map(r => mapStaff(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/staff' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      if (!b.name || !String(b.name).trim()) return json(400, { error: 'Name is required' });
      const id = uid('ST');
      await localQuery(
        `INSERT INTO staff_members (id, tenant_id, name, phone, role, address, salary, joining_date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          tid,
          String(b.name).trim(),
          b.phone ?? null,
          b.role ?? null,
          b.address ?? null,
          b.salary ?? 0,
          b.joiningDate ?? null,
          b.status ?? 'active',
        ],
      );
      const { rows } = await localQuery(`SELECT * FROM staff_members WHERE id=$1`, [id]);
      return json(201, mapStaff(rows[0] as Record<string, unknown>));
    }
    const staffMatch = ctx.path.match(/^\/staff\/([^/]+)$/);
    if (staffMatch) {
      const id = staffMatch[1]!;
      if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
        const b = ctx.body as Record<string, unknown>;
        await localQuery(
          `UPDATE staff_members SET
             name=COALESCE($1,name), phone=COALESCE($2,phone), role=COALESCE($3,role),
             address=COALESCE($4,address), salary=COALESCE($5,salary),
             joining_date=COALESCE($6,joining_date), status=COALESCE($7,status)
           WHERE id=$8 AND tenant_id=$9`,
          [
            b.name ?? null,
            b.phone ?? null,
            b.role ?? null,
            b.address ?? null,
            b.salary != null ? Number(b.salary) : null,
            b.joiningDate ?? null,
            b.status ?? null,
            id,
            tid,
          ],
        );
        return json(200, { ok: true });
      }
      if (ctx.method === 'DELETE') {
        await localQuery(`DELETE FROM staff_members WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return json(200, { ok: true });
      }
    }
    if (ctx.path === '/payroll' && ctx.method === 'GET') {
      return json(200, []);
    }
    if (ctx.path === '/payroll/staff' && ctx.method === 'GET') {
      return json(200, []);
    }

    // Expenses
    if (ctx.path === '/expenses' && ctx.method === 'GET') {
      const rows = await listTable('expenses', tid!);
      return json(
        200,
        rows.map(r => mapExpense(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/expenses' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('E');
      await localQuery(
        `INSERT INTO expenses (id, tenant_id, category, amount, description, expense_date) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, tid, b.category ?? null, b.amount, b.description ?? null, b.expenseDate ?? b.expense_date ?? null],
      );
      const { rows } = await localQuery(`SELECT * FROM expenses WHERE id=$1`, [id]);
      return json(201, mapExpense(rows[0] as Record<string, unknown>));
    }
    const expenseMatch = ctx.path.match(/^\/expenses\/([^/]+)$/);
    if (expenseMatch && ctx.method === 'DELETE') {
      await localQuery(`DELETE FROM expenses WHERE id=$1 AND tenant_id=$2`, [expenseMatch[1], tid]);
      return json(200, { ok: true });
    }

    // Quotations
    if (ctx.path === '/quotations' && ctx.method === 'GET') {
      const rows = await listTable('quotations', tid!);
      return json(
        200,
        rows.map(r => mapQuotation(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/quotations' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('Q');
      await localQuery(
        `INSERT INTO quotations (id, tenant_id, quote_number, client_name, client_id, status, items, total)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          id,
          tid,
          b.quoteNumber ?? b.quote_number ?? null,
          b.clientName ?? b.client_name ?? null,
          b.clientId ?? null,
          b.status ?? 'draft',
          JSON.stringify(b.items ?? []),
          b.total ?? 0,
        ],
      );
      const { rows } = await localQuery(`SELECT * FROM quotations WHERE id=$1`, [id]);
      return json(201, mapQuotation(rows[0] as Record<string, unknown>));
    }

    // Orders
    if (ctx.path === '/orders' && ctx.method === 'GET') {
      const rows = await listTable('orders', tid!);
      return json(
        200,
        rows.map(r => mapOrder(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/orders' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('O');
      await localQuery(
        `INSERT INTO orders (id, tenant_id, order_number, client_name, status, items, total) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id,
          tid,
          b.orderNumber ?? null,
          b.clientName ?? null,
          b.status ?? 'open',
          JSON.stringify(b.items ?? []),
          b.total ?? 0,
        ],
      );
      const { rows } = await localQuery(`SELECT * FROM orders WHERE id=$1`, [id]);
      return json(201, mapOrder(rows[0] as Record<string, unknown>));
    }

    // Invoices
    if (ctx.path === '/invoices/next-number' && ctx.method === 'GET') {
      const { rows } = await localQuery(`SELECT COUNT(*)::int AS c FROM standalone_invoices WHERE tenant_id=$1`, [tid]);
      const count = Number((rows[0] as { c: number }).c) + 1;
      const now = new Date();
      const fy =
        now.getMonth() >= 3
          ? `${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(2)}`
          : `${now.getFullYear() - 1}-${now.getFullYear().toString().slice(2)}`;
      return json(200, { number: `INV/${fy}/${String(count).padStart(4, '0')}` });
    }
    if (ctx.path === '/invoices' || ctx.path === '/standalone-invoices') {
      if (ctx.method === 'GET') {
        const rows = await listTable('standalone_invoices', tid!);
        return json(
          200,
          rows.map(r => mapInvoice(r as Record<string, unknown>)),
        );
      }
      if (ctx.method === 'POST') {
        const b = ctx.body as Record<string, unknown>;
        const id = uid('INV');
        const customerName = b.customerName ?? b.clientName ?? b.client_name ?? '';
        const subtotal = Number(b.subtotal) || 0;
        const taxTotal = Number(b.taxTotal ?? b.tax) || 0;
        const grandTotal = Number(b.grandTotal ?? b.total) || subtotal + taxTotal;
        await localQuery(
          `INSERT INTO standalone_invoices
             (id, tenant_id, invoice_number, customer_name, client_name, client_id, customer_gstin, customer_address,
              customer_phone, party_type, party_id, status, items, subtotal, tax, tax_total, grand_total, total,
              notes, terms, invoice_date, due_date)
           VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$15,$16,$17,$18,$19)`,
          [
            id,
            tid,
            b.invoiceNumber ?? b.invoice_number ?? null,
            customerName,
            b.partyId ?? b.clientId ?? null,
            b.customerGstin ?? null,
            b.customerAddress ?? null,
            b.customerPhone ?? null,
            b.partyType ?? null,
            b.partyId ?? null,
            b.status ?? 'draft',
            JSON.stringify(b.items ?? []),
            subtotal,
            taxTotal,
            grandTotal,
            b.notes ?? null,
            b.terms ?? null,
            b.invoiceDate ?? b.invoice_date ?? new Date().toISOString().slice(0, 10),
            b.dueDate ?? null,
          ],
        );
        const { rows } = await localQuery(`SELECT * FROM standalone_invoices WHERE id=$1`, [id]);
        return json(201, mapInvoice(rows[0] as Record<string, unknown>));
      }
    }
    const invStatusMatch = ctx.path.match(/^\/invoices\/([^/]+)\/status$/);
    if (invStatusMatch && ctx.method === 'PUT') {
      const b = ctx.body as { status?: string };
      await localQuery(`UPDATE standalone_invoices SET status=$1 WHERE id=$2 AND tenant_id=$3`, [
        b.status,
        invStatusMatch[1],
        tid,
      ]);
      return json(200, { ok: true });
    }
    const invMatch = ctx.path.match(/^\/invoices\/([^/]+)$/);
    if (invMatch && ctx.method === 'DELETE') {
      await localQuery(`DELETE FROM standalone_invoices WHERE id=$1 AND tenant_id=$2`, [invMatch[1], tid]);
      return json(200, { ok: true });
    }

    // Invoice finance summary / client
    if (ctx.path === '/invoice-finance/summary' && ctx.method === 'GET') {
      const { rows } = await localQuery(
        `SELECT
           CASE
             WHEN si.party_type IS NOT NULL AND si.party_id IS NOT NULL THEN si.party_type || ':' || si.party_id
             ELSE 'name:' || COALESCE(si.customer_name, si.client_name, 'Unknown')
           END AS party_key,
           MAX(si.party_type) AS party_type,
           MAX(si.party_id) AS party_id,
           MAX(COALESCE(si.customer_name, si.client_name)) AS customer_name,
           MAX(si.customer_phone) AS customer_phone,
           COUNT(si.id)::int AS invoice_count,
           COALESCE(SUM(COALESCE(si.grand_total, si.total, 0)), 0) AS total_invoiced,
           COALESCE(SUM(ip.paid), 0) AS total_paid
         FROM standalone_invoices si
         LEFT JOIN (
           SELECT invoice_id, SUM(amount) AS paid FROM invoice_payments WHERE tenant_id=$1 GROUP BY invoice_id
         ) ip ON si.id = ip.invoice_id
         WHERE si.tenant_id=$1 AND COALESCE(si.status,'') != 'cancelled'
         GROUP BY 1
         ORDER BY (COALESCE(SUM(COALESCE(si.grand_total, si.total, 0)),0) - COALESCE(SUM(ip.paid),0)) DESC`,
        [tid],
      );
      return json(
        200,
        rows.map(r => ({
          partyKey: r.party_key,
          partyType: r.party_type || null,
          partyId: r.party_id || null,
          clientName: r.customer_name,
          clientPhone: r.customer_phone || null,
          invoiceCount: Number(r.invoice_count) || 0,
          totalInvoiced: Number(r.total_invoiced) || 0,
          totalPaid: Number(r.total_paid) || 0,
          balance: (Number(r.total_invoiced) || 0) - (Number(r.total_paid) || 0),
        })),
      );
    }
    const invClientMatch = ctx.path.match(/^\/invoice-finance\/client\/(.+)$/);
    if (invClientMatch && ctx.method === 'GET') {
      const raw = decodeURIComponent(invClientMatch[1]!);
      let where = `si.tenant_id=$1 AND COALESCE(si.status,'') != 'cancelled'`;
      const params: unknown[] = [tid];
      if (raw.startsWith('vendor:') || raw.startsWith('customer:')) {
        const [ptype, pid] = raw.split(':');
        where += ` AND si.party_type=$2 AND si.party_id=$3`;
        params.push(ptype, pid);
      } else {
        const name = raw.startsWith('name:') ? raw.slice(5) : raw;
        where += ` AND COALESCE(si.customer_name, si.client_name)=$2`;
        params.push(name);
      }
      const { rows: invoices } = await localQuery(
        `SELECT si.*, COALESCE(SUM(ip.amount),0) AS paid
         FROM standalone_invoices si
         LEFT JOIN invoice_payments ip ON ip.invoice_id=si.id AND ip.tenant_id=$1
         WHERE ${where}
         GROUP BY si.id ORDER BY si.invoice_date DESC NULLS LAST`,
        params,
      );
      const mapped = invoices.map(r => {
        const inv = mapInvoice(r as Record<string, unknown>);
        const paid = Number((r as { paid: number }).paid) || 0;
        return { ...inv, paid, balance: inv.grandTotal - paid };
      });
      const totalInvoiced = mapped.reduce((s, i) => s + i.grandTotal, 0);
      const totalPaid = mapped.reduce((s, i) => s + i.paid, 0);
      const first = invoices[0] as Record<string, unknown> | undefined;

      let paySql = `
        SELECT ip.*, si.invoice_number
        FROM invoice_payments ip
        JOIN standalone_invoices si ON ip.invoice_id = si.id AND si.tenant_id = $1
        WHERE ip.tenant_id = $1`;
      const payParams: unknown[] = [tid];
      if (raw.startsWith('vendor:') || raw.startsWith('customer:')) {
        const [ptype, pid] = raw.split(':');
        paySql += ` AND si.party_type=$2 AND si.party_id=$3`;
        payParams.push(ptype, pid);
      } else {
        const name = raw.startsWith('name:') ? raw.slice(5) : raw;
        paySql += ` AND COALESCE(si.customer_name, si.client_name)=$2`;
        payParams.push(name);
      }
      paySql += ` ORDER BY ip.payment_date DESC NULLS LAST, ip.created_at DESC`;
      const { rows: payRows } = await localQuery(paySql, payParams);

      return json(200, {
        partyKey: raw,
        partyType: first?.party_type || null,
        partyId: first?.party_id || null,
        clientName: first?.customer_name || first?.client_name || raw,
        clientPhone: first?.customer_phone || null,
        customerGstin: first?.customer_gstin || null,
        customerAddress: first?.customer_address || null,
        totalInvoiced,
        totalPaid,
        balance: totalInvoiced - totalPaid,
        invoices: mapped,
        payments: payRows.map(r => ({
          id: r.id,
          invoiceId: r.invoice_id,
          invoiceNumber: r.invoice_number,
          amount: Number(r.amount) || 0,
          paymentDate: r.payment_date,
          paymentMethod: r.payment_method || r.method || 'Cash',
          referenceNumber: r.reference_number || null,
          notes: r.notes || null,
        })),
      });
    }

    // Invoice payments
    if (
      ctx.path === '/invoice-payments' ||
      ctx.path === '/invoice-finance' ||
      ctx.path === '/invoice-finance/payments'
    ) {
      if (ctx.method === 'GET') {
        const rows = await listTable('invoice_payments', tid!);
        return json(
          200,
          rows.map(r => ({
            id: r.id,
            invoiceId: r.invoice_id,
            amount: Number(r.amount) || 0,
            paymentDate: r.payment_date,
            paymentMethod: r.payment_method || r.method || 'Cash',
            referenceNumber: r.reference_number || null,
            notes: r.notes || null,
          })),
        );
      }
      if (ctx.method === 'POST') {
        const b = ctx.body as Record<string, unknown>;
        const invoiceId = String(b.invoiceId || '');
        const payAmt = Number(b.amount);
        if (!invoiceId || !(payAmt > 0)) {
          return json(400, { error: 'Invoice ID and positive amount required' });
        }
        const { rows: invRows } = await localQuery(
          `SELECT id, COALESCE(grand_total, total, 0) AS grand_total
           FROM standalone_invoices WHERE id=$1 AND tenant_id=$2 AND COALESCE(status,'') != 'cancelled'`,
          [invoiceId, tid],
        );
        if (!invRows[0]) return json(404, { error: 'Invoice not found' });
        const { rows: paidRows } = await localQuery(
          `SELECT COALESCE(SUM(amount),0) AS t FROM invoice_payments WHERE invoice_id=$1 AND tenant_id=$2`,
          [invoiceId, tid],
        );
        const alreadyPaid = Number((paidRows[0] as { t: number }).t) || 0;
        const remaining = Number((invRows[0] as { grand_total: number }).grand_total) - alreadyPaid;
        if (payAmt > remaining + 0.001) {
          return json(400, {
            error: `Payment exceeds remaining balance (₹${Math.max(0, remaining).toFixed(2)})`,
          });
        }
        const id = uid('IP');
        const pDate = (b.paymentDate as string) || new Date().toISOString().slice(0, 10);
        const method = (b.paymentMethod as string) || (b.method as string) || 'Cash';
        await localQuery(
          `INSERT INTO invoice_payments
             (id, tenant_id, invoice_id, amount, payment_date, method, payment_method, reference_number, notes)
           VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8)`,
          [id, tid, invoiceId, payAmt, pDate, method, b.referenceNumber ?? null, b.notes ?? null],
        );
        await syncInvoicePaidStatus(tid!, invoiceId);
        return json(201, { id, invoiceId, amount: payAmt, paymentDate: pDate, paymentMethod: method });
      }
    }
    const invPayDel = ctx.path.match(/^\/invoice-finance\/payments\/([^/]+)$/);
    if (invPayDel && ctx.method === 'DELETE') {
      const payId = invPayDel[1]!;
      const { rows } = await localQuery(`SELECT id, invoice_id FROM invoice_payments WHERE id=$1 AND tenant_id=$2`, [
        payId,
        tid,
      ]);
      if (!rows[0]) return json(404, { error: 'Payment not found' });
      const invoiceId = String((rows[0] as { invoice_id: string }).invoice_id);
      await localQuery(`DELETE FROM invoice_payments WHERE id=$1 AND tenant_id=$2`, [payId, tid]);
      await syncInvoicePaidStatus(tid!, invoiceId);
      return json(200, { ok: true });
    }

    // Banks
    if (ctx.path === '/banks' && ctx.method === 'GET') {
      const rows = await listTable('banks', tid!);
      return json(
        200,
        rows.map(r => mapBank(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/banks' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('B');
      await localQuery(
        `INSERT INTO banks (id, tenant_id, name, account_number, ifsc, balance, account_name, bank_name, branch)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          tid,
          b.name ?? b.bankName ?? 'Bank',
          b.accountNumber ?? null,
          b.ifsc ?? null,
          b.balance ?? 0,
          b.accountName ?? null,
          b.bankName ?? null,
          b.branch ?? null,
        ],
      );
      const { rows } = await localQuery(`SELECT * FROM banks WHERE id=$1`, [id]);
      return json(201, mapBank(rows[0] as Record<string, unknown>));
    }
    const bankMatch = ctx.path.match(/^\/banks\/([^/]+)$/);
    if (bankMatch) {
      const id = bankMatch[1]!;
      if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
        const b = ctx.body as Record<string, unknown>;
        await localQuery(
          `UPDATE banks SET name=COALESCE($1,name), account_number=COALESCE($2,account_number),
           ifsc=COALESCE($3,ifsc), balance=COALESCE($4,balance), account_name=COALESCE($5,account_name),
           bank_name=COALESCE($6,bank_name), branch=COALESCE($7,branch)
           WHERE id=$8 AND tenant_id=$9`,
          [
            b.name ?? b.bankName ?? null,
            b.accountNumber ?? null,
            b.ifsc ?? null,
            b.balance != null ? Number(b.balance) : null,
            b.accountName ?? null,
            b.bankName ?? null,
            b.branch ?? null,
            id,
            tid,
          ],
        );
        const { rows } = await localQuery(`SELECT * FROM banks WHERE id=$1`, [id]);
        return rows[0] ? json(200, mapBank(rows[0] as Record<string, unknown>)) : json(404, { error: 'Not found' });
      }
      if (ctx.method === 'DELETE') {
        await localQuery(`DELETE FROM banks WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return json(200, { ok: true });
      }
    }

    // Price lists (per-product / per-vendor rules — same shape as cloud)
    if (ctx.path === '/price-lists' && ctx.method === 'GET') {
      const { rows } = await localQuery(
        `SELECT pl.*, p.name AS product_name, v.name AS vendor_name
         FROM price_lists pl
         LEFT JOIN products p ON p.id = pl.product_id AND p.tenant_id = pl.tenant_id
         LEFT JOIN vendors v ON v.id = pl.vendor_id AND v.tenant_id = pl.tenant_id
         WHERE pl.tenant_id=$1
         ORDER BY COALESCE(p.name,''), pl.min_qty`,
        [tid],
      );
      return json(
        200,
        rows.map(r => mapPriceRule(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/price-lists' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      if (!b.productId) return json(400, { error: 'productId required' });
      const id = uid('PL');
      await localQuery(
        `INSERT INTO price_lists
           (id, tenant_id, name, product_id, vendor_id, min_qty, max_qty, price, valid_from, valid_to, is_active)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
        [
          id,
          tid,
          b.name || 'Rate',
          b.productId,
          b.vendorId ?? null,
          b.minQty ?? 1,
          b.maxQty ?? null,
          b.price ?? 0,
          b.validFrom ?? null,
          b.validTo ?? null,
        ],
      );
      const { rows } = await localQuery(
        `SELECT pl.*, p.name AS product_name, v.name AS vendor_name
         FROM price_lists pl
         LEFT JOIN products p ON p.id = pl.product_id AND p.tenant_id = pl.tenant_id
         LEFT JOIN vendors v ON v.id = pl.vendor_id AND v.tenant_id = pl.tenant_id
         WHERE pl.id=$1`,
        [id],
      );
      return json(201, mapPriceRule(rows[0] as Record<string, unknown>));
    }
    if (ctx.path === '/price-lists/bulk' && ctx.method === 'POST') {
      const rules = (ctx.body as { rules?: unknown })?.rules;
      if (!Array.isArray(rules) || rules.length === 0) {
        return json(400, { error: 'rules array required' });
      }
      if (rules.length > 500) return json(400, { error: 'Maximum 500 rules per import' });
      const { rows: products } = await localQuery<{ id: string; name: string }>(
        `SELECT id, name FROM products WHERE tenant_id=$1`,
        [tid],
      );
      const { rows: vendors } = await localQuery<{ id: string; name: string }>(
        `SELECT id, name FROM vendors WHERE tenant_id=$1`,
        [tid],
      );
      const productByName = new Map(products.map(p => [String(p.name).trim().toLowerCase(), String(p.id)]));
      const vendorByName = new Map(vendors.map(v => [String(v.name).trim().toLowerCase(), String(v.id)]));
      let success = 0;
      let updated = 0;
      let inserted = 0;
      const errors: string[] = [];
      for (let i = 0; i < rules.length; i++) {
        const row = rules[i] as Record<string, unknown>;
        const rowNum = i + 2;
        const productName = String(row.productName || row.product || '').trim();
        const vendorName = String(row.vendorName || row.vendor || '').trim();
        const price = Number(row.price);
        const minQty = Number(row.minQty ?? row.min_qty ?? 1) || 1;
        const maxRaw = row.maxQty ?? row.max_qty;
        const maxQty = maxRaw === '' || maxRaw == null ? null : Number(maxRaw);
        const name = String(row.name || row.ruleName || '').trim() || 'Imported Price';
        const vfRaw = row.validFrom ?? row.valid_from;
        const vtRaw = row.validTo ?? row.valid_to;
        const validFrom = vfRaw === '' || vfRaw == null ? null : String(vfRaw).slice(0, 10);
        const validTo = vtRaw === '' || vtRaw == null ? null : String(vtRaw).slice(0, 10);
        if (!productName) {
          errors.push(`Row ${rowNum}: productName is required`);
          continue;
        }
        const productId = productByName.get(productName.toLowerCase());
        if (!productId) {
          errors.push(`Row ${rowNum}: product "${productName}" not found — add it in Masters first`);
          continue;
        }
        if (!price || price <= 0 || Number.isNaN(price)) {
          errors.push(`Row ${rowNum}: price must be greater than 0`);
          continue;
        }
        let vendorId: string | null = null;
        if (vendorName) {
          vendorId = vendorByName.get(vendorName.toLowerCase()) || null;
          if (!vendorId) {
            errors.push(`Row ${rowNum}: vendor "${vendorName}" not found`);
            continue;
          }
        }
        if (maxQty != null && (Number.isNaN(maxQty) || maxQty < minQty)) {
          errors.push(`Row ${rowNum}: maxQty must be >= minQty`);
          continue;
        }
        try {
          const existing = await localQuery(
            `SELECT id FROM price_lists
             WHERE tenant_id=$1 AND product_id=$2 AND min_qty=$3
               AND vendor_id IS NOT DISTINCT FROM $4 LIMIT 1`,
            [tid, productId, minQty, vendorId],
          );
          if (existing.rows[0]) {
            await localQuery(
              `UPDATE price_lists SET name=$1, max_qty=$2, price=$3, valid_from=$4, valid_to=$5
               WHERE id=$6 AND tenant_id=$7`,
              [name, maxQty, price, validFrom, validTo, existing.rows[0].id, tid],
            );
            updated++;
          } else {
            await localQuery(
              `INSERT INTO price_lists
                 (id, tenant_id, name, product_id, vendor_id, min_qty, max_qty, price, valid_from, valid_to, is_active)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,true)`,
              [uid('PL'), tid, name, productId, vendorId, minQty, maxQty, price, validFrom, validTo],
            );
            inserted++;
          }
          success++;
        } catch (err) {
          errors.push(`Row ${rowNum}: ${err instanceof Error ? err.message : 'failed'}`);
        }
      }
      return json(200, { success, updated, inserted, errors });
    }
    const priceListMatch = ctx.path.match(/^\/price-lists\/([^/]+)$/);
    if (priceListMatch && priceListMatch[1] !== 'bulk') {
      const id = priceListMatch[1]!;
      if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
        const b = ctx.body as Record<string, unknown>;
        // Only overwrite optional fields when the key is present (avoid wiping vendor/dates).
        await localQuery(
          `UPDATE price_lists SET
             name=COALESCE($1,name),
             product_id=COALESCE($2,product_id),
             vendor_id=CASE WHEN $3::boolean THEN $4 ELSE vendor_id END,
             min_qty=COALESCE($5,min_qty),
             max_qty=CASE WHEN $6::boolean THEN $7 ELSE max_qty END,
             price=COALESCE($8,price),
             valid_from=CASE WHEN $9::boolean THEN $10 ELSE valid_from END,
             valid_to=CASE WHEN $11::boolean THEN $12 ELSE valid_to END
           WHERE id=$13 AND tenant_id=$14`,
          [
            b.name ?? null,
            b.productId ?? null,
            'vendorId' in b,
            'vendorId' in b ? (b.vendorId ?? null) : null,
            b.minQty != null ? Number(b.minQty) : null,
            'maxQty' in b,
            'maxQty' in b ? (b.maxQty ?? null) : null,
            b.price != null ? Number(b.price) : null,
            'validFrom' in b,
            'validFrom' in b ? (b.validFrom ?? null) : null,
            'validTo' in b,
            'validTo' in b ? (b.validTo ?? null) : null,
            id,
            tid,
          ],
        );
        return json(200, { ok: true });
      }
      if (ctx.method === 'DELETE') {
        await localQuery(`DELETE FROM price_lists WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return json(200, { ok: true });
      }
    }

    // User-owned backup schedule (local file only — never uploaded to our cloud)
    if (ctx.path === '/backup/settings' && ctx.method === 'GET') {
      if (!ctx.auth || ctx.auth.role !== 'Admin') return json(403, { error: 'Admin only' });
      const { loadLocalBackupSettings } = await import('../localBackup');
      return json(200, await loadLocalBackupSettings());
    }
    if (ctx.path === '/backup/settings' && ctx.method === 'PUT') {
      if (!ctx.auth || ctx.auth.role !== 'Admin') return json(403, { error: 'Admin only' });
      const { saveLocalBackupSettings } = await import('../localBackup');
      const b = (ctx.body || {}) as { enabled?: boolean; frequency?: string; email?: string };
      const saved = await saveLocalBackupSettings({
        enabled: b.enabled,
        frequency: b.frequency as 'daily' | 'weekly' | 'monthly' | undefined,
        email: b.email,
      });
      return json(200, { ok: true, ...saved });
    }
    if (ctx.path === '/backup' && ctx.method === 'GET') {
      if (!ctx.auth || ctx.auth.role !== 'Admin') return json(403, { error: 'Admin only' });
      const { buildLocalBackupEnvelope, saveLocalBackupSettings } = await import('../localBackup');
      const { envelope } = await buildLocalBackupEnvelope();
      await saveLocalBackupSettings({ lastBackupAt: envelope.exportedAt });
      return json(200, envelope);
    }
    if (ctx.path === '/backup/restore' && ctx.method === 'POST') {
      if (!ctx.auth || ctx.auth.role !== 'Admin') return json(403, { error: 'Admin only' });
      const { restoreFromLocalBackupJson } = await import('../localBackup');
      const text = typeof ctx.body === 'string' ? ctx.body : JSON.stringify(ctx.body);
      const r = await restoreFromLocalBackupJson(text);
      if (!r.ok) return json(400, { error: r.error || 'Restore failed' });
      return json(200, { ok: true, restored: true });
    }

    // Bill settings (UI calls /settings/bill)
    if (
      (ctx.path === '/bill-settings' || ctx.path === '/settings/bill') &&
      (ctx.method === 'GET' || ctx.method === 'PUT' || ctx.method === 'POST')
    ) {
      if (ctx.method === 'GET') {
        const { rows } = await localQuery(`SELECT settings FROM bill_settings WHERE tenant_id=$1`, [tid]);
        const settings = (rows[0] as { settings?: unknown } | undefined)?.settings;
        const parsed =
          typeof settings === 'string'
            ? JSON.parse(settings)
            : settings && typeof settings === 'object'
              ? settings
              : {};
        return json(200, parsed);
      }
      const b = ctx.body as Record<string, unknown>;
      await localQuery(
        `INSERT INTO bill_settings (id, tenant_id, settings) VALUES ($1,$2,$3)
         ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
        [uid('BS'), tid, JSON.stringify(b.settings ?? b)],
      );
      return json(200, b.settings ?? b);
    }

    // Accounts / reports — service offline (invoice + expense based; no distribution/stock)
    const periodFrom = query.get('from') || `${new Date().getFullYear()}-04-01`;
    const periodTo = query.get('to') || new Date().toISOString().slice(0, 10);
    if (ctx.path === '/accounts/profit-loss' && ctx.method === 'GET') {
      const inv = await localQuery(
        `SELECT COALESCE(SUM(COALESCE(subtotal,0)),0) AS t FROM standalone_invoices
         WHERE tenant_id=$1 AND COALESCE(status,'') NOT IN ('cancelled','draft')
           AND (invoice_date IS NULL OR (invoice_date >= $2 AND invoice_date <= $3))`,
        [tid, periodFrom, periodTo],
      );
      const exp = await localQuery(
        `SELECT COALESCE(SUM(amount),0) AS t FROM expenses
         WHERE tenant_id=$1 AND (expense_date IS NULL OR (expense_date >= $2 AND expense_date <= $3))`,
        [tid, periodFrom, periodTo],
      );
      const purch = await localQuery(
        `SELECT COALESCE(SUM(COALESCE(billed_price, cost_price) * COALESCE(qty,1)),0) AS t
         FROM product_purchases
         WHERE tenant_id=$1 AND (purchase_date IS NULL OR (purchase_date >= $2 AND purchase_date <= $3))`,
        [tid, periodFrom, periodTo],
      );
      const staff = await localQuery(
        `SELECT COALESCE(SUM(amount),0) AS t FROM staff_payments
         WHERE tenant_id=$1 AND payment_type IN ('salary','bonus')
           AND (payment_date IS NULL OR (payment_date >= $2 AND payment_date <= $3))`,
        [tid, periodFrom, periodTo],
      );
      const invoiceRevenue = Number((inv.rows[0] as { t: number }).t) || 0;
      const otherExpenses = Number((exp.rows[0] as { t: number }).t) || 0;
      const purchaseCost = Number((purch.rows[0] as { t: number }).t) || 0;
      const staffPayments = Number((staff.rows[0] as { t: number }).t) || 0;
      const netRevenue = invoiceRevenue;
      const totalExpenses = purchaseCost + staffPayments + otherExpenses;
      const grossProfit = netRevenue - purchaseCost;
      const netProfit = netRevenue - totalExpenses;
      return json(200, {
        period: { from: periodFrom, to: periodTo },
        basis: 'tax_exclusive',
        revenue: {
          distributionRevenue: 0,
          salesRevenue: 0,
          invoiceRevenue,
          creditNotes: 0,
          total: netRevenue,
        },
        expenses: {
          purchaseCost,
          cogs: purchaseCost,
          purchasesExclGst: purchaseCost,
          staffPayments,
          otherExpenses,
          debitNotes: 0,
          total: totalExpenses,
        },
        grossProfit,
        netProfit,
        profitMargin: netRevenue > 0 ? Math.round((netProfit / netRevenue) * 1000) / 10 : 0,
      });
    }
    if (ctx.path === '/accounts/balance-sheet' && ctx.method === 'GET') {
      const asOf = query.get('asOf') || periodTo;
      const banks = await localQuery(`SELECT COALESCE(SUM(balance),0) AS t FROM banks WHERE tenant_id=$1`, [tid]);
      const invPay = await localQuery(
        `SELECT
           COALESCE(SUM(CASE WHEN si.status NOT IN ('paid','cancelled','draft')
             THEN GREATEST(0, COALESCE(si.grand_total, si.total, 0)
               - COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip
                           WHERE ip.invoice_id=si.id AND ip.tenant_id=$1),0))
             ELSE 0 END),0) AS unpaid,
           COALESCE((SELECT SUM(amount) FROM invoice_payments WHERE tenant_id=$1),0) AS paid_cash
         FROM standalone_invoices si WHERE si.tenant_id=$1`,
        [tid],
      );
      const purchPay = await localQuery(
        `SELECT
           COALESCE((SELECT SUM(COALESCE(billed_price,cost_price)*COALESCE(qty,1)) FROM product_purchases WHERE tenant_id=$1),0) AS purchased,
           COALESCE((SELECT SUM(amount) FROM supplier_payments WHERE tenant_id=$1),0) AS supplier_paid`,
        [tid],
      );
      const bankBal = Number((banks.rows[0] as { t: number }).t) || 0;
      const invoiceReceivables = Number((invPay.rows[0] as { unpaid: number }).unpaid) || 0;
      const invoiceCash = Number((invPay.rows[0] as { paid_cash: number }).paid_cash) || 0;
      const purchased = Number((purchPay.rows[0] as { purchased: number }).purchased) || 0;
      const supplierPaid = Number((purchPay.rows[0] as { supplier_paid: number }).supplier_paid) || 0;
      const payables = Math.max(0, purchased - supplierPaid);
      const cashBank = Math.max(0, bankBal + invoiceCash - supplierPaid);
      const receivables = invoiceReceivables;
      const totalAssets = cashBank + receivables;
      const totalLiabilities = payables;
      const netWorth = totalAssets - totalLiabilities;
      return json(200, {
        asOf,
        valuation: 'service_mobile_simplified',
        assets: {
          inventory: 0,
          receivables,
          distributionReceivables: 0,
          invoiceReceivables,
          staffAdvances: 0,
          cashBank,
          gstCredit: 0,
          total: totalAssets,
        },
        liabilities: {
          payables,
          gstPayable: 0,
          total: totalLiabilities,
        },
        netWorth,
      });
    }
    if (ctx.path === '/accounts/cash-flow' && ctx.method === 'GET') {
      const invCash = await localQuery(
        `SELECT COALESCE(SUM(amount),0) AS t FROM invoice_payments
         WHERE tenant_id=$1 AND (payment_date IS NULL OR (payment_date >= $2 AND payment_date <= $3))`,
        [tid, periodFrom, periodTo],
      );
      const supCash = await localQuery(
        `SELECT COALESCE(SUM(amount),0) AS t FROM supplier_payments
         WHERE tenant_id=$1 AND (payment_date IS NULL OR (payment_date >= $2 AND payment_date <= $3))`,
        [tid, periodFrom, periodTo],
      );
      const staffCash = await localQuery(
        `SELECT COALESCE(SUM(amount),0) AS t FROM staff_payments
         WHERE tenant_id=$1 AND (payment_date IS NULL OR (payment_date >= $2 AND payment_date <= $3))`,
        [tid, periodFrom, periodTo],
      );
      const expCash = await localQuery(
        `SELECT COALESCE(SUM(amount),0) AS t FROM expenses
         WHERE tenant_id=$1 AND (expense_date IS NULL OR (expense_date >= $2 AND expense_date <= $3))`,
        [tid, periodFrom, periodTo],
      );
      const invoicePayments = Number((invCash.rows[0] as { t: number }).t) || 0;
      const supplierPayments = Number((supCash.rows[0] as { t: number }).t) || 0;
      const staffPayments = Number((staffCash.rows[0] as { t: number }).t) || 0;
      const expenses = Number((expCash.rows[0] as { t: number }).t) || 0;
      const inTotal = invoicePayments;
      const outTotal = supplierPayments + staffPayments + expenses;
      return json(200, {
        period: { from: periodFrom, to: periodTo },
        inflows: { vendorPayments: 0, invoicePayments, total: inTotal },
        outflows: { supplierPayments, staffPayments, expenses, total: outTotal },
        netCashFlow: inTotal - outTotal,
        monthly: [],
      });
    }
    if (ctx.path === '/accounts/ledger' && ctx.method === 'GET') {
      return json(200, { entries: [], opening: 0, closing: 0 });
    }
    if (ctx.path === '/accounts/day-book' && ctx.method === 'GET') {
      return json(200, { date: query.get('date') || periodFrom, entries: [] });
    }
    if (ctx.path === '/accounts/notes' && ctx.method === 'GET') {
      return json(200, []);
    }
    if (ctx.path === '/accounts/notes' && ctx.method === 'POST') {
      return json(201, { ok: true, id: uid('N') });
    }
    if (ctx.path === '/gstr3b/compute' && ctx.method === 'GET') {
      const month = Number(query.get('month')) || new Date().getMonth() + 1;
      const year = Number(query.get('year')) || new Date().getFullYear();
      const zeroTax = { cgst: 0, sgst: 0, igst: 0, total: 0 };
      return json(200, {
        period: { month, year },
        output: { taxableValue: 0, ...zeroTax },
        itc: { ...zeroTax, fromPurchases: 0, fromExpenses: 0 },
        netPayable: { ...zeroTax },
      });
    }
    if (
      (ctx.path.startsWith('/reports/') || ctx.path.startsWith('/gstr') || ctx.path === '/gstr2b/reconcile') &&
      (ctx.method === 'GET' || ctx.method === 'POST')
    ) {
      // Service offline: no distribution/stock/GST filing — empty safe payloads
      if (ctx.path.includes('outstanding')) return json(200, []);
      if (ctx.path.includes('stock')) return json(200, []);
      if (ctx.path.includes('gst') || ctx.path.includes('gstr')) {
        return json(200, {
          rows: [],
          summary: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          month: Number(query.get('month')) || null,
          year: Number(query.get('year')) || null,
        });
      }
      return json(200, { rows: [], items: [], total: 0 });
    }

    // Notifications (local Bell)
    if (ctx.path === '/notifications' && ctx.method === 'GET') {
      return json(200, await listTable('tenant_notifications', tid!, 'created_at DESC'));
    }
    if (ctx.path === '/notifications/read-all' && ctx.method === 'POST') {
      await localQuery(`UPDATE tenant_notifications SET read_at=NOW() WHERE tenant_id=$1 AND read_at IS NULL`, [tid]);
      return json(200, { ok: true });
    }

    // Settings / me / profile (not /settings/bill — handled above)
    if (
      (ctx.path === '/admin/me' ||
        ctx.path === '/auth/me' ||
        ctx.path.startsWith('/settings/profile') ||
        (ctx.path.match(/^\/settings\/[^/]+$/) && ctx.path !== '/settings/bill')) &&
      ctx.method === 'GET'
    ) {
      const { rows } = await localQuery(
        `SELECT u.id, u.email, u.name, u.role, t.company_name AS "companyName", t.business_type AS "businessType",
                t.tab_config AS "tabConfig"
         FROM users u JOIN tenants t ON t.id = u.tenant_id
         WHERE t.id=$1 AND u.id=$2 LIMIT 1`,
        [tid, ctx.auth!.userId],
      );
      const row = (rows[0] as Record<string, unknown> | undefined) || {
        id: ctx.auth!.userId,
        email: ctx.auth!.email,
        name: ctx.auth!.name,
      };
      return json(200, {
        ...row,
        businessType: (row.businessType as string) || (row.business_type as string) || 'service',
        tabConfig: row.tabConfig || row.tab_config || SERVICE_TAB_PRESET,
      });
    }

    // Chatbot removed from Offline Mobile — return 404 if anything still calls it
    if (ctx.path.startsWith('/chatbot')) {
      return json(404, { error: 'Chatbot is not available on Offline Mobile' });
    }

    // Empty-safe stubs for unused / manufacturer-only modules
    if (
      ctx.path.startsWith('/inventory') ||
      ctx.path.startsWith('/distribution') ||
      ctx.path.startsWith('/sales') ||
      ctx.path.startsWith('/warranties') ||
      ctx.path.startsWith('/replacements') ||
      ctx.path.startsWith('/rewards') ||
      ctx.path.startsWith('/vendor-finance') ||
      ctx.path.startsWith('/finance/vendor') ||
      ctx.path === '/vendors/outstanding' ||
      ctx.path.startsWith('/vendor-payments')
    ) {
      if (ctx.method === 'GET') {
        // VendorFinanceView expects an array from /vendor-finance/summary
        return json(200, []);
      }
      return json(403, { error: 'Not available for Offline Mobile service type' });
    }

    return json(404, { error: `Local API: ${ctx.method} ${ctx.path} not implemented` });
  } catch (err) {
    const requestId = uid('req').slice(0, 12);
    console.error('[service-mobile local API]', {
      requestId,
      method,
      path,
      error: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
    });
    return json(500, {
      success: false,
      error: err instanceof Error ? err.message : 'Local API error',
      message: err instanceof Error ? err.message : 'Local API error',
      code: 'LOCAL_API_ERROR',
      requestId,
    });
  }
}
