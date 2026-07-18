/**
 * In-process local API for Service Mobile — ERP traffic stays on-device.
 * Cloud license/sync/backup paths are NOT handled here (see cloud.ts).
 */
import bcrypt from 'bcryptjs';
import { localQuery } from './db';
import { localLogin, verifyLocalToken, type LocalJwtPayload } from './auth';
import { SERVICE_TAB_PRESET } from './schema';
import {
  mapBank,
  mapCustomer,
  mapExpense,
  mapInvoice,
  mapPriceRule,
  mapProduct,
  mapStaff,
  mapSupplier,
  mapVendor,
} from './mappers';
import { buildLineItems, mapOrderRow, mapQuoteRow, nextDocNumber } from './quoteOrderHelpers';
import {
  buildStandaloneInvoiceLines,
  isInterstateSupply,
  resolveLocalPrice,
  resolveSellerGstin,
  splitGstTax,
  type InvoiceLineIn,
} from './invoiceHelpers';

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

/** partyKey: vendor:ID | customer:ID | name:DisplayName (matches cloud parsePartyKey) */
function parseLocalPartyKey(raw: string): {
  partyType: 'vendor' | 'customer' | null;
  partyId: string | null;
  clientName: string | null;
  partyKey: string;
} {
  const key = (() => {
    try {
      return decodeURIComponent(raw || '').trim();
    } catch {
      return (raw || '').trim();
    }
  })();
  if (key.startsWith('vendor:') || key.startsWith('customer:')) {
    const i = key.indexOf(':');
    const partyType = key.slice(0, i) as 'vendor' | 'customer';
    const partyId = key.slice(i + 1).trim();
    if (!partyId) return { partyType: null, partyId: null, clientName: '', partyKey: 'name:' };
    return { partyType, partyId, clientName: null, partyKey: `${partyType}:${partyId}` };
  }
  const name = key.startsWith('name:') ? key.slice(5) : key;
  return { partyType: null, partyId: null, clientName: name, partyKey: `name:${name}` };
}

