import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';

import { initDatabase } from './pg-db';

import superAdminRouter from './routes/super-admin';
import productsRouter from './routes/products';
import salesRouter from './routes/sales';
import distributionRouter from './routes/distribution';
import warrantiesRouter from './routes/warranties';
import replacementsRouter from './routes/replacements';
import transactionsRouter from './routes/transactions';
import rewardsRouter from './routes/rewards';
import customersRouter from './routes/customers';
import vendorsRouter from './routes/vendors';
import banksRouter from './routes/banks';
import financeRouter from './routes/finance';
import authRouter from './routes/auth';
import adminRouter from './routes/admin';
import dashboardRouter from './routes/dashboard';
import searchRouter from './routes/search';
import notificationsRouter from './routes/notifications';
import mastersRouter from './routes/masters';
import mappingRouter from './routes/mapping';
import auditRouter from './routes/audit';
import chatbotRouter from './routes/chatbot';
import billSettingsRouter from './routes/bill-settings';
import { logger } from './utils/logger';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));

const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:3002'];
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
    res.header('Access-Control-Allow-Origin', origin || '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Tenant-ID');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: '2mb' }));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Too many login attempts, try again in 15 minutes' }, standardHeaders: true, legacyHeaders: false });
app.use('/api/auth/login', loginLimiter);
app.use('/api/super-admin/login', loginLimiter);
app.use('/api/settings/change-password', rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: { error: 'Too many password change attempts' } }));

// Serve static files in production (only if dist exists)
const distPath = path.join(process.cwd(), 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
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
app.use(transactionsRouter);
app.use(rewardsRouter);
app.use(customersRouter);
app.use(vendorsRouter);
app.use(banksRouter);
app.use(financeRouter);
app.use(authRouter);
app.use(adminRouter);
app.use(dashboardRouter);
app.use(searchRouter);
app.use(notificationsRouter);
app.use(mastersRouter);
app.use(mappingRouter);
app.use(auditRouter);
app.use(chatbotRouter);
app.use(billSettingsRouter);

// Request logging for errors
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error('Unhandled error', { method: req.method, path: req.path, error: err.message, stack: err.stack });
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
    logger.info('Server started', { port: PORT, env: process.env.NODE_ENV || 'development' });
  });
}).catch((err) => {
  logger.error('Failed to initialize database', { error: String(err) });
  process.exit(1);
});
