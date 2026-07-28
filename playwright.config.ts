import { defineConfig } from '@playwright/test';

const port = 4173;
const host = '127.0.0.1';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 180_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://${host}:${port}`,
    trace: 'retain-on-failure',
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  },
  webServer: {
    command: `npx vite preview --outDir dist-service-mobile --host ${host} --port ${port}`,
    url: `http://${host}:${port}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