function toDateStr(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

/**
 * Older Mark Paid only flipped status without writing invoice_payments.
 * Backfill remaining balance so Invoice Finance ledger matches status.
 */
async function reconcilePaidInvoicesLedger(tenantId: string): Promise<void> {
  const { rows } = await localQuery(
    `SELECT si.id,
            COALESCE(si.grand_total, si.total, 0) AS grand_total,
            COALESCE((
              SELECT SUM(ip.amount) FROM invoice_payments ip
              WHERE ip.invoice_id = si.id AND ip.tenant_id = $1
            ), 0) AS paid
     FROM standalone_invoices si
     WHERE si.tenant_id = $1 AND si.status = 'paid'`,
    [tenantId],
  );
  for (const r of rows as { id: string; grand_total: number; paid: number }[]) {
    const remaining = (Number(r.grand_total) || 0) - (Number(r.paid) || 0);
    if (remaining <= 0.001) continue;
    const payId = uid('IP');
    const pDate = new Date().toISOString().slice(0, 10);
    await localQuery(
      `INSERT INTO invoice_payments
         (id, tenant_id, invoice_id, amount, payment_date, method, payment_method, notes)
       VALUES ($1,$2,$3,$4,$5,'Cash','Cash',$6)`,
      [payId, tenantId, r.id, remaining, pDate, 'Marked paid (ledger sync)'],
    );
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
        let rows = await listTable('vendors', tid!, 'name ASC');
        const search = (query.get('search') || '').trim().toLowerCase();
        if (search) {
          rows = rows.filter(r => {
            const rec = r as Record<string, unknown>;
            return [rec.name, rec.phone, rec.email, rec.address, rec.gstin]
              .map(v => String(v || '').toLowerCase())
              .some(v => v.includes(search));
          });
        }
        return json(
          200,
          rows.map(r => mapVendor(r as Record<string, unknown>)),
        );
      }
      if (ctx.method === 'POST') {
        const b = ctx.body as Record<string, unknown>;
        const id = uid('V');
        const gstin = b.gstin ?? b.gstNumber ?? null;
        await localQuery(
          `INSERT INTO vendors (id, tenant_id, name, phone, email, address, gstin) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, tid, b.name, b.phone ?? null, b.email ?? null, b.address ?? null, gstin],
        );
        const { rows } = await localQuery(`SELECT * FROM vendors WHERE id=$1`, [id]);
        return json(201, mapVendor(rows[0] as Record<string, unknown>));
      }
    }
    if (ctx.path === '/vendors/bulk' && ctx.method === 'POST') {
      const { vendors } = (ctx.body || {}) as { vendors?: Record<string, unknown>[] };
      if (!Array.isArray(vendors) || vendors.length === 0) {
        return json(400, { error: 'Provide an array of vendors' });
      }
      if (vendors.length > 500) return json(400, { error: 'Maximum 500 vendors per import' });
      for (let i = 0; i < vendors.length; i++) {
        const name = String(vendors[i]?.name || '').trim();
        if (!name) return json(400, { error: `Row ${i + 2}: Name is required — no vendors were imported` });
      }
      // Validate duplicates before any insert (fail-fast, match cloud)
      for (const v of vendors) {
        const name = String(v.name).trim();
        const email = v.email ? String(v.email) : '';
        const dup = await localQuery(`SELECT id FROM vendors WHERE tenant_id=$1 AND LOWER(name)=LOWER($2)`, [
          tid,
          name,
        ]);
        if (dup.rows[0]) {
          return json(400, { error: `"${name}" already exists — no vendors were imported` });
        }
        if (email) {
          const emailDup = await localQuery(
            `SELECT id FROM vendors WHERE tenant_id=$1 AND email IS NOT NULL AND email != '' AND LOWER(email)=LOWER($2)`,
            [tid, email],
          );
          if (emailDup.rows[0]) {
            return json(400, { error: `Email "${email}" already exists — no vendors were imported` });
          }
        }
      }
      let success = 0;
      for (const v of vendors) {
        const id = uid('V');
        const gstin = v.gstin ?? v.gstNumber ?? null;
        await localQuery(
          `INSERT INTO vendors (id, tenant_id, name, phone, email, address, gstin) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            tid,
            String(v.name).trim(),
            v.phone ? String(v.phone).trim() : null,
            v.email ? String(v.email) : null,
            v.address ? String(v.address) : null,
            gstin ? String(gstin) : null,
          ],
        );
        success++;
      }
      return json(200, { success, errors: [], credentials: [] });
    }
    if (ctx.path === '/vendors/all' && ctx.method === 'DELETE') {
      await localQuery(`DELETE FROM price_lists WHERE tenant_id=$1`, [tid]);
      await localQuery(`DELETE FROM quotations WHERE tenant_id=$1`, [tid]);
      await localQuery(`DELETE FROM orders WHERE tenant_id=$1`, [tid]);
      const before = await localQuery(`SELECT COUNT(*)::int AS c FROM vendors WHERE tenant_id=$1`, [tid]);
      const deleted = Number((before.rows[0] as { c: number }).c) || 0;
      await localQuery(`DELETE FROM vendors WHERE tenant_id=$1`, [tid]);
      return json(200, { deleted });
    }
    const vendorMatch = ctx.path.match(/^\/vendors\/([^/]+)$/);
    if (vendorMatch && vendorMatch[1] !== 'bulk' && vendorMatch[1] !== 'all') {
      const id = vendorMatch[1]!;
      if (ctx.method === 'GET') {
        const { rows } = await localQuery(`SELECT * FROM vendors WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return rows[0] ? json(200, mapVendor(rows[0] as Record<string, unknown>)) : json(404, { error: 'Not found' });
      }
      if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
        const b = ctx.body as Record<string, unknown>;
        const gstin = b.gstin ?? b.gstNumber ?? null;
        await localQuery(
          `UPDATE vendors SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email),
           address=COALESCE($4,address), gstin=COALESCE($5,gstin) WHERE id=$6 AND tenant_id=$7`,
          [b.name ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, gstin, id, tid],
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
    const customerMatch = ctx.path.match(/^\/customers\/([^/]+)$/);
    if (customerMatch) {
      const id = customerMatch[1]!;
      if (ctx.method === 'GET') {
        const { rows } = await localQuery(`SELECT * FROM customers WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return rows[0] ? json(200, mapCustomer(rows[0] as Record<string, unknown>)) : json(404, { error: 'Not found' });
      }
      if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
        const b = ctx.body as Record<string, unknown>;
        await localQuery(
          `UPDATE customers SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email),
           address=COALESCE($4,address) WHERE id=$5 AND tenant_id=$6`,
          [b.name ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, id, tid],
        );
        const { rows } = await localQuery(`SELECT * FROM customers WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return rows[0] ? json(200, mapCustomer(rows[0] as Record<string, unknown>)) : json(404, { error: 'Not found' });
      }
      if (ctx.method === 'DELETE') {
        await localQuery(`DELETE FROM customers WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return json(200, { ok: true });
      }
    }

    // Categories / products (masters)
    if (ctx.path === '/categories' && ctx.method === 'GET') {
      const rows = await listTable('categories', tid!);
      return json(
        200,
        rows.map(r => ({
          id: (r as { id: string }).id,
          name: (r as { name: string }).name,
          createdAt: (r as { created_at?: string }).created_at,
        })),
      );
    }
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
      const gst = Number(b.gstRate ?? b.gstPercent ?? b.gst_rate ?? b.gst_percent) || 18;
      await localQuery(
        `INSERT INTO products
           (id, tenant_id, name, sku, barcode, price, gst_percent, gst_rate, hsn_code, stock, warranty_months, price_includes_gst)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11)`,
        [
          id,
          tid,
          b.name,
          b.sku ?? null,
          b.barcode ?? null,
          b.price ?? 0,
          gst,
          b.hsnCode ?? b.hsn_code ?? null,
          b.stock ?? 0,
          b.warrantyMonths ?? b.warranty_months ?? 0,
          !!b.priceIncludesGst,
        ],
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
        const gstRaw = b.gstRate ?? b.gstPercent;
        const gst = gstRaw != null ? Number(gstRaw) : null;
        await localQuery(
          `UPDATE products SET name=COALESCE($1,name), sku=COALESCE($2,sku), price=COALESCE($3,price),
           gst_percent=COALESCE($4,gst_percent), gst_rate=COALESCE($4,gst_rate),
           hsn_code=COALESCE($5,hsn_code), barcode=COALESCE($6,barcode),
           price_includes_gst=COALESCE($7,price_includes_gst)
           WHERE id=$8 AND tenant_id=$9`,
          [
            b.name ?? null,
            b.sku ?? null,
            b.price != null ? Number(b.price) : null,
            gst,
            b.hsnCode ?? b.hsn_code ?? null,
            b.barcode ?? null,
            b.priceIncludesGst != null ? !!b.priceIncludesGst : null,
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
    if (ctx.path === '/staff/batch' && ctx.method === 'POST') {
      const { items } = (ctx.body || {}) as { items?: Record<string, unknown>[] };
      if (!Array.isArray(items) || items.length === 0) {
        return json(400, { error: 'No items to import' });
      }
      for (let i = 0; i < items.length; i++) {
        if (!items[i]?.name || !String(items[i]!.name).trim()) {
          return json(400, { error: `Row ${i + 2}: Name is required — no staff were imported` });
        }
      }
      for (const r of items) {
        const name = String(r.name).trim();
        const dup = await localQuery(`SELECT id FROM staff_members WHERE tenant_id=$1 AND LOWER(name)=LOWER($2)`, [
          tid,
          name,
        ]);
        if (dup.rows[0]) {
          return json(400, { error: `"${name}" already exists — no staff were imported` });
        }
      }
      let success = 0;
      for (const r of items) {
        const id = uid('ST');
        await localQuery(
          `INSERT INTO staff_members (id, tenant_id, name, phone, role, address, salary, joining_date, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active')`,
          [
            id,
            tid,
            String(r.name).trim(),
            r.phone ?? null,
            r.role ?? null,
            r.address ?? null,
            r.salary != null ? Number(r.salary) : 0,
            r.joiningDate ?? null,
          ],
        );
        success++;
      }
      return json(201, { success, errors: [] });
    }
    const staffMatch = ctx.path.match(/^\/staff\/([^/]+)$/);
    if (staffMatch && staffMatch[1] !== 'batch') {
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
    if (ctx.path === '/payroll/staff' && ctx.method === 'GET') {
      const search = query.get('search');
      let sql = `SELECT staff_name, SUM(amount) AS total_paid, COUNT(*)::int AS payment_count,
        MAX(payment_date) AS last_payment, MIN(payment_date) AS first_payment
        FROM staff_payments WHERE tenant_id = $1`;
      const params: unknown[] = [tid];
      if (search) {
        sql += ` AND staff_name ILIKE $2`;
        params.push(`%${search}%`);
      }
      sql += ' GROUP BY staff_name ORDER BY staff_name';
      const { rows } = await localQuery(sql, params);
      return json(
        200,
        rows.map(r => ({
          name: r.staff_name,
          totalPaid: Number(r.total_paid) || 0,
          paymentCount: Number(r.payment_count) || 0,
          lastPayment: r.last_payment,
          firstPayment: r.first_payment,
        })),
      );
    }
    if (ctx.path === '/payroll/summary' && ctx.method === 'GET') {
      const y = Number(query.get('year')) || new Date().getFullYear();
      const [byStaffR, byMonthR, grandR, advR] = await Promise.all([
        localQuery(
          `SELECT staff_name,
             SUM(CASE WHEN payment_type IN ('salary','bonus') THEN amount ELSE 0 END) AS total,
             COUNT(*)::int AS payments
           FROM staff_payments WHERE tenant_id=$1 AND year=$2
           GROUP BY staff_name ORDER BY total DESC`,
          [tid, y],
        ),
        localQuery(
          `SELECT month,
             SUM(CASE WHEN payment_type IN ('salary','bonus') THEN amount ELSE 0 END) AS total,
             COUNT(*)::int AS payments
           FROM staff_payments WHERE tenant_id=$1 AND year=$2
           GROUP BY month ORDER BY month`,
          [tid, y],
        ),
        localQuery(
          `SELECT COALESCE(SUM(CASE WHEN payment_type IN ('salary','bonus') THEN amount ELSE 0 END),0) AS t
           FROM staff_payments WHERE tenant_id=$1 AND year=$2`,
          [tid, y],
        ),
        localQuery(
          `SELECT COALESCE(
             SUM(CASE WHEN payment_type = 'advance' THEN amount ELSE 0 END)
             - SUM(CASE WHEN payment_type = 'advance_repay' THEN amount ELSE 0 END)
           , 0) AS bal
           FROM staff_payments WHERE tenant_id=$1`,
          [tid],
        ),
      ]);
      return json(200, {
        year: y,
        grandTotal: Number((grandR.rows[0] as { t: number })?.t) || 0,
        advanceOutstanding: Math.max(0, Number((advR.rows[0] as { bal: number })?.bal) || 0),
        byStaff: byStaffR.rows.map(r => ({
          name: String(r.staff_name),
          total: Number(r.total) || 0,
          payments: Number(r.payments) || 0,
        })),
        byMonth: byMonthR.rows.map(r => ({
          month: String(r.month),
          total: Number(r.total) || 0,
          payments: Number(r.payments) || 0,
        })),
      });
    }
    if (ctx.path === '/payroll' && ctx.method === 'GET') {
      const month = query.get('month');
      const yearQ = query.get('year');
      const staffName = query.get('staffName');
      let sql = 'SELECT * FROM staff_payments WHERE tenant_id = $1';
      const params: unknown[] = [tid];
      let idx = 2;
      if (month && yearQ) {
        sql += ` AND month = $${idx++} AND year = $${idx++}`;
        params.push(month, Number(yearQ));
      }
      if (staffName) {
        sql += ` AND staff_name ILIKE $${idx++}`;
        params.push(`%${staffName}%`);
      }
      sql += ' ORDER BY payment_date DESC NULLS LAST, created_at DESC';
      const { rows } = await localQuery(sql, params);
      return json(
        200,
        rows.map(r => ({
          id: r.id,
          staffName: r.staff_name,
          amount: Number(r.amount) || 0,
          paymentDate: r.payment_date,
          paymentType: (r.payment_type as string) || 'salary',
          paymentMethod: r.payment_method || 'Cash',
          referenceNumber: r.reference_number ?? undefined,
          notes: r.notes ?? undefined,
          month: r.month,
          year: r.year != null ? Number(r.year) : undefined,
        })),
      );
    }
    if (ctx.path === '/payroll' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const staffName = String(b.staffName ?? '').trim();
      if (!staffName) return json(400, { error: 'Staff name is required' });
      const amount = Number(b.amount);
      if (!amount || amount <= 0) return json(400, { error: 'Amount must be greater than 0' });
      const validTypes = ['salary', 'advance', 'advance_repay', 'bonus', 'deduction'];
      const pType = validTypes.includes(String(b.paymentType)) ? String(b.paymentType) : 'salary';
      const id = uid('SP');
      const date = String(b.paymentDate || new Date().toISOString().slice(0, 10));
      const d = new Date(date);
      const m = String(b.month || String(d.getMonth() + 1).padStart(2, '0'));
      const y = Number(b.year) || d.getFullYear();
      const paymentMethod = String(b.paymentMethod || 'Cash');
      const referenceNumber = b.referenceNumber ? String(b.referenceNumber) : null;
      const notes = b.notes ? String(b.notes) : null;
      let staffId: string | null = null;
      const { rows: staffRows } = await localQuery(
        `SELECT id, name, role FROM staff_members WHERE tenant_id=$1 AND LOWER(name)=LOWER($2) LIMIT 1`,
        [tid, staffName],
      );
      const staffRow = staffRows[0] as { id: string; name: string; role?: string } | undefined;
      if (staffRow) staffId = staffRow.id;
      await localQuery(
        `INSERT INTO staff_payments
           (id, tenant_id, staff_id, staff_name, amount, payment_date, payment_type, payment_method, reference_number, notes, month, year)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
        [id, tid, staffId, staffName, amount, date, pType, paymentMethod, referenceNumber, notes, m, y],
      );
      // Mirror cloud: sync non-deduction payroll into expenses (best-effort)
      if (pType !== 'deduction') {
        const verifiedName = staffRow?.name || staffName;
        const roleHint = staffRow?.role ? ` (${staffRow.role})` : '';
        const typeLabel =
          (
            {
              salary: 'Salary',
              advance: 'Advance Given',
              advance_repay: 'Advance Repaid',
              bonus: 'Bonus',
              deduction: 'Deduction',
            } as Record<string, string>
          )[pType] || pType;
        const expenseAmount = pType === 'advance_repay' ? -amount : amount;
        const expCategory =
          pType === 'advance_repay'
            ? 'Staff Advance Repaid'
            : pType === 'advance'
              ? 'Staff Advance'
              : pType === 'bonus'
                ? 'Staff Bonus'
                : 'Staff Salary';
        try {
          await localQuery(
            `INSERT INTO expenses (id, tenant_id, category, amount, description, expense_date)
             VALUES ($1,$2,$3,$4,$5,$6)`,
            [uid('EXP'), tid, expCategory, expenseAmount, `${typeLabel} — ${verifiedName}${roleHint}`, date],
          );
        } catch {
          /* best-effort */
        }
      }
      return json(201, {
        id,
        staffName,
        amount,
        paymentDate: date,
        paymentType: pType,
        paymentMethod,
        referenceNumber: referenceNumber ?? undefined,
        notes: notes ?? undefined,
        month: m,
        year: y,
      });
    }
    const payrollDel = ctx.path.match(/^\/payroll\/([^/]+)$/);
    if (payrollDel && ctx.method === 'DELETE') {
      const result = await localQuery(`DELETE FROM staff_payments WHERE id=$1 AND tenant_id=$2`, [payrollDel[1], tid]);
      if (!result.rowCount) return json(404, { error: 'Payment not found' });
      return json(200, { ok: true });
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
        `INSERT INTO expenses (id, tenant_id, category, amount, description, expense_date, payment_method, reference_number, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [
          id,
          tid,
          b.category ?? null,
          b.amount,
          b.description ?? null,
          b.expenseDate ?? b.expense_date ?? null,
          b.paymentMethod ?? b.payment_method ?? 'Cash',
          b.referenceNumber ?? b.reference_number ?? null,
          b.notes ?? null,
        ],
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
        rows.map(r => mapQuoteRow(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/quotations' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const rate = Number(b.gstRate) || 18;
      const built = await buildLineItems(tid!, (b.items as Parameters<typeof buildLineItems>[1]) || [], rate);
      if ('error' in built) return json(400, { error: built.error });
      const id = uid('Q');
      const qNum = await nextDocNumber('quotations', tid!, 'QT');
      let vendorName: string | null = null;
      if (b.vendorId) {
        const { rows: vr } = await localQuery(`SELECT name FROM vendors WHERE id=$1 AND tenant_id=$2`, [
          b.vendorId,
          tid,
        ]);
        vendorName = (vr[0] as { name?: string } | undefined)?.name ?? null;
      }
      const customerName = (b.customerName as string) || vendorName || null;
      const qDate = (b.quotationDate as string) || new Date().toISOString().slice(0, 10);
      await localQuery(
        `INSERT INTO quotations
           (id, tenant_id, quotation_number, quote_number, vendor_id, vendor_name, client_name, customer_name,
            customer_phone, customer_email, quotation_date, valid_until, status, items, subtotal, gst_rate, gst_amount, total, notes)
         VALUES ($1,$2,$3,$3,$4,$5,$6,$6,$7,$8,$9,$10,'Draft',$11,$12,$13,$14,$15,$16)`,
        [
          id,
          tid,
          qNum,
          b.vendorId ?? null,
          vendorName,
          customerName,
          b.customerPhone ?? null,
          b.customerEmail ?? null,
          qDate,
          b.validUntil ?? null,
          JSON.stringify(built.resolvedItems),
          built.subtotal,
          rate,
          built.gstAmount,
          built.total,
          b.notes ?? null,
        ],
      );
      const { rows } = await localQuery(`SELECT * FROM quotations WHERE id=$1`, [id]);
      return json(201, mapQuoteRow(rows[0] as Record<string, unknown>));
    }
    const quoteConvert = ctx.path.match(/^\/quotations\/([^/]+)\/convert$/);
    if (quoteConvert && ctx.method === 'POST') {
      const qid = quoteConvert[1]!;
      const { rows } = await localQuery(`SELECT * FROM quotations WHERE id=$1 AND tenant_id=$2`, [qid, tid]);
      const quote = rows[0] as Record<string, unknown> | undefined;
      if (!quote) return json(404, { error: 'Quotation not found' });
      if (String(quote.status) === 'Converted') return json(400, { error: 'Already converted' });
      if (String(quote.status) !== 'Accepted')
        return json(400, { error: 'Quotation must be accepted before converting' });
      const items = mapQuoteRow(quote).items;
      const convertReq = Array.isArray((ctx.body as { items?: unknown })?.items)
        ? (ctx.body as { items: { productId: string; quantity: number; lineIndex?: number }[] }).items
        : null;
      const plan: { idx: number; convertQty: number; item: (typeof items)[0] }[] = [];
      const used = new Set<number>();
      if (convertReq?.length) {
        for (const reqLine of convertReq) {
          const idx =
            typeof reqLine.lineIndex === 'number' &&
            reqLine.lineIndex >= 0 &&
            reqLine.lineIndex < items.length &&
            items[reqLine.lineIndex]!.productId === reqLine.productId
              ? reqLine.lineIndex
              : items.findIndex(
                  (i, j) => i.productId === reqLine.productId && !used.has(j) && i.quantity - (i.convertedQty || 0) > 0,
                );
          if (idx < 0 || used.has(idx)) return json(400, { error: `Product not on quotation: ${reqLine.productId}` });
          const item = items[idx]!;
          const remaining = item.quantity - (item.convertedQty || 0);
          const convertQty = Math.max(0, Math.min(remaining, Number(reqLine.quantity) || 0));
          if (convertQty <= 0) return json(400, { error: `No remaining quantity for ${item.productName}` });
          used.add(idx);
          plan.push({ idx, convertQty, item });
        }
      } else {
        items.forEach((item, idx) => {
          const remaining = item.quantity - (item.convertedQty || 0);
          if (remaining > 0) plan.push({ idx, convertQty: remaining, item });
        });
      }
      if (!plan.length) return json(400, { error: 'Nothing left to convert' });
      const invItems = plan.map(p => {
        const withGst = p.item.withGst !== false;
        const unitNet = p.item.lineNet / Math.max(1, p.item.quantity);
        const unitGst = p.item.lineGst / Math.max(1, p.item.quantity);
        const qty = p.convertQty;
        const lineNet = Math.round(unitNet * qty * 100) / 100;
        const lineGst = withGst ? Math.round(unitGst * qty * 100) / 100 : 0;
        return {
          productId: p.item.productId,
          productName: p.item.productName,
          quantity: qty,
          unitPrice: p.item.price,
          lineNet,
          lineGst,
          lineTotal: Math.round((lineNet + lineGst) * 100) / 100,
        };
      });
      const subtotal = invItems.reduce((s, i) => s + i.lineNet, 0);
      const taxTotal = invItems.reduce((s, i) => s + i.lineGst, 0);
      const grandTotal = Math.round((subtotal + taxTotal) * 100) / 100;
      const invId = uid('INV');
      const { rows: cntRows } = await localQuery(
        `SELECT COUNT(*)::int AS c FROM standalone_invoices WHERE tenant_id=$1`,
        [tid],
      );
      const count = Number((cntRows[0] as { c: number }).c) + 1;
      const now = new Date();
      const fy =
        now.getMonth() >= 3
          ? `${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(2)}`
          : `${now.getFullYear() - 1}-${now.getFullYear().toString().slice(2)}`;
      const invNum = `INV/${fy}/${String(count).padStart(4, '0')}`;
      const customerName = String(quote.customer_name || quote.client_name || 'Customer');
      await localQuery(
        `INSERT INTO standalone_invoices
           (id, tenant_id, invoice_number, customer_name, client_name, status, items, subtotal, tax, tax_total, grand_total, total, invoice_date)
         VALUES ($1,$2,$3,$4,$4,'sent',$5,$6,$7,$7,$8,$8,$9)`,
        [
          invId,
          tid,
          invNum,
          customerName,
          JSON.stringify(invItems),
          subtotal,
          taxTotal,
          grandTotal,
          quote.quotation_date || new Date().toISOString().slice(0, 10),
        ],
      );
      for (const p of plan) {
        items[p.idx]!.convertedQty = (items[p.idx]!.convertedQty || 0) + p.convertQty;
      }
      const fullyConverted = items.every(i => (i.convertedQty || 0) >= i.quantity);
      await localQuery(
        `UPDATE quotations SET items=$1, status=$2, converted_invoice_id=COALESCE(converted_invoice_id,$3)
         WHERE id=$4 AND tenant_id=$5`,
        [JSON.stringify(items), fullyConverted ? 'Converted' : 'Accepted', invId, qid, tid],
      );
      return json(200, {
        target: 'invoice',
        invoiceId: invId,
        invoiceNumber: invNum,
        grandTotal,
        fullyConverted,
      });
    }
    const quoteStatus = ctx.path.match(/^\/quotations\/([^/]+)\/status$/);
    if (quoteStatus && ctx.method === 'PUT') {
      const status = String((ctx.body as { status?: string })?.status || '');
      if (status === 'Converted') return json(400, { error: 'Use POST /quotations/:id/convert to convert' });
      await localQuery(`UPDATE quotations SET status=$1 WHERE id=$2 AND tenant_id=$3`, [status, quoteStatus[1], tid]);
      return json(200, { ok: true, status });
    }
    const quoteMatch = ctx.path.match(/^\/quotations\/([^/]+)$/);
    if (quoteMatch) {
      const id = quoteMatch[1]!;
      if (ctx.method === 'GET') {
        const { rows } = await localQuery(`SELECT * FROM quotations WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return rows[0] ? json(200, mapQuoteRow(rows[0] as Record<string, unknown>)) : json(404, { error: 'Not found' });
      }
      if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
        const { rows: curRows } = await localQuery(`SELECT * FROM quotations WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        const current = curRows[0] as Record<string, unknown> | undefined;
        if (!current) return json(404, { error: 'Not found' });
        if (String(current.status) !== 'Draft') return json(400, { error: 'Only Draft quotations can be edited' });
        const b = ctx.body as Record<string, unknown>;
        const rate = Number(b.gstRate) || Number(current.gst_rate) || 18;
        const built = await buildLineItems(tid!, (b.items as Parameters<typeof buildLineItems>[1]) || [], rate);
        if ('error' in built) return json(400, { error: built.error });
        let vendorName = (current.vendor_name as string) || null;
        if (b.vendorId) {
          const { rows: vr } = await localQuery(`SELECT name FROM vendors WHERE id=$1 AND tenant_id=$2`, [
            b.vendorId,
            tid,
          ]);
          vendorName = (vr[0] as { name?: string } | undefined)?.name ?? null;
        }
        const customerName = (b.customerName as string) || vendorName || null;
        await localQuery(
          `UPDATE quotations SET vendor_id=COALESCE($1,vendor_id), vendor_name=$2, client_name=$3, customer_name=$3,
           customer_phone=$4, customer_email=$5, quotation_date=COALESCE($6,quotation_date), valid_until=$7,
           items=$8, subtotal=$9, gst_rate=$10, gst_amount=$11, total=$12, notes=$13
           WHERE id=$14 AND tenant_id=$15`,
          [
            b.vendorId ?? null,
            vendorName,
            customerName,
            b.customerPhone ?? null,
            b.customerEmail ?? null,
            b.quotationDate ?? null,
            b.validUntil ?? null,
            JSON.stringify(built.resolvedItems),
            built.subtotal,
            rate,
            built.gstAmount,
            built.total,
            b.notes ?? null,
            id,
            tid,
          ],
        );
        const { rows } = await localQuery(`SELECT * FROM quotations WHERE id=$1`, [id]);
        return json(200, mapQuoteRow(rows[0] as Record<string, unknown>));
      }
      if (ctx.method === 'DELETE') {
        await localQuery(`DELETE FROM quotations WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return json(200, { ok: true });
      }
    }

    // Orders
    if (ctx.path === '/orders' && ctx.method === 'GET') {
      const rows = await listTable('orders', tid!);
      return json(
        200,
        rows.map(r => mapOrderRow(r as Record<string, unknown>)),
      );
    }
    if (ctx.path === '/orders' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const rate = Number(b.gstRate) || 18;
      const built = await buildLineItems(tid!, (b.items as Parameters<typeof buildLineItems>[1]) || [], rate);
      if ('error' in built) return json(400, { error: built.error });
      const id = uid('O');
      const oNum = await nextDocNumber('orders', tid!, 'ORD');
      let vendorName: string | null = null;
      if (b.vendorId) {
        const { rows: vr } = await localQuery(`SELECT name FROM vendors WHERE id=$1 AND tenant_id=$2`, [
          b.vendorId,
          tid,
        ]);
        vendorName = (vr[0] as { name?: string } | undefined)?.name ?? null;
      }
      const customerName = (b.customerName as string) || vendorName || null;
      const oDate = (b.orderDate as string) || new Date().toISOString().slice(0, 10);
      await localQuery(
        `INSERT INTO orders
           (id, tenant_id, order_number, vendor_id, vendor_name, client_name, customer_name, customer_phone,
            customer_gst_number, order_date, required_date, status, items, subtotal, gst_rate, gst_amount, total, notes)
         VALUES ($1,$2,$3,$4,$5,$6,$6,$7,$8,$9,$10,'Pending',$11,$12,$13,$14,$15,$16)`,
        [
          id,
          tid,
          oNum,
          b.vendorId ?? null,
          vendorName,
          customerName,
          b.customerPhone ?? null,
          b.customerGstNumber ?? null,
          oDate,
          b.requiredDate ?? null,
          JSON.stringify(built.resolvedItems),
          built.subtotal,
          rate,
          built.gstAmount,
          built.total,
          b.notes ?? null,
        ],
      );
      const { rows } = await localQuery(`SELECT * FROM orders WHERE id=$1`, [id]);
      return json(201, mapOrderRow(rows[0] as Record<string, unknown>));
    }
    const orderStatus = ctx.path.match(/^\/orders\/([^/]+)\/status$/);
    if (orderStatus && ctx.method === 'PUT') {
      const status = String((ctx.body as { status?: string })?.status || '');
      if (status === 'Fulfilled') return json(400, { error: 'Use POST /orders/:id/fulfill to fulfill' });
      await localQuery(`UPDATE orders SET status=$1 WHERE id=$2 AND tenant_id=$3`, [status, orderStatus[1], tid]);
      return json(200, { ok: true, status });
    }
    const orderFulfill = ctx.path.match(/^\/orders\/([^/]+)\/fulfill$/);
    if (orderFulfill && ctx.method === 'POST') {
      const oid = orderFulfill[1]!;
      const { rows } = await localQuery(`SELECT * FROM orders WHERE id=$1 AND tenant_id=$2`, [oid, tid]);
      const order = rows[0] as Record<string, unknown> | undefined;
      if (!order) return json(404, { error: 'Order not found' });
      if (String(order.status) === 'Fulfilled') return json(400, { error: 'Already fulfilled' });
      const mapped = mapOrderRow(order);
      const invId = uid('INV');
      const { rows: cntRows } = await localQuery(
        `SELECT COUNT(*)::int AS c FROM standalone_invoices WHERE tenant_id=$1`,
        [tid],
      );
      const count = Number((cntRows[0] as { c: number }).c) + 1;
      const now = new Date();
      const fy =
        now.getMonth() >= 3
          ? `${now.getFullYear()}-${(now.getFullYear() + 1).toString().slice(2)}`
          : `${now.getFullYear() - 1}-${now.getFullYear().toString().slice(2)}`;
      const invNum = `INV/${fy}/${String(count).padStart(4, '0')}`;
      await localQuery(
        `INSERT INTO standalone_invoices
           (id, tenant_id, invoice_number, customer_name, client_name, status, items, subtotal, tax, tax_total, grand_total, total, invoice_date)
         VALUES ($1,$2,$3,$4,$4,'sent',$5,$6,$7,$7,$8,$8,$9)`,
        [
          invId,
          tid,
          invNum,
          mapped.customerName || 'Customer',
          JSON.stringify(mapped.items),
          mapped.subtotal,
          mapped.gstAmount,
          mapped.total,
          mapped.orderDate || new Date().toISOString().slice(0, 10),
        ],
      );
      await localQuery(`UPDATE orders SET status='Fulfilled', fulfilled_batch_id=$1 WHERE id=$2 AND tenant_id=$3`, [
        invId,
        oid,
        tid,
      ]);
      const totalQty = mapped.items.reduce((s, i) => s + i.quantity, 0);
      return json(200, { batchId: invNum, total: totalQty, billValue: mapped.total, invoiceId: invId });
    }
    const orderMatch = ctx.path.match(/^\/orders\/([^/]+)$/);
    if (orderMatch) {
      const id = orderMatch[1]!;
      if (ctx.method === 'GET') {
        const { rows } = await localQuery(`SELECT * FROM orders WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return rows[0] ? json(200, mapOrderRow(rows[0] as Record<string, unknown>)) : json(404, { error: 'Not found' });
      }
      if (ctx.method === 'DELETE') {
        await localQuery(`DELETE FROM orders WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return json(200, { ok: true });
      }
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
        const customerName = String(b.customerName ?? b.clientName ?? b.client_name ?? '').trim();
        if (!customerName) return json(400, { error: 'Customer name is required' });

        let resolvedPartyType: string | null = null;
        let resolvedPartyId: string | null = null;
        if (b.partyType != null || b.partyId != null) {
          if (b.partyType !== 'vendor' && b.partyType !== 'customer') {
            return json(400, { error: 'partyType must be vendor or customer' });
          }
          if (!b.partyId || typeof b.partyId !== 'string') {
            return json(400, { error: 'partyId is required when partyType is set' });
          }
          if (b.partyType === 'vendor') {
            const { rows: vr } = await localQuery(`SELECT id FROM vendors WHERE id=$1 AND tenant_id=$2`, [
              b.partyId,
              tid,
            ]);
            if (!vr[0]) return json(400, { error: 'Vendor not found' });
          } else {
            const { rows: cr } = await localQuery(`SELECT id FROM customers WHERE id=$1 AND tenant_id=$2`, [
              b.partyId,
              tid,
            ]);
            if (!cr[0]) return json(400, { error: 'Customer not found' });
          }
          resolvedPartyType = String(b.partyType);
          resolvedPartyId = String(b.partyId);
        }

        // paid/cancelled only via status update — never on create (same as cloud)
        let createStatus = 'draft';
        if (b.status === 'sent' || b.status === 'unpaid') createStatus = 'sent';
        else if (b.status === 'draft' || b.status == null) createStatus = 'draft';
        else if (b.status) {
          return json(400, {
            error: 'New invoices can only be draft or sent. Mark paid after recording payment.',
          });
        }

        const priceVendorId = resolvedPartyType === 'vendor' ? resolvedPartyId : null;
        const built = await buildStandaloneInvoiceLines(tid!, (b.items as InvoiceLineIn[]) || [], priceVendorId);
        if ('error' in built) return json(400, { error: built.error });

        const sellerGstin = await resolveSellerGstin(tid!);
        const customerGstin = (b.customerGstin as string) || null;
        const interstate = isInterstateSupply(sellerGstin, customerGstin);
        const { taxCgst, taxSgst, taxIgst } = splitGstTax(built.taxTotal, interstate);

        const id = uid('INV');
        const invoiceNumber = (b.invoiceNumber as string) || (b.invoice_number as string) || `INV-${Date.now()}`;
        await localQuery(
          `INSERT INTO standalone_invoices
             (id, tenant_id, invoice_number, customer_name, client_name, client_id, customer_gstin, customer_address,
              customer_phone, party_type, party_id, status, items, subtotal, tax, tax_total, grand_total, total,
              notes, terms, invoice_date, due_date, tax_cgst, tax_sgst, tax_igst, is_interstate)
           VALUES ($1,$2,$3,$4,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14,$15,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
          [
            id,
            tid,
            invoiceNumber,
            customerName,
            resolvedPartyId,
            customerGstin,
            b.customerAddress ?? null,
            b.customerPhone ?? null,
            resolvedPartyType,
            resolvedPartyId,
            createStatus,
            JSON.stringify(built.lineItems),
            built.subtotal,
            built.taxTotal,
            built.grandTotal,
            b.notes ?? null,
            b.terms ?? null,
            b.invoiceDate ?? b.invoice_date ?? new Date().toISOString().slice(0, 10),
            b.dueDate ?? null,
            taxCgst,
            taxSgst,
            taxIgst,
            interstate,
          ],
        );
        const { rows } = await localQuery(`SELECT * FROM standalone_invoices WHERE id=$1`, [id]);
        return json(201, mapInvoice(rows[0] as Record<string, unknown>));
      }
    }
    const invStatusMatch = ctx.path.match(/^\/invoices\/([^/]+)\/status$/);
    if (invStatusMatch && ctx.method === 'PUT') {
      const b = ctx.body as { status?: string };
      const status = b.status;
      if (!status || !['draft', 'sent', 'paid', 'cancelled'].includes(status)) {
        return json(400, { error: 'Invalid status' });
      }
      const invId = invStatusMatch[1]!;
      const { rows: invRows } = await localQuery(
        `SELECT id, COALESCE(grand_total, total, 0) AS grand_total, status
         FROM standalone_invoices WHERE id=$1 AND tenant_id=$2`,
        [invId, tid],
      );
      if (!invRows[0]) return json(404, { error: 'Invoice not found' });
      const grand = Number((invRows[0] as { grand_total: number }).grand_total) || 0;

      if (status === 'cancelled') {
        const { rows: payCount } = await localQuery(
          `SELECT COUNT(*)::int AS c FROM invoice_payments WHERE invoice_id=$1 AND tenant_id=$2`,
          [invId, tid],
        );
        if (Number((payCount[0] as { c: number }).c) > 0) {
          return json(400, { error: 'Cannot cancel invoice with payments. Delete payments first.' });
        }
      }

      // Mark Paid: auto-record remaining balance as Cash payment so ledger stays consistent
      if (status === 'paid') {
        const { rows: paidRows } = await localQuery(
          `SELECT COALESCE(SUM(amount),0) AS t FROM invoice_payments WHERE invoice_id=$1 AND tenant_id=$2`,
          [invId, tid],
        );
        const paid = Number((paidRows[0] as { t: number }).t) || 0;
        const remaining = grand - paid;
        if (remaining > 0.001) {
          const payId = uid('IP');
          const pDate = new Date().toISOString().slice(0, 10);
          await localQuery(
            `INSERT INTO invoice_payments
               (id, tenant_id, invoice_id, amount, payment_date, method, payment_method, notes)
             VALUES ($1,$2,$3,$4,$5,'Cash','Cash',$6)`,
            [payId, tid, invId, remaining, pDate, 'Marked paid'],
          );
        }
      }

      await localQuery(`UPDATE standalone_invoices SET status=$1 WHERE id=$2 AND tenant_id=$3`, [status, invId, tid]);
      return json(200, { ok: true });
    }
    const invMatch = ctx.path.match(/^\/invoices\/([^/]+)$/);
    if (invMatch && ctx.method === 'DELETE') {
      const invId = invMatch[1]!;
      const { rows: payCount } = await localQuery(
        `SELECT COUNT(*)::int AS c FROM invoice_payments WHERE invoice_id=$1 AND tenant_id=$2`,
        [invId, tid],
      );
      if (Number((payCount[0] as { c: number }).c) > 0) {
        return json(400, { error: 'Cannot delete invoice with payments. Delete payments first.' });
      }
      await localQuery(`DELETE FROM standalone_invoices WHERE id=$1 AND tenant_id=$2`, [invId, tid]);
      return json(200, { ok: true });
    }

    // Invoice finance summary / client
    if (ctx.path === '/invoice-finance/summary' && ctx.method === 'GET') {
      await reconcilePaidInvoicesLedger(tid!);
      const { rows } = await localQuery(
        `SELECT
           CASE
             WHEN si.party_type IS NOT NULL AND si.party_id IS NOT NULL THEN si.party_type || ':' || si.party_id
             ELSE 'name:' || COALESCE(si.customer_name, si.client_name, 'Unknown')
           END AS party_key,
           MAX(si.party_type) AS party_type,
           MAX(si.party_id) AS party_id,
           MAX(COALESCE(si.customer_name, si.client_name, 'Unknown')) AS customer_name,
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
        (rows || []).map(r => {
          const totalInvoiced = Number(r.total_invoiced) || 0;
          const totalPaid = Number(r.total_paid) || 0;
          return {
            partyKey: String(r.party_key || 'name:Unknown'),
            partyType: (r.party_type as string) || null,
            partyId: (r.party_id as string) || null,
            clientName: String(r.customer_name || 'Unknown'),
            clientPhone: (r.customer_phone as string) || null,
            invoiceCount: Number(r.invoice_count) || 0,
            totalInvoiced,
            totalPaid,
            balance: totalInvoiced - totalPaid,
          };
        }),
      );
    }
    const invClientMatch = ctx.path.match(/^\/invoice-finance\/client\/(.+)$/);
    if (invClientMatch && ctx.method === 'GET') {
      await reconcilePaidInvoicesLedger(tid!);
      const { partyType, partyId, clientName, partyKey } = parseLocalPartyKey(invClientMatch[1]!);
      let where = `si.tenant_id=$1 AND COALESCE(si.status,'') != 'cancelled'`;
      const params: unknown[] = [tid];
      if (partyType && partyId) {
        where += ` AND si.party_type=$2 AND si.party_id=$3`;
        params.push(partyType, partyId);
      } else {
        // Legacy name: keys — only unlinked invoices (same as cloud)
        where += ` AND COALESCE(si.customer_name, si.client_name)=$2
                   AND (si.party_type IS NULL OR si.party_id IS NULL)`;
        params.push(clientName || '');
      }
      const { rows: invoices } = await localQuery(
        `SELECT si.id, si.invoice_number, si.invoice_date, si.due_date,
                COALESCE(si.grand_total, si.total, 0) AS grand_total,
                si.subtotal, si.tax_total, si.status, si.notes,
                si.customer_name, si.client_name, si.customer_phone,
                si.customer_gstin, si.customer_address, si.party_type, si.party_id,
                COALESCE(SUM(ip.amount),0) AS paid
         FROM standalone_invoices si
         LEFT JOIN invoice_payments ip ON ip.invoice_id=si.id AND ip.tenant_id=$1
         WHERE ${where}
         GROUP BY si.id ORDER BY si.invoice_date DESC NULLS LAST`,
        params,
      );
      const mapped = (invoices || []).map(r => {
        const row = r as Record<string, unknown>;
        const grandTotal = Number(row.grand_total) || 0;
        const paid = Number(row.paid) || 0;
        return {
          id: row.id,
          invoiceNumber: row.invoice_number,
          invoiceDate: toDateStr(row.invoice_date),
          dueDate: toDateStr(row.due_date),
          grandTotal,
          subtotal: Number(row.subtotal) || 0,
          taxTotal: Number(row.tax_total) || 0,
          paid,
          balance: grandTotal - paid,
          status: (row.status as string) || 'draft',
          notes: row.notes ?? null,
        };
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
      if (partyType && partyId) {
        paySql += ` AND si.party_type=$2 AND si.party_id=$3`;
        payParams.push(partyType, partyId);
      } else {
        paySql += ` AND COALESCE(si.customer_name, si.client_name)=$2
                    AND (si.party_type IS NULL OR si.party_id IS NULL)`;
        payParams.push(clientName || '');
      }
      paySql += ` ORDER BY ip.payment_date DESC NULLS LAST, ip.created_at DESC`;
      const { rows: payRows } = await localQuery(paySql, payParams);

      return json(200, {
        partyKey,
        partyType: partyType || (first?.party_type as string) || null,
        partyId: partyId || (first?.party_id as string) || null,
        clientName: String(first?.customer_name || first?.client_name || clientName || 'Client'),
        clientPhone: (first?.customer_phone as string) || null,
        customerGstin: (first?.customer_gstin as string) || null,
        customerAddress: (first?.customer_address as string) || null,
        totalInvoiced,
        totalPaid,
        balance: totalInvoiced - totalPaid,
        invoices: mapped,
        payments: (payRows || []).map(r => ({
          id: r.id,
          invoiceId: r.invoice_id,
          invoiceNumber: r.invoice_number,
          amount: Number(r.amount) || 0,
          paymentDate: toDateStr(r.payment_date),
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
            paymentDate: toDateStr(r.payment_date),
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
        // Allow small float slack; Extra Pay (credit) is allowed when remaining <= 0
        if (remaining > 0.001 && payAmt > remaining + 0.001) {
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
      return new Response(null, { status: 204 });
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
          b.ifsc ?? b.ifscCode ?? null,
          b.balance ?? 0,
          b.accountName ?? null,
          b.bankName ?? null,
          b.branch ?? null,
        ],
      );
      const { rows } = await localQuery(`SELECT * FROM banks WHERE id=$1`, [id]);
      return json(201, mapBank(rows[0] as Record<string, unknown>));
    }
    if (ctx.path === '/banks/batch' && ctx.method === 'POST') {
      const { items } = (ctx.body || {}) as { items?: Record<string, unknown>[] };
      if (!Array.isArray(items) || items.length === 0) {
        return json(400, { error: 'No items to import' });
      }
      for (let i = 0; i < items.length; i++) {
        const name = String(items[i]?.name || '').trim();
        if (!name) {
          return json(400, { error: `Row ${i + 1}: Name is required — no banks were imported` });
        }
      }
      for (const r of items) {
        const acNo = String(r.accountNumber || '').trim();
        if (acNo) {
          const dup = await localQuery(`SELECT id FROM banks WHERE tenant_id=$1 AND account_number=$2`, [tid, acNo]);
          if (dup.rows[0]) {
            return json(400, { error: `Account "${acNo}" already exists — no banks were imported` });
          }
        }
      }
      let success = 0;
      for (const r of items) {
        const id = uid('B');
        const name = String(r.name || '').trim();
        const acNo = String(r.accountNumber || '').trim() || null;
        await localQuery(
          `INSERT INTO banks (id, tenant_id, name, account_number, ifsc, balance, account_name, bank_name, branch)
           VALUES ($1,$2,$3,$4,$5,0,$6,$7,$8)`,
          [id, tid, name, acNo, r.ifscCode ?? r.ifsc ?? null, name, r.bankName ?? null, r.branch ?? null],
        );
        success++;
      }
      return json(201, { success, errors: [] });
    }
    const bankMatch = ctx.path.match(/^\/banks\/([^/]+)$/);
    if (bankMatch && bankMatch[1] !== 'batch') {
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

    // Price resolve (InvoicesView / QuotationsView — same shape as cloud)
    if (ctx.path === '/price-lists/resolve' && ctx.method === 'GET') {
      const productId = query.get('productId');
      if (!productId) return json(400, { error: 'productId required' });
      const vendorId = query.get('vendorId');
      const quantity = Number(query.get('quantity')) || 1;
      const resolved = await resolveLocalPrice(tid!, productId, vendorId, quantity);
      return json(200, resolved);
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
    if (priceListMatch && priceListMatch[1] !== 'bulk' && priceListMatch[1] !== 'resolve') {
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
      const type = query.get('type') || 'all';
      const entries: {
        date: string;
        type: string;
        particulars: string;
        refId: string;
        debit: number;
        credit: number;
      }[] = [];

      if (type === 'all' || type === 'sales') {
        const inv = await localQuery(
          `SELECT id, invoice_date AS dt, COALESCE(customer_name, client_name, 'Customer') AS customer_name,
                  COALESCE(subtotal,0) AS amount, invoice_number
           FROM standalone_invoices
           WHERE tenant_id=$1 AND COALESCE(status,'') NOT IN ('cancelled','draft')
             AND (invoice_date IS NULL OR (invoice_date >= $2 AND invoice_date <= $3))
           ORDER BY invoice_date`,
          [tid, periodFrom, periodTo],
        );
        for (const r of inv.rows as Record<string, unknown>[]) {
          entries.push({
            date: String(r.dt || periodFrom),
            type: 'Invoice',
            particulars: `Invoice ${r.invoice_number} — ${r.customer_name}`,
            refId: String(r.id),
            debit: Number(r.amount) || 0,
            credit: 0,
          });
        }
      }

      if (type === 'all' || type === 'purchases') {
        const purch = await localQuery(
          `SELECT pp.batch_id AS ref_id, MIN(pp.purchase_date) AS dt,
                  COALESCE(s.name, 'Supplier') AS supplier_name,
                  SUM(COALESCE(pp.billed_price, pp.cost_price, 0) * COALESCE(pp.qty, 1)) AS amount,
                  COUNT(*)::int AS qty
           FROM product_purchases pp
           LEFT JOIN suppliers s ON s.id = pp.supplier_id AND s.tenant_id = pp.tenant_id
           WHERE pp.tenant_id=$1
             AND (pp.purchase_date IS NULL OR (pp.purchase_date >= $2 AND pp.purchase_date <= $3))
           GROUP BY pp.batch_id, s.name
           ORDER BY MIN(pp.purchase_date)`,
          [tid, periodFrom, periodTo],
        );
        for (const r of purch.rows as Record<string, unknown>[]) {
          entries.push({
            date: String(r.dt || periodFrom),
            type: 'Purchase',
            particulars: `Purchase from ${r.supplier_name} (${r.qty} items)`,
            refId: String(r.ref_id || ''),
            debit: 0,
            credit: Number(r.amount) || 0,
          });
        }
      }

      if (type === 'all' || type === 'payments') {
        const invPay = await localQuery(
          `SELECT ip.id AS ref_id, ip.payment_date AS dt,
                  COALESCE(si.customer_name, si.client_name, 'Customer') AS customer_name,
                  ip.amount, COALESCE(ip.payment_method, ip.method, 'Cash') AS payment_method
           FROM invoice_payments ip
           JOIN standalone_invoices si ON si.id = ip.invoice_id AND si.tenant_id = ip.tenant_id
           WHERE ip.tenant_id=$1
             AND (ip.payment_date IS NULL OR (ip.payment_date >= $2 AND ip.payment_date <= $3))
           ORDER BY ip.payment_date`,
          [tid, periodFrom, periodTo],
        );
        for (const r of invPay.rows as Record<string, unknown>[]) {
          entries.push({
            date: String(r.dt || periodFrom),
            type: 'Invoice Payment',
            particulars: `Invoice payment from ${r.customer_name} (${r.payment_method})`,
            refId: String(r.ref_id),
            debit: Number(r.amount) || 0,
            credit: 0,
          });
        }
        const sp = await localQuery(
          `SELECT sp.id AS ref_id, sp.payment_date AS dt,
                  COALESCE(s.name, 'Supplier') AS supplier_name,
                  sp.amount, COALESCE(sp.payment_method, 'Cash') AS payment_method
           FROM supplier_payments sp
           LEFT JOIN suppliers s ON s.id = sp.supplier_id AND s.tenant_id = sp.tenant_id
           WHERE sp.tenant_id=$1
             AND (sp.payment_date IS NULL OR (sp.payment_date >= $2 AND sp.payment_date <= $3))
           ORDER BY sp.payment_date`,
          [tid, periodFrom, periodTo],
        );
        for (const r of sp.rows as Record<string, unknown>[]) {
          entries.push({
            date: String(r.dt || periodFrom),
            type: 'Payment Made',
            particulars: `Payment to ${r.supplier_name} (${r.payment_method})`,
            refId: String(r.ref_id),
            debit: 0,
            credit: Number(r.amount) || 0,
          });
        }
        const staffPay = await localQuery(
          `SELECT id AS ref_id, payment_date AS dt, staff_name, amount, payment_type, payment_method
           FROM staff_payments WHERE tenant_id=$1
             AND (payment_date IS NULL OR (payment_date >= $2 AND payment_date <= $3))
           ORDER BY payment_date`,
          [tid, periodFrom, periodTo],
        );
        const staffLabels: Record<string, string> = {
          salary: 'Staff Salary',
          advance: 'Staff Advance',
          advance_repay: 'Advance Repaid',
          bonus: 'Staff Bonus',
          deduction: 'Staff Deduction',
        };
        for (const r of staffPay.rows as Record<string, unknown>[]) {
          const pType = String(r.payment_type || 'salary');
          const isOutflow = ['salary', 'bonus', 'advance'].includes(pType);
          entries.push({
            date: String(r.dt || periodFrom),
            type: staffLabels[pType] || 'Staff Salary',
            particulars: `${r.staff_name || 'Staff'} (${r.payment_method || 'Cash'})`,
            refId: String(r.ref_id),
            debit: isOutflow ? 0 : Number(r.amount) || 0,
            credit: isOutflow ? Number(r.amount) || 0 : 0,
          });
        }
        const exp = await localQuery(
          `SELECT id AS ref_id, expense_date AS dt, category, description, amount, payment_method
           FROM expenses WHERE tenant_id=$1
             AND (expense_date IS NULL OR (expense_date >= $2 AND expense_date <= $3))
           ORDER BY expense_date`,
          [tid, periodFrom, periodTo],
        );
        for (const r of exp.rows as Record<string, unknown>[]) {
          entries.push({
            date: String(r.dt || periodFrom),
            type: 'Expense',
            particulars: `${r.category || 'Expense'}${r.description ? ` — ${r.description}` : ''}`,
            refId: String(r.ref_id),
            debit: 0,
            credit: Number(r.amount) || 0,
          });
        }
      }

      entries.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      let balance = 0;
      const withBalance = entries.map(e => {
        balance += e.debit - e.credit;
        return { ...e, balance };
      });
      const totals = {
        debit: entries.reduce((s, e) => s + e.debit, 0),
        credit: entries.reduce((s, e) => s + e.credit, 0),
      };
      return json(200, { entries: withBalance, totals, count: entries.length });
    }
    if (ctx.path === '/accounts/day-book' && ctx.method === 'GET') {
      const date = query.get('date') || new Date().toISOString().slice(0, 10);
      const entries: {
        id: string;
        date: string;
        type: string;
        party: string;
        product?: string;
        debit: number;
        credit: number;
        method?: string;
      }[] = [];

      const invoices = await localQuery(
        `SELECT id, invoice_date AS date, COALESCE(customer_name, client_name, 'Customer') AS customer_name,
                COALESCE(subtotal,0) AS amount, invoice_number, status
         FROM standalone_invoices
         WHERE tenant_id=$1 AND invoice_date=$2 AND COALESCE(status,'') NOT IN ('cancelled','draft')`,
        [tid, date],
      );
      for (const r of invoices.rows as Record<string, unknown>[]) {
        entries.push({
          id: String(r.id),
          date,
          type: `Invoice${r.status === 'paid' ? ' (Paid)' : ''}`,
          party: String(r.customer_name || 'Customer'),
          product: String(r.invoice_number || ''),
          debit: Number(r.amount) || 0,
          credit: 0,
        });
      }

      const purch = await localQuery(
        `SELECT COALESCE(pp.batch_id, pp.id) AS id, pp.purchase_date AS date,
                COALESCE(s.name, 'Supplier') AS party_name,
                COALESCE(pp.billed_price, pp.cost_price, 0) * COALESCE(pp.qty, 1) AS amount,
                COALESCE(p.name, '') AS product_name
         FROM product_purchases pp
         LEFT JOIN suppliers s ON s.id = pp.supplier_id AND s.tenant_id = pp.tenant_id
         LEFT JOIN products p ON p.id = pp.product_id AND p.tenant_id = pp.tenant_id
         WHERE pp.tenant_id=$1 AND pp.purchase_date=$2`,
        [tid, date],
      );
      for (const r of purch.rows as Record<string, unknown>[]) {
        entries.push({
          id: String(r.id),
          date,
          type: 'Purchase',
          party: String(r.party_name),
          product: String(r.product_name || ''),
          debit: 0,
          credit: Number(r.amount) || 0,
        });
      }

      const invPay = await localQuery(
        `SELECT ip.id, ip.payment_date AS date,
                COALESCE(si.customer_name, si.client_name, 'Customer') AS party_name,
                ip.amount, COALESCE(ip.payment_method, ip.method, 'Cash') AS payment_method
         FROM invoice_payments ip
         JOIN standalone_invoices si ON si.id = ip.invoice_id AND si.tenant_id = ip.tenant_id
         WHERE ip.tenant_id=$1 AND ip.payment_date=$2`,
        [tid, date],
      );
      for (const r of invPay.rows as Record<string, unknown>[]) {
        entries.push({
          id: String(r.id),
          date,
          type: 'Payment Received',
          party: String(r.party_name),
          debit: Number(r.amount) || 0,
          credit: 0,
          method: String(r.payment_method),
        });
      }

      const sp = await localQuery(
        `SELECT sp.id, sp.payment_date AS date, COALESCE(s.name, 'Supplier') AS party_name,
                sp.amount, COALESCE(sp.payment_method, 'Cash') AS payment_method
         FROM supplier_payments sp
         LEFT JOIN suppliers s ON s.id = sp.supplier_id AND s.tenant_id = sp.tenant_id
         WHERE sp.tenant_id=$1 AND sp.payment_date=$2`,
        [tid, date],
      );
      for (const r of sp.rows as Record<string, unknown>[]) {
        entries.push({
          id: String(r.id),
          date,
          type: 'Payment Made',
          party: String(r.party_name),
          debit: 0,
          credit: Number(r.amount) || 0,
          method: String(r.payment_method),
        });
      }

      const staffPay = await localQuery(
        `SELECT id, payment_date AS date, staff_name, amount, payment_type, payment_method
         FROM staff_payments WHERE tenant_id=$1 AND payment_date=$2`,
        [tid, date],
      );
      const staffLabels: Record<string, string> = {
        salary: 'Staff Salary',
        advance: 'Staff Advance',
        advance_repay: 'Advance Repaid',
        bonus: 'Staff Bonus',
        deduction: 'Staff Deduction',
      };
      for (const r of staffPay.rows as Record<string, unknown>[]) {
        const pType = String(r.payment_type || 'salary');
        const isOutflow = ['salary', 'bonus', 'advance'].includes(pType);
        entries.push({
          id: String(r.id),
          date,
          type: staffLabels[pType] || 'Staff Salary',
          party: String(r.staff_name || 'Staff'),
          debit: isOutflow ? 0 : Number(r.amount) || 0,
          credit: isOutflow ? Number(r.amount) || 0 : 0,
          method: String(r.payment_method || 'Cash'),
        });
      }

      const exp = await localQuery(
        `SELECT id, expense_date AS date, category, description, amount, payment_method
         FROM expenses WHERE tenant_id=$1 AND expense_date=$2`,
        [tid, date],
      );
      for (const r of exp.rows as Record<string, unknown>[]) {
        entries.push({
          id: String(r.id),
          date,
          type: 'Expense',
          party: String(r.category || 'Expense'),
          product: String(r.description || ''),
          debit: 0,
          credit: Number(r.amount) || 0,
          method: String(r.payment_method || 'Cash'),
        });
      }

      const totalDebit = entries.reduce((s, e) => s + e.debit, 0);
      const totalCredit = entries.reduce((s, e) => s + e.credit, 0);
      return json(200, { date, entries, totalDebit, totalCredit });
    }
    if (ctx.path === '/accounts/notes' && ctx.method === 'GET') {
      const noteType = query.get('type');
      let sql = `SELECT * FROM credit_debit_notes WHERE tenant_id=$1`;
      const params: unknown[] = [tid];
      if (noteType === 'credit' || noteType === 'debit') {
        sql += ` AND note_type=$2`;
        params.push(noteType);
      }
      sql += ` ORDER BY created_at DESC`;
      const { rows } = await localQuery(sql, params);
      return json(
        200,
        rows.map((r: Record<string, unknown>) => {
          let items: unknown[] = [];
          if (Array.isArray(r.items)) items = r.items;
          else if (typeof r.items === 'string') {
            try {
              items = JSON.parse(r.items);
            } catch {
              items = [];
            }
          }
          return {
            id: r.id,
            noteNumber: r.note_number,
            noteType: r.note_type,
            vendorId: r.vendor_id,
            vendorName: r.vendor_name,
            customerName: r.customer_name,
            noteDate: r.note_date,
            reason: r.reason,
            items,
            subtotal: Number(r.subtotal) || 0,
            gstRate: Number(r.gst_rate) || 18,
            gstAmount: Number(r.gst_amount) || 0,
            total: Number(r.total) || 0,
            referenceInvoice: r.reference_invoice,
            referenceType: r.reference_type ?? null,
            referenceId: r.reference_id ?? null,
            status: r.status || 'active',
          };
        }),
      );
    }
    if (ctx.path === '/accounts/notes' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const noteType = String(b.noteType || '');
      if (!['credit', 'debit'].includes(noteType)) {
        return json(400, { error: 'noteType must be credit or debit' });
      }
      const items = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [];
      if (items.length === 0) return json(400, { error: 'At least one item required' });
      const rate = Number(b.gstRate) || 18;
      let subtotal = 0;
      let gstAmount = 0;
      const resolvedItems = items.map(item => {
        const qty = Number(item.quantity) || 1;
        const price = Number(item.price) || 0;
        const net = qty * price;
        const gst = item.withGst !== false ? Math.round((net * rate) / 100) : 0;
        subtotal += net;
        gstAmount += gst;
        return {
          description: String(item.description || ''),
          quantity: qty,
          price,
          withGst: item.withGst !== false,
          lineNet: net,
          lineGst: gst,
          lineTotal: net + gst,
        };
      });
      const total = subtotal + gstAmount;
      const prefix = noteType === 'credit' ? 'CN' : 'DN';
      const countRes = await localQuery(
        `SELECT COUNT(*)::int AS c FROM credit_debit_notes WHERE tenant_id=$1 AND note_type=$2`,
        [tid, noteType],
      );
      const noteNum = `${prefix}-${String(Number((countRes.rows[0] as { c: number }).c) + 1).padStart(4, '0')}`;
      const id = uid('N');
      const vName = (b.vendorName as string) || (b.customerName as string) || null;
      await localQuery(
        `INSERT INTO credit_debit_notes
           (id, tenant_id, note_number, note_type, vendor_id, vendor_name, customer_name, note_date, reason,
            items, subtotal, gst_rate, gst_amount, total, reference_invoice, reference_type, reference_id, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'active')`,
        [
          id,
          tid,
          noteNum,
          noteType,
          b.vendorId ?? null,
          vName,
          b.customerName || vName,
          b.noteDate || new Date().toISOString().slice(0, 10),
          b.reason ?? null,
          JSON.stringify(resolvedItems),
          subtotal,
          rate,
          gstAmount,
          total,
          b.referenceInvoice ?? null,
          b.referenceType || null,
          b.referenceId ?? null,
        ],
      );
      return json(201, {
        id,
        noteNumber: noteNum,
        noteType,
        vendorName: vName,
        customerName: b.customerName || vName,
        total,
        status: 'active',
      });
    }
    const noteDel = ctx.path.match(/^\/accounts\/notes\/([^/]+)$/);
    if (noteDel && ctx.method === 'DELETE') {
      const { rows } = await localQuery(`SELECT id FROM credit_debit_notes WHERE id=$1 AND tenant_id=$2`, [
        noteDel[1],
        tid,
      ]);
      if (!rows[0]) return json(404, { error: 'Note not found' });
      await localQuery(`DELETE FROM credit_debit_notes WHERE id=$1 AND tenant_id=$2`, [noteDel[1], tid]);
      return new Response(null, { status: 204 });
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
    // Invoice-based outstanding (service has no distribution receivables)
    if (ctx.path === '/reports/outstanding' && ctx.method === 'GET') {
      const { rows: parties } = await localQuery(
        `SELECT
           CASE
             WHEN si.party_type IS NOT NULL AND si.party_id IS NOT NULL THEN si.party_type || ':' || si.party_id
             ELSE 'name:' || COALESCE(si.customer_name, si.client_name, 'Unknown')
           END AS party_key,
           COALESCE(si.customer_name, si.client_name, 'Unknown') AS vendor_name,
           COALESCE(SUM(COALESCE(si.grand_total, si.total, 0)), 0) AS total_billed,
           COALESCE(SUM(COALESCE(pay.paid, 0)), 0) AS total_paid,
           MIN(si.invoice_date) AS oldest_date
         FROM standalone_invoices si
         LEFT JOIN (
           SELECT invoice_id, SUM(amount) AS paid FROM invoice_payments WHERE tenant_id=$1 GROUP BY invoice_id
         ) pay ON pay.invoice_id = si.id
         WHERE si.tenant_id=$1 AND COALESCE(si.status,'') NOT IN ('cancelled','draft','paid')
         GROUP BY 1, 2
         HAVING COALESCE(SUM(COALESCE(si.grand_total, si.total, 0)), 0) - COALESCE(SUM(COALESCE(pay.paid, 0)), 0) > 0.001
         ORDER BY 2`,
        [tid],
      );
      const now = Date.now();
      const mapped = (parties as Record<string, unknown>[]).map(r => {
        const billed = Number(r.total_billed) || 0;
        const paid = Number(r.total_paid) || 0;
        const balance = billed - paid;
        const days = r.oldest_date ? Math.floor((now - new Date(String(r.oldest_date)).getTime()) / 86400000) : 0;
        return {
          vendorId: r.party_key,
          vendorName: r.vendor_name,
          totalBilled: billed,
          totalPaid: paid,
          balance,
          d0_30: days <= 30 ? balance : 0,
          d31_60: days > 30 && days <= 60 ? balance : 0,
          d61_90: days > 60 && days <= 90 ? balance : 0,
          d90plus: days > 90 ? balance : 0,
        };
      });
      const totals = mapped.reduce(
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
      return json(200, { rows: mapped, totals, count: mapped.length });
    }
    if (ctx.path === '/reports/payment-register' && ctx.method === 'GET') {
      const from = query.get('from');
      const to = query.get('to');
      let sql = `
        SELECT ip.id, ip.payment_date, ip.amount,
               COALESCE(ip.payment_method, ip.method, 'Cash') AS payment_method,
               ip.reference_number, ip.notes,
               COALESCE(si.customer_name, si.client_name, 'Customer') AS vendor_name
        FROM invoice_payments ip
        JOIN standalone_invoices si ON si.id = ip.invoice_id AND si.tenant_id = ip.tenant_id
        WHERE ip.tenant_id=$1`;
      const params: unknown[] = [tid];
      if (from) {
        params.push(from);
        sql += ` AND ip.payment_date >= $${params.length}`;
      }
      if (to) {
        params.push(to);
        sql += ` AND ip.payment_date <= $${params.length}`;
      }
      sql += ` ORDER BY ip.payment_date DESC, ip.id DESC`;
      const { rows } = await localQuery(sql, params);
      const mapped = (rows as Record<string, unknown>[]).map(r => ({
        id: r.id,
        date: r.payment_date,
        vendorName: r.vendor_name,
        amount: Number(r.amount) || 0,
        method: r.payment_method,
        reference: r.reference_number || '',
        batchId: '',
        notes: r.notes || '',
      }));
      return json(200, {
        rows: mapped,
        totals: { amount: mapped.reduce((s, r) => s + r.amount, 0) },
        count: mapped.length,
      });
    }
    if (
      (ctx.path.startsWith('/reports/') || ctx.path.startsWith('/gstr') || ctx.path === '/gstr2b/reconcile') &&
      (ctx.method === 'GET' || ctx.method === 'POST')
    ) {
      // Service offline: no distribution/stock/GST filing — empty safe payloads
      if (ctx.path.includes('stock')) return json(200, { rows: [], totals: {}, count: 0 });
      if (ctx.path.includes('gst') || ctx.path.includes('gstr')) {
        return json(200, {
          rows: [],
          b2b: [],
          b2c: {},
          hsnSummary: [],
          totalTaxable: 0,
          totalTax: 0,
          totalValue: 0,
          summary: { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
          month: Number(query.get('month')) || null,
          year: Number(query.get('year')) || null,
        });
      }
      return json(200, { rows: [], items: [], totals: {}, count: 0, total: 0 });
    }

    // Analytics overview (phone Analytics tab)
    if (ctx.path === '/analytics/overview' && ctx.method === 'GET') {
      const emptyOverview = {
        money: {
          collections: 0,
          revenue: 0,
          distribution: 0,
          expenses: 0,
          outstanding: 0,
          invoiceOutstanding: 0,
        },
        recentActivity: [] as {
          type: string;
          id: string;
          label: string;
          amount: number;
          date: unknown;
        }[],
        topVendors: [] as { vendorId: string; vendorName: string; balance: number }[],
        counts: {
          customerMaster: 0,
          vendorMaster: 0,
          itemMaster: 0,
          bankMaster: 0,
          staffCount: 0,
        },
      };
      try {
        const from = query.get('from');
        const to = query.get('to');
        const rangeParams = from && to ? [tid, from, to] : from ? [tid, from] : [tid];
        const invFilter = from && to ? 'AND invoice_date BETWEEN $2 AND $3' : from ? 'AND invoice_date >= $2' : '';
        const expFilter = from && to ? 'AND expense_date BETWEEN $2 AND $3' : from ? 'AND expense_date >= $2' : '';
        const payFilter = from && to ? 'AND payment_date BETWEEN $2 AND $3' : from ? 'AND payment_date >= $2' : '';
        const [collectionsR, invoiceRevR, expensesR, outstandingR, activityR, countsR, topClientsR] = await Promise.all(
          [
            localQuery(
              `SELECT COALESCE(SUM(amount),0) AS v FROM invoice_payments WHERE tenant_id=$1 ${payFilter}`,
              rangeParams,
            ),
            localQuery(
              `SELECT COALESCE(SUM(COALESCE(grand_total,total,0)),0) AS v FROM standalone_invoices
             WHERE tenant_id=$1 AND status!='cancelled' ${invFilter}`,
              rangeParams,
            ),
            localQuery(
              `SELECT COALESCE(SUM(amount),0) AS v FROM expenses WHERE tenant_id=$1 ${expFilter}`,
              rangeParams,
            ),
            localQuery(
              `SELECT COALESCE(SUM(GREATEST(0,
                 COALESCE(si.grand_total, si.total, 0)
                 - COALESCE(ip.paid, 0)
               )),0) AS v
             FROM standalone_invoices si
             LEFT JOIN (
               SELECT invoice_id, SUM(amount) AS paid FROM invoice_payments WHERE tenant_id=$1 GROUP BY invoice_id
             ) ip ON si.id = ip.invoice_id
             WHERE si.tenant_id=$1 AND COALESCE(si.status,'') NOT IN ('paid','cancelled')`,
              [tid],
            ),
            localQuery(
              `SELECT type, id, label, amount, date FROM (
               SELECT 'invoice' AS type, id, COALESCE(customer_name,client_name,'Customer') AS label,
                      COALESCE(grand_total,total,0) AS amount, invoice_date::text AS date
               FROM standalone_invoices WHERE tenant_id=$1 AND status!='cancelled'
               UNION ALL
               SELECT 'payment', id, invoice_id, amount, payment_date::text
               FROM invoice_payments WHERE tenant_id=$1
               UNION ALL
               SELECT 'expense', id, COALESCE(category,'Expense'), amount, expense_date::text
               FROM expenses WHERE tenant_id=$1
             ) t ORDER BY date DESC NULLS LAST LIMIT 15`,
              [tid],
            ),
            localQuery(
              `SELECT
               (SELECT COUNT(*)::int FROM customers WHERE tenant_id=$1) AS customers,
               (SELECT COUNT(*)::int FROM vendors WHERE tenant_id=$1) AS vendors,
               (SELECT COUNT(*)::int FROM products WHERE tenant_id=$1) AS items,
               (SELECT COUNT(*)::int FROM banks WHERE tenant_id=$1) AS banks,
               (SELECT COUNT(*)::int FROM staff_members WHERE tenant_id=$1) AS staff`,
              [tid],
            ),
            // Service Offline: topVendors = invoice outstanding per client (same party keys as Invoice Finance)
            localQuery(
              `SELECT
               CASE
                 WHEN si.party_type IS NOT NULL AND si.party_id IS NOT NULL THEN si.party_type || ':' || si.party_id
                 ELSE 'name:' || COALESCE(si.customer_name, si.client_name, 'Unknown')
               END AS party_key,
               MAX(COALESCE(si.customer_name, si.client_name, 'Unknown')) AS customer_name,
               COALESCE(SUM(COALESCE(si.grand_total, si.total, 0)), 0)
                 - COALESCE(SUM(ip.paid), 0) AS balance
             FROM standalone_invoices si
             LEFT JOIN (
               SELECT invoice_id, SUM(amount) AS paid FROM invoice_payments WHERE tenant_id=$1 GROUP BY invoice_id
             ) ip ON si.id = ip.invoice_id
             WHERE si.tenant_id=$1 AND COALESCE(si.status,'') != 'cancelled'
             GROUP BY 1
             HAVING COALESCE(SUM(COALESCE(si.grand_total, si.total, 0)), 0) - COALESCE(SUM(ip.paid), 0) > 0
             ORDER BY balance DESC
             LIMIT 5`,
              [tid],
            ),
          ],
        );
        const collections = Number((collectionsR.rows[0] as { v: number }).v) || 0;
        const invoiceRev = Number((invoiceRevR.rows[0] as { v: number }).v) || 0;
        const expenses = Number((expensesR.rows[0] as { v: number }).v) || 0;
        const invoiceOutstanding = Number((outstandingR.rows[0] as { v: number }).v) || 0;
        const c = (countsR.rows[0] as Record<string, number>) || {};
        return json(200, {
          money: {
            collections,
            revenue: invoiceRev,
            distribution: 0,
            expenses,
            outstanding: 0,
            invoiceOutstanding,
          },
          recentActivity: (activityR.rows || []).map((r: Record<string, unknown>) => ({
            type: r.type,
            id: r.id,
            label: r.label,
            amount: Number(r.amount) || 0,
            date: r.date,
          })),
          topVendors: (topClientsR.rows || []).map((r: Record<string, unknown>) => ({
            vendorId: String(r.party_key),
            vendorName: String(r.customer_name || 'Unknown'),
            balance: Number(r.balance) || 0,
          })),
          counts: {
            customerMaster: Number(c.customers) || 0,
            vendorMaster: Number(c.vendors) || 0,
            itemMaster: Number(c.items) || 0,
            bankMaster: Number(c.banks) || 0,
            staffCount: Number(c.staff) || 0,
          },
        });
      } catch (overviewErr) {
        console.warn('[service-mobile] /analytics/overview failed; returning empty safe payload', overviewErr);
        return json(200, emptyOverview);
      }
    }

    // Notifications (local Bell) — same feed shape as cloud
    if (ctx.path === '/notifications' && ctx.method === 'GET') {
      const { rows } = await localQuery(
        `SELECT id, title, body, type, source, created_at, read_at
         FROM tenant_notifications
         WHERE tenant_id=$1
           AND (expires_at IS NULL OR expires_at > NOW())
           AND (read_at IS NULL OR read_at > NOW() - INTERVAL '7 days')
         ORDER BY (read_at IS NULL) DESC, created_at DESC
         LIMIT 10`,
        [tid],
      );
      const adminItems = (rows as Record<string, unknown>[]).slice(0, 5).map(r => ({
        id: String(r.id),
        kind: 'admin_message' as const,
        priority: 'high' as const,
        title: String(r.title),
        body: String(r.body),
        source: String(r.source || 'super_admin'),
        type: String(r.type || 'info'),
        createdAt: r.created_at ? new Date(String(r.created_at)).toISOString() : undefined,
        read: !!r.read_at,
        hrefTab: undefined as string | undefined,
      }));
      return json(200, {
        items: adminItems,
        generatedAt: new Date().toISOString(),
        unreadAdmin: adminItems.filter(i => !i.read).length,
        digestCount: 0,
        unreadCount: adminItems.filter(i => !i.read).length,
      });
    }
    const notifRead = ctx.path.match(/^\/notifications\/([^/]+)\/read$/);
    if (notifRead && ctx.method === 'POST') {
      const notifId = notifRead[1]!;
      const result = await localQuery(
        `UPDATE tenant_notifications SET read_at=NOW()
         WHERE id=$1 AND tenant_id=$2 AND read_at IS NULL`,
        [notifId, tid],
      );
      if ((result.rowCount ?? 0) === 0) {
        const exists = await localQuery(`SELECT id FROM tenant_notifications WHERE id=$1 AND tenant_id=$2`, [
          notifId,
          tid,
        ]);
        if (!exists.rows[0]) return json(404, { error: 'Notification not found' });
      }
      return json(200, { ok: true });
    }
    if (ctx.path === '/notifications/read-all' && ctx.method === 'POST') {
      await localQuery(`UPDATE tenant_notifications SET read_at=NOW() WHERE tenant_id=$1 AND read_at IS NULL`, [tid]);
      return json(200, { ok: true });
    }

    // GST API — not available offline; stub so Settings doesn't hard-fail if opened
    if (ctx.path.startsWith('/gst/') && (ctx.method === 'GET' || ctx.method === 'PUT')) {
      return json(200, { enabled: false, mode: 'disabled', message: 'GST API is not available on Offline Mobile' });
    }

    // Settings / me / profile (not /settings/bill — handled above)
    async function loadLocalProfile() {
      const { rows } = await localQuery(
        `SELECT u.id, u.email, u.name, u.phone, u.address, u.role, u.company_name, u.auto_whatsapp,
                u.default_gst_rate, u.gst_number, u.permissions,
                t.company_name AS tenant_company, t.business_type, t.tab_config,
                t.vendor_portal_enabled, t.barcode_system_enabled, t.multi_language_enabled,
                t.inventory_tracking_enabled
         FROM users u JOIN tenants t ON t.id = u.tenant_id
         WHERE t.id=$1 AND u.id=$2 LIMIT 1`,
        [tid, ctx.auth!.userId],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        return {
          id: ctx.auth!.userId,
          email: ctx.auth!.email,
          name: ctx.auth!.name,
          role: ctx.auth!.role,
          businessType: 'service',
          tabConfig: SERVICE_TAB_PRESET,
          autoWhatsapp: false,
          defaultGstRate: 18,
        };
      }
      // Schema default is '{}'; empty map/array/string must not reach the shell as RBAC
      // (getAccess would deny every tab → blank Analytics + only More in bottom nav).
      let rawPerms: unknown = row.permissions;
      if (typeof rawPerms === 'string') {
        try {
          rawPerms = JSON.parse(rawPerms);
        } catch {
          rawPerms = null;
        }
      }
      const permissions =
        rawPerms &&
        typeof rawPerms === 'object' &&
        !Array.isArray(rawPerms) &&
        Object.keys(rawPerms as object).length > 0
          ? rawPerms
          : Array.isArray(rawPerms) && rawPerms.length > 0
            ? rawPerms
            : null;
      return {
        id: row.id,
        email: row.email,
        name: row.name,
        phone: row.phone ?? null,
        address: row.address ?? null,
        role: (row.role as string) || 'Admin',
        companyName: row.company_name || row.tenant_company || null,
        permissions,
        autoWhatsapp: !!row.auto_whatsapp,
        defaultGstRate: Number(row.default_gst_rate) || 18,
        gstNumber: row.gst_number ?? null,
        businessType: (row.business_type as string) || 'service',
        vendorPortalEnabled: row.vendor_portal_enabled !== false,
        barcodeSystemEnabled: row.barcode_system_enabled !== false,
        multiLanguageEnabled: row.multi_language_enabled !== false,
        inventoryTrackingEnabled: row.inventory_tracking_enabled !== false,
        tabConfig: row.tab_config || SERVICE_TAB_PRESET,
      };
    }

    if (
      (ctx.path === '/admin/me' ||
        ctx.path === '/auth/me' ||
        ctx.path.startsWith('/settings/profile') ||
        (ctx.path.match(/^\/settings\/[^/]+$/) &&
          ctx.path !== '/settings/bill' &&
          ctx.path !== '/settings/change-password')) &&
      ctx.method === 'GET'
    ) {
      return json(200, await loadLocalProfile());
    }

    if (ctx.path === '/settings/profile' && (ctx.method === 'PUT' || ctx.method === 'PATCH')) {
      const b = ctx.body as Record<string, unknown>;
      const userId = String(b.userId || ctx.auth!.userId);
      if (userId !== ctx.auth!.userId) return json(403, { error: 'Access denied' });
      const sets: string[] = [];
      const params: unknown[] = [];
      const add = (col: string, val: unknown) => {
        params.push(val);
        sets.push(`${col}=$${params.length}`);
      };
      if (b.name !== undefined) add('name', b.name || null);
      if (b.phone !== undefined) add('phone', b.phone || null);
      if (b.address !== undefined) add('address', b.address || null);
      if (b.companyName !== undefined) add('company_name', b.companyName || null);
      if (b.gstNumber !== undefined) add('gst_number', b.gstNumber || null);
      if (b.autoWhatsapp !== undefined) add('auto_whatsapp', !!b.autoWhatsapp);
      if (b.defaultGstRate !== undefined) add('default_gst_rate', Number(b.defaultGstRate) || 18);
      if (sets.length) {
        params.push(userId, tid);
        await localQuery(
          `UPDATE users SET ${sets.join(', ')} WHERE id=$${params.length - 1} AND tenant_id=$${params.length}`,
          params,
        );
      }
      if (b.companyName) {
        await localQuery(`UPDATE tenants SET company_name=$1 WHERE id=$2`, [b.companyName, tid]);
      }
      return json(200, await loadLocalProfile());
    }

    if (ctx.path === '/settings/change-password' && ctx.method === 'PUT') {
      const b = ctx.body as { userId?: string; currentPassword?: string; newPassword?: string };
      if (!b.userId || b.userId !== ctx.auth!.userId) return json(403, { error: 'Access denied' });
      if (!b.currentPassword || !b.newPassword) return json(400, { error: 'All fields required' });
      if (b.newPassword.length < 8) return json(400, { error: 'Password must be at least 8 characters' });
      const { rows } = await localQuery(`SELECT password_hash FROM users WHERE id=$1 AND tenant_id=$2`, [
        b.userId,
        tid,
      ]);
      const user = rows[0] as { password_hash: string } | undefined;
      if (!user) return json(404, { error: 'User not found' });
      const ok = await bcrypt.compare(b.currentPassword, user.password_hash);
      if (!ok) return json(401, { error: 'Current password is incorrect' });
      const newHash = await bcrypt.hash(b.newPassword, 12);
      await localQuery(`UPDATE users SET password_hash=$1 WHERE id=$2 AND tenant_id=$3`, [newHash, b.userId, tid]);
      return json(200, { ok: true, message: 'Password changed. Please log in again.' });
    }

    if (ctx.path === '/auth/me' && ctx.method === 'DELETE') {
      return json(403, {
        error: 'Delete account is not available on Offline Mobile. Unbind the device from Super Admin instead.',
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
