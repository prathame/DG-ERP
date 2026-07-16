import dotenv from 'dotenv';
dotenv.config();

import { initDatabase } from './pg-db';
import { createApp } from './app';

if (!process.env.DATABASE_URL) { console.error('❌ FATAL: DATABASE_URL environment variable is required'); process.exit(1); }
if (!process.env.JWT_SECRET) { console.error('❌ FATAL: JWT_SECRET environment variable is required'); process.exit(1); }
if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) { console.error('❌ FATAL: JWT_SECRET must be at least 32 characters in production'); process.exit(1); }

const app = createApp();
const PORT = process.env.PORT || 3001;

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
