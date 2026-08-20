/**
 * Barcode & Label Template Designer — desktop UI smoke.
 *
 * Prerequisites:
 * - Vite dev server on http://localhost:3000
 * - Express API on :3001
 * - Test tenant: manualuitestmfg / admin@manualuitest.com
 *
 * Run: npx playwright test -c playwright.barcode-label.config.ts
 */
import { test, expect, type Page } from '@playwright/test';

const TEST_EMAIL = 'admin@manualuitest.com';
const TEST_PASSWORD = 'Test@123';
const TEST_COMPANY_SLUG = 'manualuitestmfg';
const APP_BASE = `http://localhost:3000/${TEST_COMPANY_SLUG}`;
const DEVICE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f91';

async function installDesktopShell(page: Page) {
  await page.addInitScript((deviceId: string) => {
    try {
      localStorage.setItem('dg_sc_device_id', deviceId);
    } catch {
      /* ignore */
    }
    (window as unknown as { electronAPI?: { isElectron: boolean; deploymentMode: string } }).electronAPI = {
      isElectron: true,
      deploymentMode: 'cloud',
    };
  }, DEVICE_ID);
}

async function loginAsAdmin(page: Page) {
  await page.goto(APP_BASE);
  await page.locator('#login-email, input[type="email"]').first().fill(TEST_EMAIL);
  await page.locator('#login-password, input[type="password"]').first().fill(TEST_PASSWORD);
  await Promise.all([
    page.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST', { timeout: 20000 }),
    page.getByRole('button', { name: /login|sign in|please wait/i }).click(),
  ]);
  await page.locator('#login-email, input[type="email"]').first().waitFor({ state: 'hidden', timeout: 20000 });
}

async function openBillSettings(page: Page) {
  await page
    .getByRole('button', { name: /settings/i })
    .first()
    .click();
  await page.getByRole('button', { name: /bill customization/i }).click();
  await expect(page.getByRole('heading', { name: /barcode.*label templates/i })).toBeVisible({ timeout: 15000 });
}

test.describe('Barcode label templates designer', () => {
  test.beforeEach(async ({ page }) => {
    await installDesktopShell(page);
    await loginAsAdmin(page);
  });

  test('opens template list under Bill Settings', async ({ page }) => {
    await openBillSettings(page);
    await expect(page.getByRole('button', { name: /new template/i })).toBeVisible();
  });

  test('creates a template in the visual designer', async ({ page }) => {
    await openBillSettings(page);
    await page.getByRole('button', { name: /new template/i }).click();
    await expect(page.getByLabel('Template name')).toBeVisible();
    await page.getByLabel('Template name').fill('E2E 38x25 Label');
    await page.getByRole('button', { name: /\+ barcode/i }).click();
    await page.getByRole('button', { name: /^save$/i }).click();
    await expect(page.getByText(/template created/i)).toBeVisible({ timeout: 15000 });
    await page.getByRole('button', { name: /^close$/i }).click();
    await expect(page.getByText('E2E 38x25 Label')).toBeVisible();
  });

  test('supports preview actions from template list', async ({ page }) => {
    await openBillSettings(page);
    const row = page.locator('text=E2E 38x25 Label').first();
    if (await row.count()) {
      await page
        .getByRole('button', { name: /print test/i })
        .first()
        .click();
      await expect(page.getByText(/preparing test label/i)).toBeVisible({ timeout: 10000 });
    } else {
      test.skip(true, 'Create-template test did not run first in this environment');
    }
  });
});
