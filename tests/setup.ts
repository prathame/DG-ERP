import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:1234@localhost:5432/splendor_erp_test';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-key-for-automated-tests';
}

import { initDatabase } from '../server/pg-db';

// setupFiles in Vitest supports top-level await
await initDatabase();
