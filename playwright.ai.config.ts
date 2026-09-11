import { defineConfig } from '@playwright/test';

/**
 * AI assistant chat UI against Vite (:3000) + API (:3001).
 * Run: npx playwright test -c playwright.ai.config.ts
 * Prerequisites: npm run server && npm run dev
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/ai-assistant-invoice.spec.ts',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    navigationTimeout: 30_000,
    actionTimeout: 20_000,
    trace: 'retain-on-failure',
    browserName: 'chromium',
    viewport: { width: 1280, height: 800 },
  },
});
