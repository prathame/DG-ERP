import { defineConfig } from '@playwright/test';

/**
 * Config for manufacturer UI e2e against Vite (:3000) + API (:3001).
 * Run: npx playwright test -c playwright.manufacturer.config.ts
 * Prerequisites: npm run server && npm run dev
 */
export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/manufacturer-ui-test.spec.ts',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    browserName: 'chromium',
    // Desktop default; the spec overrides viewport per test.
    viewport: { width: 1440, height: 900 },
  },
});
