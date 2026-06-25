import express from 'express';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

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

const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});
app.use(express.json());

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
    console.log(`API server running at http://localhost:${PORT}`);
  });
}).catch((err) => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
