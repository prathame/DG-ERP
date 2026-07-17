import express from 'express';
import path from 'path';
import fs from 'fs';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

import { pool } from './pg-db';
import { enforceModulePermissions, normalizePermissions } from './middleware/permissions';

import superAdminRouter from './routes/super-admin';
import productsRouter from './routes/products';
import salesRouter from './routes/sales';
import distributionRouter from './routes/distribution';
import warrantiesRouter from './routes/warranties';
import replacementsRouter from './routes/replacements';
import rewardsRouter from './routes/rewards';
import customersRouter from './routes/customers';
import vendorsRouter from './routes/vendors';
import banksRouter from './routes/banks';
import financeRouter from './routes/finance';
import invoiceFinanceRouter from './routes/invoice-finance';
import onpremRouter from './routes/onprem';
import mobileRouter from './routes/mobile';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import dashboardRouter from './routes/dashboard';
import searchRouter from './routes/search';
import reportsRouter from './routes/reports';
import purchasesRouter from './routes/purchases';
import quotationsRouter from './routes/quotations';
import ordersRouter from './routes/orders';
import priceListsRouter from './routes/price-lists';
import accountsRouter from './routes/accounts';
import mastersRouter from './routes/masters';
import mappingRouter from './routes/mapping';
import auditRouter from './routes/audit';
import chatbotRouter from './routes/chatbot';
import billSettingsRouter from './routes/bill-settings';
import payrollRouter from './routes/payroll';
import expensesRouter from './routes/expenses';
import gstApiRouter from './routes/gst-api';
import invoicesRouter from './routes/invoices';
import { logger } from './utils/logger';

const PUBLIC_PATHS = [
  '/api/auth/login', '/api/auth/forgot-password', '/api/auth/reset-password',
  '/api/super-admin/login', '/api/tenant/by-slug/', '/api/health',
  '/manifest.json',
  '/api/onprem/activate', '/api/onprem/heartbeat', '/api/onprem/deactivate',
  '/api/onprem/provision', '/api/onprem/apply-settings', '/api/onprem/mark-applied',
  '/api/mobile/redeem-invite', '/api/mobile/heartbeat',
];

