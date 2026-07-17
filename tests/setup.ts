import dotenv from 'dotenv';
dotenv.config();

// Secrets must come from env (.env / CI). See tests/globalSetup.ts.
if (!process.env.DATABASE_URL || !process.env.JWT_SECRET) {
  throw new Error('DATABASE_URL and JWT_SECRET are required for tests (set via .env or CI).');
}
