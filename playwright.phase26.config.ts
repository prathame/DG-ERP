/**
 * Phase 2.6 Playwright config — Real browser UI testing against live servers.
 *
 * Prerequisites (must be running):
 *   Backend:  npm run server   (port 3001)
 *   Frontend: npm run preview  (port 3000, built dist/)
 *
 * QA Tenants (seed first):
 *   npx tsx scripts/seed-qa-tenants.ts
 *
 * Run:
 *   npx playwright test -c playwright.phase26.config.ts
 *   npx playwright test -c playwright.phase26.config.ts --headed  (see browser)
 */
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e/phase26',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'test-results/phase26', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'Desktop Chrome (1440x900)',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'Desktop Chrome (1280x720)',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    {
      name: 'Mobile Chrome (390x844)',
      use: { ...devices['Pixel 5'] },
    },
    {
      name: 'Tablet (768x1024)',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 } },
    },
  ],
});
