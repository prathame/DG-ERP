import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import jwt from 'jsonwebtoken';

import { initDatabase, pool } from './pg-db';

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
import invoicesRouter from './routes/invoices';
import { logger } from './utils/logger';

// ============ STARTUP CHECKS ============
if (!process.env.DATABASE_URL) { console.error('❌ FATAL: DATABASE_URL environment variable is required'); process.exit(1); }
if (!process.env.JWT_SECRET) { console.error('❌ FATAL: JWT_SECRET environment variable is required'); process.exit(1); }
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) { console.error('❌ FATAL: JWT_SECRET must be at least 32 characters in production'); process.exit(1); }

const app = express();
const PORT = process.env.PORT || 3001;

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

const isProduction = process.env.NODE_ENV === 'production';
const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || (isProduction ? ['https://dhandho.app'] : ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002']);
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.includes(origin) || !isProduction)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
// Request logger — logs ALL requests including failed body parsing
app.use((req, res, next) => {
  if (!req.originalUrl.startsWith('/api/')) return next();
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const status = res.statusCode;
    const tenant = (req.headers['x-tenant-id'] as string)?.slice(0, 8) || '—';
    const icon = status >= 500 ? '💥' : status >= 400 ? '⚠️' : status >= 300 ? '↩️' : '✅';
    const method = req.method.padEnd(7);
    console.log(`${icon} ${method}${req.originalUrl}  →  ${status}  (${ms}ms)  tenant:${tenant}`);
  });
  next();
});

app.use('/api/backup/restore', express.json({ limit: '50mb' }));
app.use(express.json({ limit: '2mb' }));

// RFC 10008 — HTTP QUERY method support
// Express doesn't route QUERY natively; treat it as GET with a body.
// Body is already parsed above by express.json (which runs on all methods).
app.use((req, _res, next) => {
  if (req.method === 'QUERY') {
    // Merge body fields into query so existing param reads still work
    if (req.body && typeof req.body === 'object') {
      Object.assign(req.query, req.body);
    }
    req.method = 'GET'; // route to matching GET handler
  }
  next();
});

// Public routes that don't need auth
const PUBLIC_PATHS = [
  '/api/auth/login', '/api/auth/signup', '/api/auth/forgot-password', '/api/auth/reset-password',
  '/api/super-admin/login', '/api/tenant/by-slug/', '/api/health',
  '/manifest.json',
  // On-prem license endpoints — validated by license key / localhost, not JWT
  '/api/onprem/activate', '/api/onprem/heartbeat', '/api/onprem/deactivate', '/api/onprem/provision', '/api/onprem/apply-settings',
];

// Tenant status — no cache, always check DB

// Global auth: protect all /api/ routes except public ones
app.use('/api/', async (req, res, next) => {
  if (PUBLIC_PATHS.some(p => req.path.startsWith(p.replace('/api', '')))) return next();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, { algorithms: ['HS256'] }) as { tenantId?: string; userId?: string; role?: string };
    if (decoded.tenantId) {
      req.headers['x-tenant-id'] = decoded.tenantId;
      const tenant = (await pool.query('SELECT status, subscription_ends_at, trial_ends_at FROM tenants WHERE id = $1', [decoded.tenantId])).rows[0] as { status: string; subscription_ends_at: string | null; trial_ends_at: string | null } | undefined;
      if (tenant?.status === 'suspended') {
        return res.status(403).json({ error: 'Account suspended. Contact admin.' });
      }
      const expiresAt = tenant?.subscription_ends_at || tenant?.trial_ends_at;
      if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
        return res.status(403).json({ error: 'Subscription expired. Contact admin to renew.' });
      }
    }
    (req as unknown as Record<string, unknown>).user = decoded;
    (req as unknown as Record<string, unknown>).tenantId = decoded.tenantId;
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
  next();
});

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: isProduction ? 10 : 50, message: { error: 'Too many login attempts, try again in 15 minutes' }, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', loginLimiter);
app.use('/api/super-admin/login', loginLimiter);
app.use('/api/settings/change-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many password change attempts' } }));
app.use('/api/auth/forgot-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many reset requests, try again in 15 minutes' } }));
app.use('/api/auth/reset-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many reset attempts' } }));
app.use('/api/auth/signup', rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many signup attempts' } }));

// Dynamic PWA manifest — serves tenant-specific start_url and branding
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
    } catch {}
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

// Serve static files in production (only if dist exists)
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// Block browser access when REQUIRE_ELECTRON=true — cloud customers must use the app
if (process.env.REQUIRE_ELECTRON === 'true') {
  app.use((req, res, next) => {
    // Allow: API calls, admin panel, on-prem local, already-Electron requests
    const isApi = req.path.startsWith('/api/');
    const isAdmin = req.path.startsWith('/admin');
    const isElectron = req.headers['x-dg-client'] === 'electron-cloud' || req.headers['x-dg-client'] === 'electron-onprem';
    const isOnPremLocal = process.env.DEPLOYMENT_MODE === 'onprem';
    if (isApi || isAdmin || isElectron || isOnPremLocal) return next();
    // Browser user — serve download page
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

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, message: 'API is running' });
});

// Mount super admin routes (no tenant middleware)
app.use(superAdminRouter);

// Mount tenant route modules
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
app.use(authRouter);
app.use(adminRouter);
app.use(dashboardRouter);
app.use(searchRouter);
app.use(mastersRouter);
app.use(mappingRouter);
app.use(auditRouter);
app.use(payrollRouter);
app.use(expensesRouter);
app.use(invoicesRouter);
app.use(chatbotRouter);
app.use(billSettingsRouter);
app.use(reportsRouter);
app.use(purchasesRouter);
app.use(quotationsRouter);
app.use(ordersRouter);
app.use(priceListsRouter);
app.use(accountsRouter);

// Global error handler — never leak internals to client
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { method: req.method, path: req.path, error: err.message, stack: isProduction ? undefined : err.stack });
  res.status(500).json({ error: 'Internal server error' });
});

// SPA fallback (only if built)
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexPath = path.join(process.cwd(), 'dist', 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send(`Frontend not built. Run "npm run dev" for the dev server (port 3000) or "npm run build" then restart.`);
  }
});

initDatabase().then(() => {
  app.listen(PORT, () => {
    const env = process.env.NODE_ENV || 'development';
    console.log('');
    console.log('╔══════════════════════════════════════════╗');
    console.log('║         Dhandho — API Server         ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log(`║  Port:  ${String(PORT).padEnd(32)}║`);
    console.log(`║  Mode:  ${env.padEnd(32)}║`);
    console.log(`║  DB:    PostgreSQL connected             ║`);
    console.log('╚══════════════════════════════════════════╝');
    console.log('');
    console.log('Waiting for requests...');
    console.log('');
  });
}).catch((err) => {
  console.error('❌ Failed to start server:', String(err));
  process.exit(1);
});
