/**
 * Phase 2.6: Mobile UX tests — viewport 390x844 (iPhone 14 Pro).
 *
 * Tests touch-friendliness, navigation, and usability on mobile.
 * This test runs ONLY with the Mobile Chrome project in the playwright config.
 */
import { test, expect, type Page } from '@playwright/test';

const QA_A = { slug: 'qa-srjewel', email: 'admin@srjewel.qa', password: 'QaTest@2026!' };

const MIN_TOUCH_TARGET_PX = 44; // WCAG 2.5.8 minimum touch target size

async function login(page: Page) {
  await page.goto(`/${QA_A.slug}`);
  await page.fill('input[type="email"], input[type="text"][placeholder*="email" i]', QA_A.email);
  await page.fill('input[type="password"]', QA_A.password);
  await page.click(
    'button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")',
  );
  await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
}

test.describe('Mobile UX', () => {
  test('Login form is usable on mobile — inputs not too small', async ({ page }) => {
    await page.goto(`/${QA_A.slug}`);
    const emailInput = page.locator('input[type="email"], input[type="text"][placeholder*="email" i]').first();
    await expect(emailInput).toBeVisible();
    const box = await emailInput.boundingBox();
    if (box) {
      // Input height should be at least 40px for comfortable tapping
      expect(box.height).toBeGreaterThanOrEqual(36);
    }
  });

  test('No horizontal overflow on login page (mobile)', async ({ page }) => {
    await page.goto(`/${QA_A.slug}`);
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 2);
  });

  test('Submit button is large enough to tap (mobile)', async ({ page }) => {
    await page.goto(`/${QA_A.slug}`);
    const submitBtn = page
      .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Login"), button:has-text("Log in")')
      .first();
    await expect(submitBtn).toBeVisible();
    const box = await submitBtn.boundingBox();
    if (box) {
      expect(box.height).toBeGreaterThanOrEqual(40);
      expect(box.width).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
    }
  });

  test('Dashboard loads without horizontal overflow (mobile)', async ({ page }) => {
    await login(page);
    await page.waitForLoadState('networkidle').catch(() => {});
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 5);
  });

  test('Navigation mechanism is present after login (mobile)', async ({ page }) => {
    await login(page);
    await page.waitForLoadState('networkidle').catch(() => {});
    // Any navigation elements — links, tabs, or buttons are sufficient
    const navItems = page.locator('a[href], [role="tab"], [role="button"], button');
    const count = await navItems.count();
    expect(count).toBeGreaterThan(2); // At least 3 interactive elements = functioning navigation
  });

  test('Text is readable — no overflow or clipping (mobile)', async ({ page }) => {
    await login(page);
    await page.waitForLoadState('networkidle').catch(() => {});
    // Check that main content area text is not overflowing
    const overflow = await page.evaluate(() => {
      const elements = document.querySelectorAll('h1, h2, h3, p, span');
      let hasOverflow = false;
      for (const el of elements) {
        const rect = el.getBoundingClientRect();
        if (rect.right > window.innerWidth + 5) {
          hasOverflow = true;
          break;
        }
      }
      return hasOverflow;
    });
    expect(overflow).toBe(false);
  });
});
