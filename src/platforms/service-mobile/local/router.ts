/**
 * In-process local API for Service Mobile — ERP traffic stays on-device.
 * Cloud license/sync/backup paths are NOT handled here (see cloud.ts).
 */
import { localQuery } from './db';
import { localLogin, verifyLocalToken, type LocalJwtPayload } from './auth';
import { SERVICE_TAB_PRESET } from './schema';

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

    // Vendors = Clients for service
    if (ctx.path === '/vendors' || ctx.path === '/vendors/') {
      if (ctx.method === 'GET') return json(200, await listTable('vendors', tid!));
      if (ctx.method === 'POST') {
        const b = ctx.body as Record<string, unknown>;
        const id = uid('V');
        await localQuery(
          `INSERT INTO vendors (id, tenant_id, name, phone, email, address, gstin) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [id, tid, b.name, b.phone ?? null, b.email ?? null, b.address ?? null, b.gstin ?? null],
        );
        const { rows } = await localQuery(`SELECT * FROM vendors WHERE id=$1`, [id]);
        return json(201, rows[0]);
      }
    }
    const vendorMatch = ctx.path.match(/^\/vendors\/([^/]+)$/);
    if (vendorMatch) {
      const id = vendorMatch[1]!;
      if (ctx.method === 'GET') {
        const { rows } = await localQuery(`SELECT * FROM vendors WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return rows[0] ? json(200, rows[0]) : json(404, { error: 'Not found' });
      }
      if (ctx.method === 'PUT' || ctx.method === 'PATCH') {
        const b = ctx.body as Record<string, unknown>;
        await localQuery(
          `UPDATE vendors SET name=COALESCE($1,name), phone=COALESCE($2,phone), email=COALESCE($3,email),
           address=COALESCE($4,address), gstin=COALESCE($5,gstin) WHERE id=$6 AND tenant_id=$7`,
          [b.name ?? null, b.phone ?? null, b.email ?? null, b.address ?? null, b.gstin ?? null, id, tid],
        );
        const { rows } = await localQuery(`SELECT * FROM vendors WHERE id=$1`, [id]);
        return json(200, rows[0]);
      }
      if (ctx.method === 'DELETE') {
        await localQuery(`DELETE FROM vendors WHERE id=$1 AND tenant_id=$2`, [id, tid]);
        return json(200, { ok: true });
      }
    }

    // Customers
    if (ctx.path === '/customers' && ctx.method === 'GET') return json(200, await listTable('customers', tid!));
    if (ctx.path === '/customers' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('C');
      await localQuery(
        `INSERT INTO customers (id, tenant_id, name, phone, email, address) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, tid, b.name, b.phone ?? null, b.email ?? null, b.address ?? null],
      );
      const { rows } = await localQuery(`SELECT * FROM customers WHERE id=$1`, [id]);
      return json(201, rows[0]);
    }

    // Categories / products (masters)
    if (ctx.path === '/categories' && ctx.method === 'GET') return json(200, await listTable('categories', tid!));
    if (ctx.path === '/categories' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('CAT');
      await localQuery(`INSERT INTO categories (id, tenant_id, name) VALUES ($1,$2,$3)`, [id, tid, b.name]);
      return json(201, { id, name: b.name });
    }
    if (ctx.path === '/products' && ctx.method === 'GET') return json(200, await listTable('products', tid!));
    if (ctx.path === '/products' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('P');
      await localQuery(
        `INSERT INTO products (id, tenant_id, name, sku, price, gst_percent) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, tid, b.name, b.sku ?? null, b.price ?? 0, b.gstPercent ?? b.gst_percent ?? 18],
      );
      const { rows } = await localQuery(`SELECT * FROM products WHERE id=$1`, [id]);
      return json(201, rows[0]);
    }

    // Expenses
    if (ctx.path === '/expenses' && ctx.method === 'GET') return json(200, await listTable('expenses', tid!));
    if (ctx.path === '/expenses' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('E');
      await localQuery(
        `INSERT INTO expenses (id, tenant_id, category, amount, description, expense_date) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, tid, b.category ?? null, b.amount, b.description ?? null, b.expenseDate ?? b.expense_date ?? null],
      );
      const { rows } = await localQuery(`SELECT * FROM expenses WHERE id=$1`, [id]);
      return json(201, rows[0]);
    }

    // Quotations
    if (ctx.path === '/quotations' && ctx.method === 'GET') return json(200, await listTable('quotations', tid!));
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
      return json(201, rows[0]);
    }

    // Orders
    if (ctx.path === '/orders' && ctx.method === 'GET') return json(200, await listTable('orders', tid!));
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
      return json(201, rows[0]);
    }

    // Invoices
    if (ctx.path === '/invoices' || ctx.path === '/standalone-invoices') {
      if (ctx.method === 'GET') return json(200, await listTable('standalone_invoices', tid!));
      if (ctx.method === 'POST') {
        const b = ctx.body as Record<string, unknown>;
        const id = uid('INV');
        await localQuery(
          `INSERT INTO standalone_invoices
             (id, tenant_id, invoice_number, client_name, client_id, status, items, subtotal, tax, total, invoice_date)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            id,
            tid,
            b.invoiceNumber ?? b.invoice_number ?? null,
            b.clientName ?? b.client_name ?? null,
            b.clientId ?? null,
            b.status ?? 'unpaid',
            JSON.stringify(b.items ?? []),
            b.subtotal ?? 0,
            b.tax ?? 0,
            b.total ?? 0,
            b.invoiceDate ?? b.invoice_date ?? null,
          ],
        );
        const { rows } = await localQuery(`SELECT * FROM standalone_invoices WHERE id=$1`, [id]);
        return json(201, rows[0]);
      }
    }

    // Invoice payments / finance
    if (
      ctx.path === '/invoice-payments' ||
      ctx.path === '/invoice-finance' ||
      ctx.path === '/invoice-finance/payments'
    ) {
      if (ctx.method === 'GET') return json(200, await listTable('invoice_payments', tid!));
      if (ctx.method === 'POST') {
        const b = ctx.body as Record<string, unknown>;
        const id = uid('IP');
        await localQuery(
          `INSERT INTO invoice_payments (id, tenant_id, invoice_id, amount, payment_date, method) VALUES ($1,$2,$3,$4,$5,$6)`,
          [id, tid, b.invoiceId ?? null, b.amount, b.paymentDate ?? null, b.method ?? null],
        );
        return json(201, { id, ok: true });
      }
    }

    // Banks / accounts
    if (ctx.path === '/banks' && ctx.method === 'GET') return json(200, await listTable('banks', tid!));
    if (ctx.path === '/banks' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('B');
      await localQuery(
        `INSERT INTO banks (id, tenant_id, name, account_number, ifsc, balance) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id, tid, b.name, b.accountNumber ?? null, b.ifsc ?? null, b.balance ?? 0],
      );
      const { rows } = await localQuery(`SELECT * FROM banks WHERE id=$1`, [id]);
      return json(201, rows[0]);
    }

    // Price lists
    if (ctx.path === '/price-lists' && ctx.method === 'GET') return json(200, await listTable('price_lists', tid!));
    if (ctx.path === '/price-lists' && ctx.method === 'POST') {
      const b = ctx.body as Record<string, unknown>;
      const id = uid('PL');
      await localQuery(`INSERT INTO price_lists (id, tenant_id, name, items) VALUES ($1,$2,$3,$4)`, [
        id,
        tid,
        b.name,
        JSON.stringify(b.items ?? []),
      ]);
      return json(201, { id, name: b.name });
    }

    // Bill settings
    if (ctx.path === '/bill-settings' && ctx.method === 'GET') {
      const { rows } = await localQuery(`SELECT * FROM bill_settings WHERE tenant_id=$1`, [tid]);
      return json(200, rows[0] || { settings: {} });
    }
    if (ctx.path === '/bill-settings' && (ctx.method === 'PUT' || ctx.method === 'POST')) {
      const b = ctx.body as Record<string, unknown>;
      await localQuery(
        `INSERT INTO bill_settings (id, tenant_id, settings) VALUES ($1,$2,$3)
         ON CONFLICT (tenant_id) DO UPDATE SET settings = EXCLUDED.settings`,
        [uid('BS'), tid, JSON.stringify(b.settings ?? b)],
      );
      return json(200, { ok: true });
    }

    // Notifications (local Bell)
    if (ctx.path === '/notifications' && ctx.method === 'GET') {
      return json(200, await listTable('tenant_notifications', tid!, 'created_at DESC'));
    }
    if (ctx.path === '/notifications/read-all' && ctx.method === 'POST') {
      await localQuery(`UPDATE tenant_notifications SET read_at=NOW() WHERE tenant_id=$1 AND read_at IS NULL`, [tid]);
      return json(200, { ok: true });
    }

    // Settings / me / profile
    if (
      (ctx.path === '/admin/me' ||
        ctx.path === '/auth/me' ||
        ctx.path.startsWith('/settings/profile') ||
        ctx.path.match(/^\/settings\/[^/]+$/)) &&
      ctx.method === 'GET'
    ) {
      const { rows } = await localQuery(
        `SELECT u.id, u.email, u.name, u.role, t.company_name AS "companyName", t.business_type AS "businessType",
                t.tab_config AS "tabConfig"
         FROM users u JOIN tenants t ON t.id = u.tenant_id
         WHERE t.id=$1 AND u.id=$2 LIMIT 1`,
        [tid, ctx.auth!.userId],
      );
      const row = rows[0] as Record<string, unknown> | undefined;
      return json(200, row || { id: ctx.auth!.userId, email: ctx.auth!.email, name: ctx.auth!.name });
    }

    // Chatbot stub offline
    if (ctx.path.startsWith('/chatbot') && ctx.method === 'POST') {
      return json(200, { reply: 'Chatbot is limited offline. Sync when online for full support.' });
    }

    // Empty-safe stubs for unused service-hidden modules
    if (
      ctx.path.startsWith('/inventory') ||
      ctx.path.startsWith('/distribution') ||
      ctx.path.startsWith('/sales') ||
      ctx.path.startsWith('/warranties') ||
      ctx.path.startsWith('/replacements') ||
      ctx.path.startsWith('/rewards')
    ) {
      if (ctx.method === 'GET') return json(200, []);
      return json(403, { error: 'Not available for service business type' });
    }

    return json(404, { error: `Local API: ${ctx.method} ${ctx.path} not implemented` });
  } catch (err) {
    return json(500, { error: err instanceof Error ? err.message : 'Local API error' });
  }
}
