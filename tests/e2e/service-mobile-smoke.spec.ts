/**
 * Offline service-mobile web smoke (dist-service-mobile + PGlite in browser).
 * Mocks cloud license APIs; exercises activate → provision → client → invoice modal.
 *
 * Prereq: npm run build:service-mobile (webServer starts preview only).
 */
import { test, expect, type Page } from '@playwright/test';

const LICENSE_KEY = 'DG-SM-E2E00001-E2E00002';
const ADMIN_EMAIL = 'admin@e2e.local';
const ADMIN_PASSWORD = 'TestPass123!';

const ACTIVATE_BODY = {
  valid: true,
  licenseKey: LICENSE_KEY,
  companyName: 'E2E Service Co',
  businessType: 'service',
  maxUsers: 1,
  adminEmail: ADMIN_EMAIL,
  validUntil: '2099-12-31',
  settings: {},
  tabConfig: {},
  hasBackup: false,
};

async function mockServiceMobileCloud(page: Page) {
  await page.route('**/api/service-mobile/**', async route => {
    const url = route.request().url();
    if (url.includes('/activate')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ACTIVATE_BODY) });
      return;
    }
    if (url.includes('/heartbeat')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, settings: {}, notifications: [] }),
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
  });
}

test.describe('offline service-mobile smoke', () => {
  test.beforeEach(async ({ page }) => {
    await mockServiceMobileCloud(page);
  });

  test('cold start shows license onboarding', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Offline Mobile setup' })).toBeVisible();
    await expect(page.getByPlaceholder('DG-SM-…')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Activate this phone' })).toBeVisible();
  });

  test('activate → provision → client → invoice modal', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { name: 'Offline Mobile setup' })).toBeVisible({ timeout: 60_000 });
    await page.getByPlaceholder('DG-SM-…').fill(LICENSE_KEY);
    await page.getByRole('button', { name: 'Activate this phone' }).click();

    await expect(page.getByRole('button', { name: 'Start fresh (no backup)' })).toBeVisible({ timeout: 30_000 });
    await page.getByRole('button', { name: 'Start fresh (no backup)' }).click();

    const pwd = page.locator('input[type="password"]').first();
    await pwd.fill(ADMIN_PASSWORD);
    await page.locator('input[type="password"]').nth(1).fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Finish setup' }).click();

    await expect(page.locator('#login-email')).toBeVisible({ timeout: 60_000 });
    await page.locator('#login-email').fill(ADMIN_EMAIL);
    await page.locator('#login-password').fill(ADMIN_PASSWORD);
    await page.getByRole('button', { name: /^Login$/i }).click();

    // App shutter intro (~5s) then phone shell
    await expect(page.getByRole('button', { name: 'Masters' })).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: 'Masters' }).click();
    await expect(page.getByText('Clients & rates')).toBeVisible({ timeout: 30_000 });

    const addClient = page.getByRole('button', { name: /Add Client/i });
    if (await addClient.isVisible().catch(() => false)) {
      await addClient.click();
    } else {
      await page.getByRole('button', { name: 'Clients' }).click();
      await page.getByRole('button', { name: /Add Client/i }).click();
    }

    await expect(page.getByRole('heading', { name: 'Add Client' })).toBeVisible({ timeout: 15_000 });
    await page.getByLabel('Name').fill('E2E Test Client');
    await page.getByLabel(/^Phone/i).fill('9876543210');
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('E2E Test Client')).toBeVisible({ timeout: 20_000 });

    await page.getByRole('button', { name: 'Invoice' }).click();
    await page.getByRole('button', { name: /New Invoice/i }).click();
    await expect(page.getByText(/Party|Customer|Client/i).first()).toBeVisible({ timeout: 20_000 });
  });
});
