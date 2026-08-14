/**
 * Phase 2.6: Authentication UI tests.
 * Tests login, logout, invalid credentials, and session.
 */
import { test, expect } from '@playwright/test';

const QA_A = {
  slug: 'qa-srjewel',
  email: 'admin@srjewel.qa',
  password: 'QaTest@2026!',
};
const QA_B = {
  slug: 'qa-techseva',
  email: 'admin@techseva.qa',
  password: 'QaTest@2026!',
};

test.describe('Authentication', () => {
  test('Login page loads at slug route', async ({ page }) => {
    await page.goto(`/${QA_A.slug}`);
    await expect(page).toHaveTitle(/Shree Radha Jewellers|Dhandho/i);
    // Login form should be visible
    await expect(page.locator('input[type="email"], input[type="text"][placeholder*="email" i]').first()).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('Invalid credentials shows error', async ({ page }) => {
    await page.goto(`/${QA_A.slug}`);
    await page.fill('input[type="email"], input[type="text"][placeholder*="email" i]', QA_A.email);
    await page.fill('input[type="password"]', 'WrongPassword123!');
    await page.click(
      'button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")',
    );
    // Should show an error, not navigate away
    await expect(page.locator('text=/invalid|incorrect|wrong/i').or(page.locator('[role="alert"]'))).toBeVisible({
      timeout: 5000,
    });
    expect(page.url()).toContain(QA_A.slug);
  });

  test('Successful login navigates to dashboard', async ({ page }) => {
    await page.goto(`/${QA_A.slug}`);
    await page.fill('input[type="email"], input[type="text"][placeholder*="email" i]', QA_A.email);
    await page.fill('input[type="password"]', QA_A.password);
    // Select platform if required
    const platformSelect = page
      .locator('select, [role="combobox"]')
      .filter({ hasText: /web|platform/i })
      .first();
    if (await platformSelect.isVisible().catch(() => false)) {
      await platformSelect.selectOption({ label: 'Web' });
    }
    await page.click(
      'button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")',
    );
    // Should navigate to a dashboard/main view
    await page.waitForURL(url => !url.toString().includes('/login') && url.toString().includes(QA_A.slug), {
      timeout: 10000,
    });
    // Page title should show company name
    await expect(page).toHaveTitle(/Shree Radha|Dhandho/i);
  });

  test('Tenant B login is isolated from Tenant A', async ({ page }) => {
    // Login as Tenant B
    await page.goto(`/${QA_B.slug}`);
    await page.fill('input[type="email"], input[type="text"][placeholder*="email" i]', QA_B.email);
    await page.fill('input[type="password"]', QA_B.password);
    await page.click(
      'button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")',
    );
    await page.waitForURL(url => url.toString().includes(QA_B.slug), { timeout: 10000 });
    // Page should show TechSeva branding, not Shree Radha
    const title = await page.title();
    expect(title).not.toMatch(/Shree Radha/i);
  });

  test('No horizontal overflow on login page', async ({ page }) => {
    await page.goto(`/${QA_A.slug}`);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2); // 2px tolerance
  });
});
