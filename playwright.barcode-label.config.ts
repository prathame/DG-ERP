import { defineConfig } from '@playwright/test';

/**
 * Barcode label template designer e2e against Vite (:3000) + API (:3001).
 * Run: npm run test:e2e:barcode-labels
 * Prerequisites: npm run server && npm run dev
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/barcode-label-templates.spec.ts',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    browserName: 'chromium',
    viewport: { width: 1440, height: 900 },
  },
});
