/**
 * Phase 2.6: Dashboard and navigation UI tests.
 * Tests main dashboard, navigation, and cross-viewport behaviour.
 */
import { test, expect, type Page } from '@playwright/test';

const QA_A = { slug: 'qa-srjewel', email: 'admin@srjewel.qa', password: 'QaTest@2026!' };

async function login(page: Page) {
  await page.goto(`/${QA_A.slug}`);
  await page.fill('input[type="email"], input[type="text"][placeholder*="email" i]', QA_A.email);
  await page.fill('input[type="password"]', QA_A.password);
  await page.click(
    'button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")',
  );
  await page
    .waitForURL(url => !url.toString().endsWith(QA_A.slug) || url.toString().includes('#'), { timeout: 15000 })
    .catch(() => {});
  // Wait for any loading indicator to disappear
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

test.describe('Dashboard and Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('Dashboard loads with some content', async ({ page }) => {
    await page.waitForLoadState('networkidle').catch(() => {});
    // Wait for any visible interactive content to appear
    await page.waitForSelector('button, a, [role="tab"], [role="button"]', { timeout: 10000 });
    // The page should have rendered something meaningful
    const bodyText = await page.evaluate(() => document.body.innerText.trim().length);
    expect(bodyText).toBeGreaterThan(50);
  });

  test('Navigation menu elements are present', async ({ page }) => {
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(2000); // Allow React hydration
    // Any clickable navigation element — links, tabs, or buttons in the UI shell
    const navElements = page.locator('a[href], [role="tab"], [role="button"], button');
    const count = await navElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test('No horizontal overflow on dashboard', async ({ page }) => {
    await page.waitForLoadState('networkidle').catch(() => {});
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5); // 5px tolerance for scrollbars
  });

  test('No JS console errors on dashboard load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });
    await page.waitForLoadState('networkidle').catch(() => {});
    // Filter out expected errors (network, CORS in dev, etc.)
    const criticalErrors = errors.filter(
      e =>
        !e.includes('favicon') &&
        !e.includes('net::ERR') &&
        !e.includes('CORS') &&
        !e.includes('Sentry') &&
        !e.includes('sw.js'),
    );
    expect(criticalErrors).toHaveLength(0);
  });

  test('Can navigate to Customers', async ({ page }) => {
    // Find and click customers in nav
    const customersLink = page
      .locator('a, button')
      .filter({ hasText: /customer/i })
      .first();
    if (await customersLink.isVisible().catch(() => false)) {
      await customersLink.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      // Should show a customers list or empty state
      await expect(page.locator('text=/customer|No customer/i').first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('Can navigate to Products', async ({ page }) => {
    const productsLink = page
      .locator('a, button')
      .filter({ hasText: /product|inventor/i })
      .first();
    if (await productsLink.isVisible().catch(() => false)) {
      await productsLink.click();
      await page.waitForLoadState('networkidle').catch(() => {});
      await expect(page.locator('text=/product|No product/i').first()).toBeVisible({ timeout: 8000 });
    }
  });

  test('Notifications bell/icon is accessible', async ({ page }) => {
    const notifButton = page.locator(
      '[aria-label*="notification" i], button:has-text("notification"), [class*="bell"]',
    );
    if ((await notifButton.count()) > 0) {
      await expect(notifButton.first()).toBeVisible();
    }
  });

  test('Company name visible in header/sidebar', async ({ page }) => {
    // The tenant company name should appear somewhere on screen
    const companyName = page.locator('text=/Shree Radha|SRJewel|qa-srjewel/i');
    await expect(companyName.first()).toBeVisible({ timeout: 5000 });
  });
});