/** Build the Express app without listening — used by server entry and supertest. */
export function createApp(): express.Application {
  const app = express();
  const isProduction = process.env.NODE_ENV === 'production';
  const isTest = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test';

  // Render / reverse proxies set X-Forwarded-For — required for express-rate-limit
  if (isProduction || process.env.TRUST_PROXY === '1') {
    app.set('trust proxy', 1);
  }

  app.use(compression());
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://wa.me", "https://mail.google.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || (isProduction
    ? ['https://dhandho.app', 'https://dg-erp.onrender.com']
    : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']);
  // Capacitor / Ionic WebView origins for the mobile app
  const capacitorOrigins = new Set([
    'capacitor://localhost',
    'ionic://localhost',
    'http://localhost',
    'https://localhost',
  ]);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && (allowedOrigins.includes(origin) || capacitorOrigins.has(origin))) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
  });

  if (!isTest) {
    app.use((req, res, next) => {
      if (!req.originalUrl.startsWith('/api/')) return next();
      const start = Date.now();
      res.on('finish', () => {
        const ms = Date.now() - start;
        const status = res.statusCode;
        const tenant = (req.headers['x-tenant-id'] as string)?.slice(0, 8) || '—';
        const icon = status >= 500 ? '💥' : status >= 400 ? '⚠️' : status >= 300 ? '↩️' : '✅';
        const method = req.method.padEnd(7);
        // Redact query tokens — never log Authorization headers
        const safeUrl = req.originalUrl.replace(/([?&](?:token|access_token|refresh_token)=)[^&]+/gi, '$1[REDACTED]');
        console.log(`${icon} ${method}${safeUrl}  →  ${status}  (${ms}ms)  tenant:${tenant}`);
      });
      next();
    });
  }

  app.use('/api/backup/restore', express.json({ limit: '50mb' }));
  app.use(express.json({ limit: '2mb' }));

  app.use((req, _res, next) => {
    if (req.method === 'QUERY') {
      if (req.body && typeof req.body === 'object') {
        Object.assign(req.query, req.body);
      }
      req.method = 'GET';
    }
    next();
  });

  app.use('/api/', async (req, res, next) => {
    if (PUBLIC_PATHS.some(p => req.path.startsWith(p.replace('/api', '')))) return next();
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) return res.status(401).json({ error: 'Authentication required' });
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as { tenantId?: string; userId?: string; role?: string; vendorId?: string | null; iat?: number };
      if (decoded.tenantId && decoded.userId) {
        req.headers['x-tenant-id'] = decoded.tenantId;

        const userRow = await pool.query(
          `SELECT u.password_changed_at, u.role, u.vendor_id, u.permissions, t.status, t.subscription_ends_at, t.trial_ends_at
           FROM users u JOIN tenants t ON t.id = u.tenant_id
           WHERE u.id = $1 AND u.tenant_id = $2`,
          [decoded.userId, decoded.tenantId]
        );
        const row = userRow.rows[0] as { password_changed_at: Date | null; role: string; vendor_id: string | null; permissions: unknown; status: string; subscription_ends_at: string | null; trial_ends_at: string | null } | undefined;

        if (!row) return res.status(401).json({ error: 'User no longer exists. Please log in again.' });

        decoded.role = row.role;
        decoded.vendorId = row.vendor_id ?? undefined;
        (decoded as { permissions?: Record<string, string> }).permissions = normalizePermissions(row.permissions, row.role);

        if (row.status === 'suspended') return res.status(403).json({ error: 'Account suspended. Contact admin.' });
        const expiresAt = row.status === 'trial' ? row.trial_ends_at
                        : row.status === 'active' ? row.subscription_ends_at
                        : null;
        if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return res.status(403).json({ error: 'Subscription expired. Contact admin to renew.' });

        if (row.password_changed_at && decoded.iat && row.password_changed_at.getTime() / 1000 > decoded.iat) {
          return res.status(401).json({ error: 'Session expired after password change. Please log in again.' });
        }
      } else if (decoded.tenantId) {
        req.headers['x-tenant-id'] = decoded.tenantId;
        const tenant = await pool.query('SELECT status FROM tenants WHERE id = $1', [decoded.tenantId]);
        if (tenant.rows[0]?.status === 'suspended') return res.status(403).json({ error: 'Account suspended.' });
      } else {
        delete req.headers['x-tenant-id'];
        if (req.path.startsWith('/super-admin/') || req.path.startsWith('/onprem/')) {
          // platform routes have their own auth
        } else {
          return res.status(403).json({ error: 'Platform token cannot access tenant APIs.' });
        }
      }
      (req as unknown as Record<string, unknown>).user = decoded;
      (req as unknown as Record<string, unknown>).tenantId = decoded.tenantId;
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    next();
  });

  app.use('/api/', enforceModulePermissions);

  const loginMax = isTest ? 1000 : (isProduction ? 10 : 50);
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: loginMax, message: { error: 'Too many login attempts, try again in 15 minutes' }, standardHeaders: true, legacyHeaders: false });
  app.use('/api/auth/login', loginLimiter);
  app.use('/api/super-admin/login', loginLimiter);
  if (!isTest) {
    app.use('/api/settings/change-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many password change attempts' } }));
    app.use('/api/auth/forgot-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many reset requests, try again in 15 minutes' } }));
    app.use('/api/auth/reset-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many reset attempts' } }));
    app.use('/api/auth/signup', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many signup attempts' } }));
  }

  app.get('/manifest.json', async (req, res) => {
    const slug = (typeof req.query.slug === 'string' && req.query.slug) ? req.query.slug.toLowerCase() : null;

    let name = 'Dhandho Management';
    let shortName = 'Dhandho';
    let startUrl = '/';

    if (slug && slug !== 'admin' && slug !== 'privacy' && slug !== 'terms') {
      try {
        const tenant = (await pool.query('SELECT company_name FROM tenants WHERE slug = $1', [slug])).rows[0] as { company_name: string } | undefined;
        if (tenant) {
          name = tenant.company_name;
          shortName = tenant.company_name.substring(0, 12);
          startUrl = `/${slug}`;
        }
      } catch { /* ignore */ }
    }

    res.json({
      name, short_name: shortName,
      description: 'ERP for Inventory, Sales, Distribution & Billing',
      start_url: startUrl, display: 'standalone',
      background_color: '#151619', theme_color: '#F27D26', orientation: 'any',
      icons: [
        { src: '/icons/icon-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
        { src: '/icons/icon-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
      ],
      categories: ['business', 'productivity'], lang: 'en',
    });
  });

  const distPath = fs.existsSync(path.join(__dirname, '..', 'dist'))
    ? path.join(__dirname, '..', 'dist')
    : path.join(process.cwd(), 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
  }

  if (process.env.REQUIRE_ELECTRON === 'true') {
    app.use((req, res, next) => {
      const isApi = req.path.startsWith('/api/');
      const isAdmin = req.path.startsWith('/admin');
      const isElectron = req.headers['x-dg-client'] === 'electron-cloud' || req.headers['x-dg-client'] === 'electron-onprem';
      const isOnPremLocal = process.env.DEPLOYMENT_MODE === 'onprem';
      if (isApi || isAdmin || isElectron || isOnPremLocal) return next();
      res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dhandho — Download App</title>
    <style>*{margin:0;padding:0;box-sizing:border-box;}body{font-family:'Segoe UI',sans-serif;background:#f9fafb;display:flex;align-items:center;justify-content:center;min-height:100vh;color:#1a1a1a;}
    .card{background:white;border-radius:20px;padding:48px;max-width:480px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,0.08);}
    .icon{width:64px;height:64px;background:#F27D26;border-radius:16px;display:flex;align-items:center;justify-content:center;margin:0 auto 24px;color:white;font-weight:800;font-size:24px;}
    h1{font-size:24px;font-weight:800;margin-bottom:8px;}p{color:#6b7280;font-size:15px;line-height:1.6;margin-bottom:32px;}
    .btn{display:inline-block;padding:14px 32px;background:#F27D26;color:white;border-radius:12px;font-weight:700;text-decoration:none;font-size:15px;margin:6px;}
    .btn.sec{background:#f3f4f6;color:#374151;}</style></head>
    <body><div class="card"><div class="icon">DH</div>
    <h1>Dhandho requires the desktop app</h1>
    <p>Browser access is disabled. Download the Dhandho app for Windows or Mac to continue.</p>
    <a href="https://github.com/prathame/DG-ERP/releases/latest" class="btn">Download for Windows</a>
    <a href="https://github.com/prathame/DG-ERP/releases/latest" class="btn">Download for Mac</a>
    <br/><br/><a href="/admin" class="btn sec">Super Admin Login</a>
    </div></body></html>`);
    });
  }

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, message: 'API is running' });
  });

  app.use(superAdminRouter);
  app.use(productsRouter);
  app.use(salesRouter);
  app.use(distributionRouter);
  app.use(warrantiesRouter);
  app.use(replacementsRouter);
  app.use(rewardsRouter);
  app.use(customersRouter);
  app.use(vendorsRouter);
  app.use(banksRouter);
  app.use(financeRouter);
  app.use(invoiceFinanceRouter);
  app.use(onpremRouter);
  app.use(mobileRouter);
  app.use(authRouter);
  app.use(adminRouter);
  app.use(dashboardRouter);
  app.use(searchRouter);
  app.use(mastersRouter);
  app.use(mappingRouter);
  app.use(auditRouter);
  app.use(payrollRouter);
  app.use(expensesRouter);
  app.use(gstApiRouter);
  app.use(invoicesRouter);
  app.use(chatbotRouter);
  app.use(billSettingsRouter);
  app.use(reportsRouter);
  app.use(purchasesRouter);
  app.use(quotationsRouter);
  app.use(ordersRouter);
  app.use(priceListsRouter);
  app.use(accountsRouter);

  app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error('Unhandled error', { method: req.method, path: req.path, error: err.message, stack: isProduction ? undefined : err.stack });
    res.status(500).json({ error: 'Internal server error' });
  });

  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    const indexPath = path.join(distPath, 'index.html');
    if (fs.existsSync(indexPath)) {
      res.sendFile(indexPath);
    } else {
      res.status(404).send(`Frontend not built. Run "npm run dev" for the dev server (port 3000) or "npm run build" then restart.`);
    }
  });

  return app;
}
