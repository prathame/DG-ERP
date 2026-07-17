import dotenv from 'dotenv';
dotenv.config();

import { assertCriticalEnv } from './utils/env';
assertCriticalEnv();

import { initDatabase } from './pg-db';
import { createApp } from './app';

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
