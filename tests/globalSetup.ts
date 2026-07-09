import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgresql://postgres:1234@localhost:5432/splendor_erp_test';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-secret-key-for-automated-tests';
}
if (!process.env.SUPER_ADMIN_EMAIL) {
  process.env.SUPER_ADMIN_EMAIL = 'admin@dgerp.com';
}
if (!process.env.SUPER_ADMIN_PASSWORD) {
  process.env.SUPER_ADMIN_PASSWORD = 'password123';
}

export async function setup() {
  const { initDatabase } = await import('../server/pg-db');
  await initDatabase();
}

export async function teardown() {
  // Pool will close naturally when process exits
}
