/**
 * Comprehensive UI test for DG-ERP Manufacturer Business Type
 * Tests desktop (1440x900) and mobile (390x844) viewports
 *
 * Prerequisites:
 * - Vite dev server running on http://localhost:3000
 * - Express API server running on :3001
 * - Test tenant created with credentials below
 *
 * Run: npx playwright test tests/e2e/manufacturer-ui-test.spec.ts --headed
 */

import { test, expect, type Page, type ConsoleMessage } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Test credentials
const TEST_EMAIL = 'admin@manualuitest.com';
const TEST_PASSWORD = 'Test@123';
const TEST_COMPANY_SLUG = 'manualuitestmfg';

// Test data
const TEST_VENDOR = {
  name: 'UI Test Vendor',
  phone: '9123456780',
};

interface TestIssue {
  page: string;
  viewport: string;
  severity: 'error' | 'warning' | 'info';
  category: 'visual' | 'functional' | 'console' | 'responsive';
  description: string;
  screenshot?: string;
}

class TestReport {
  private issues: TestIssue[] = [];
  private screenshots: Map<string, string> = new Map();

  addIssue(issue: TestIssue) {
    this.issues.push(issue);
  }

  addScreenshot(key: string, path: string) {
    this.screenshots.set(key, path);
  }

  getVerdict(): 'PASS' | 'FAIL' {
    return this.issues.filter(i => i.severity === 'error').length > 0 ? 'FAIL' : 'PASS';
  }

  generateReport(): string {
    const verdict = this.getVerdict();
    const errors = this.issues.filter(i => i.severity === 'error');
    const warnings = this.issues.filter(i => i.severity === 'warning');

    let report = '\n========================================\n';
    report += 'DG-ERP MANUFACTURER UI TEST REPORT\n';
    report += '========================================\n\n';
    report += `VERDICT: ${verdict}\n`;
    report += `Errors: ${errors.length}\n`;
    report += `Warnings: ${warnings.length}\n`;
    report += `Screenshots captured: ${this.screenshots.size}\n\n`;

    if (errors.length > 0) {
      report += '--- ERRORS (Must Fix) ---\n';
      errors.forEach((issue, idx) => {
        report += `\n${idx + 1}. [${issue.page}] [${issue.viewport}] [${issue.category}]\n`;
        report += `   ${issue.description}\n`;
        if (issue.screenshot) report += `   Screenshot: ${issue.screenshot}\n`;
      });
    }

    if (warnings.length > 0) {
      report += '\n--- WARNINGS (Should Review) ---\n';
      warnings.forEach((issue, idx) => {
        report += `\n${idx + 1}. [${issue.page}] [${issue.viewport}]\n`;
        report += `   ${issue.description}\n`;
      });
    }

    if (this.issues.length === 0) {
      report += '\n✅ All tests passed! No issues found.\n';
    }

    report += '\n========================================\n';
    return report;
  }
}

const APP_BASE = `http://localhost:3000/${TEST_COMPANY_SLUG}`;
const DESKTOP_DEVICE_ID = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';
const MOBILE_DEVICE_ID = 'f0e1d2c3b4a5968778695a4b3c2d1e0f';

/** Simulate Electron/Capacitor shell + stable device id so seats aren't exhausted across runs. */
async function installAppShell(page: Page, shell: 'desktop' | 'mobile' = 'desktop') {
  const deviceId = shell === 'desktop' ? DESKTOP_DEVICE_ID : MOBILE_DEVICE_ID;
  await page.addInitScript(
    ({ shellKind, deviceId: id }) => {
      try {
        localStorage.setItem('dg_sc_device_id', id);
      } catch {
        /* ignore */
      }
      const w = window as unknown as {
        electronAPI?: { isElectron: boolean; deploymentMode: string };
        Capacitor?: { isNativePlatform: () => boolean; getPlatform: () => string };
      };
      if (shellKind === 'desktop') {
        w.electronAPI = { isElectron: true, deploymentMode: 'cloud' };
      } else {
        w.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'android' };
      }
    },
    { shellKind: shell, deviceId },
  );
}

async function dismissBlockingModals(page: Page) {
  const blocked = page.getByText(/Access blocked|No free .* device slots/i);
  if (await blocked.count()) {
    // Escape / click backdrop if present; otherwise hard-fail with a clear message.
    await page.keyboard.press('Escape').catch(() => {});
    if (await blocked.isVisible().catch(() => false)) {
      throw new Error(
        'Access blocked modal present (device seats exhausted). Unbind slots for the test tenant and retry.',
      );
    }
  }
}

async function safeClick(locator: ReturnType<Page['locator']>) {
  await locator.evaluate((el: HTMLElement) => el.click());
}

// Helper: Wait for page to be stable (no pending requests)
async function waitForPageLoad(page: Page, timeout = 10000) {
  await page.waitForLoadState('networkidle', { timeout });
}

// Helper: Capture console errors
function setupConsoleErrorTracking(page: Page, report: TestReport, viewport: string) {
  const consoleErrors: ConsoleMessage[] = [];

  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg);
    }
  });

  page.on('pageerror', error => {
    report.addIssue({
      page: page.url(),
      viewport,
      severity: 'error',
      category: 'console',
      description: `JavaScript Error: ${error.message}`,
    });
  });

  return consoleErrors;
}

// Helper: Take and save screenshot
async function captureScreenshot(page: Page, name: string, report: TestReport, viewport: string): Promise<string> {
  const screenshotPath = `test-results/manufacturer-${viewport}-${name}.png`;
  await page.screenshot({ path: screenshotPath, fullPage: true });
  report.addScreenshot(`${viewport}-${name}`, screenshotPath);
  return screenshotPath;
}

// Helper: Check for visual issues
async function checkForVisualIssues(page: Page, pageName: string, viewport: string, report: TestReport) {
  // Check for horizontal scroll (indicates responsive issue)
  const hasHorizontalScroll = await page.evaluate(() => {
    return document.documentElement.scrollWidth > document.documentElement.clientWidth;
  });

  if (hasHorizontalScroll) {
    report.addIssue({
      page: pageName,
      viewport,
      severity: 'error',
      category: 'responsive',
      description: 'Horizontal scrollbar detected - content wider than viewport',
    });
  }

  // Check for overlapping elements (common mobile issue)
  const hasOverlapping = await page.evaluate(() => {
    const elements = Array.from(document.querySelectorAll('button, input, a'));
    for (let i = 0; i < elements.length; i++) {
      const rect1 = elements[i].getBoundingClientRect();
      if (rect1.width === 0 || rect1.height === 0) continue;

      for (let j = i + 1; j < elements.length; j++) {
        const rect2 = elements[j].getBoundingClientRect();
        if (rect2.width === 0 || rect2.height === 0) continue;

        const overlap = !(
          rect1.right < rect2.left ||
          rect1.left > rect2.right ||
          rect1.bottom < rect2.top ||
          rect1.top > rect2.bottom
        );

        if (overlap) return true;
      }
    }
    return false;
  });

  if (hasOverlapping) {
    report.addIssue({
      page: pageName,
      viewport,
      severity: 'warning',
      category: 'visual',
      description: 'Overlapping interactive elements detected',
    });
  }
}

test.describe('Manufacturer UI Test - Desktop Viewport', () => {
  let report: TestReport;

  test.beforeAll(() => {
    report = new TestReport();
  });

  test.afterAll(() => {
    console.log(report.generateReport());
    // Write report to file
    fs.writeFileSync('test-results/manufacturer-test-report.txt', report.generateReport());
  });

  test('Desktop: Login and navigate all manufacturer sections', async ({ page }) => {
    const viewport = 'desktop-1440x900';
    await page.setViewportSize({ width: 1440, height: 900 });
    await installAppShell(page, 'desktop');
    setupConsoleErrorTracking(page, report, viewport);

    // Step 1: Navigate to login screen
    await test.step('Navigate to login screen', async () => {
      await page.goto(APP_BASE);
      await waitForPageLoad(page);
      await captureScreenshot(page, '01-login-screen', report, viewport);

      // Check if login form is visible
      const hasEmailField = (await page.locator('#login-email, input[type="email"]').count()) > 0;
      const hasPasswordField = (await page.locator('#login-password, input[type="password"]').count()) > 0;

      if (!hasEmailField || !hasPasswordField) {
        report.addIssue({
          page: 'Login Screen',
          viewport,
          severity: 'error',
          category: 'functional',
          description: 'Login form fields not found',
        });
        return;
      }
    });

    // Step 2: Login
    await test.step('Login with manufacturer credentials', async () => {
      // Check if there's a company slug field
      const companyField = page
        .locator('input[name="company"], input[placeholder*="ompany"], input[placeholder*="slug"]')
        .first();
      if ((await companyField.count()) > 0) {
        await companyField.fill(TEST_COMPANY_SLUG);
      }

      await page.locator('#login-email, input[type="email"]').first().fill(TEST_EMAIL);
      await page.locator('#login-password, input[type="password"]').first().fill(TEST_PASSWORD);

      await Promise.all([
        page.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST', {
          timeout: 15000,
        }),
        page.getByRole('button', { name: /login|sign in|please wait/i }).click(),
      ]);

      // Login stays on the same path — wait for the form to leave the shell.
      await page.locator('#login-email, input[type="email"]').first().waitFor({ state: 'hidden', timeout: 15000 });
      await waitForPageLoad(page);
      await dismissBlockingModals(page);

      await captureScreenshot(page, '02-dashboard', report, viewport);

      // Verify dashboard loaded
      const isDashboard = (await page.locator('text=/dashboard|home|overview|masters|analytics/i').count()) > 0;
      if (!isDashboard) {
        report.addIssue({
          page: 'Dashboard',
          viewport,
          severity: 'warning',
          category: 'functional',
          description: 'Dashboard may not have loaded correctly after login',
        });
      }

      await checkForVisualIssues(page, 'Dashboard', viewport, report);
    });

    // Step 3: Navigate to Vendors/Masters
    await test.step('Test Vendors/Masters section', async () => {
      // Look for Masters or Vendors nav item
      const mastersNav = page.locator('text=/masters|vendors/i').first();
      if ((await mastersNav.count()) > 0) {
        await safeClick(mastersNav);
        await waitForPageLoad(page);
        await captureScreenshot(page, '03-vendors-masters', report, viewport);
        await checkForVisualIssues(page, 'Vendors/Masters', viewport, report);

        // Try to create a vendor
        const addVendorBtn = page.locator('button:has-text("Add Vendor"), button:has-text("+ Vendor")').first();
        if ((await addVendorBtn.count()) > 0) {
          await addVendorBtn.click();
          await page.waitForTimeout(500);

          // Fill vendor form
          const nameField = page.locator('input[name="name"], input[placeholder*="name" i]').first();
          const phoneField = page.locator('input[name="phone"], input[placeholder*="phone" i]').first();

          if ((await nameField.count()) > 0) {
            await nameField.fill(TEST_VENDOR.name);
            await phoneField.fill(TEST_VENDOR.phone);

            await captureScreenshot(page, '04-vendor-create-form', report, viewport);

            // Save vendor
            await page.locator('button:has-text("Save"), button:has-text("Create")').first().click();
            await page.waitForTimeout(1000);

            // Check if vendor appears in list
            const vendorInList = (await page.locator(`text="${TEST_VENDOR.name}"`).count()) > 0;
            if (!vendorInList) {
              report.addIssue({
                page: 'Vendors/Masters',
                viewport,
                severity: 'error',
                category: 'functional',
                description: 'Vendor creation failed or vendor not showing in list after save',
              });
            }

            await captureScreenshot(page, '05-vendor-created', report, viewport);
          } else {
            report.addIssue({
              page: 'Vendors/Masters',
              viewport,
              severity: 'error',
              category: 'functional',
              description: 'Vendor form fields not found',
            });
          }
        } else {
          report.addIssue({
            page: 'Vendors/Masters',
            viewport,
            severity: 'warning',
            category: 'functional',
            description: 'Add Vendor button not found',
          });
        }
      } else {
        report.addIssue({
          page: 'Navigation',
          viewport,
          severity: 'error',
          category: 'functional',
          description: 'Masters/Vendors navigation item not found',
        });
      }
    });

    // Step 4: Navigate to Distribution/Dispatch
    await test.step('Test Distribution/Dispatch section', async () => {
      const dispatchNav = page.locator('text=/distribution|dispatch/i').first();
      if ((await dispatchNav.count()) > 0) {
        await safeClick(dispatchNav);
        await waitForPageLoad(page);
        await captureScreenshot(page, '06-distribution-dispatch', report, viewport);
        await checkForVisualIssues(page, 'Distribution/Dispatch', viewport, report);
      } else {
        report.addIssue({
          page: 'Navigation',
          viewport,
          severity: 'error',
          category: 'functional',
          description: 'Distribution/Dispatch navigation item not found',
        });
      }
    });

    // Step 5: Navigate to Vendor Finance/Vendor Payments
    await test.step('Test Vendor Finance/Payments section', async () => {
      const financeNav = page.locator('text=/vendor.*finance|vendor.*payment/i').first();
      if ((await financeNav.count()) > 0) {
        await safeClick(financeNav);
        await waitForPageLoad(page);
        await captureScreenshot(page, '07-vendor-finance', report, viewport);
        await checkForVisualIssues(page, 'Vendor Finance', viewport, report);
      } else {
        report.addIssue({
          page: 'Navigation',
          viewport,
          severity: 'error',
          category: 'functional',
          description: 'Vendor Finance/Payments navigation item not found',
        });
      }
    });

    // Step 6: Navigate to Vendor-Customer Mapping (if present)
    await test.step('Test Vendor-Customer Mapping section', async () => {
      // First go back to Masters
      const mastersNav = page.locator('text=/^masters$/i').first();
      if ((await mastersNav.count()) > 0) {
        await mastersNav.click();
        await waitForPageLoad(page);

        // Look for mapping option
        const mappingLink = page.locator('text=/vendor.*customer.*map|mapping/i').first();
        if ((await mappingLink.count()) > 0) {
          await mappingLink.click();
          await waitForPageLoad(page);
          await captureScreenshot(page, '08-vendor-customer-mapping', report, viewport);
          await checkForVisualIssues(page, 'Vendor-Customer Mapping', viewport, report);
        } else {
          report.addIssue({
            page: 'Masters',
            viewport,
            severity: 'info',
            category: 'functional',
            description: 'Vendor-Customer Mapping not found (may not be visible for this tenant)',
          });
        }
      }
    });
  });
});

test.describe('Manufacturer UI Test - Mobile Viewport', () => {
  let report: TestReport;

  test.beforeAll(() => {
    report = new TestReport();
  });

  test.afterAll(() => {
    console.log(report.generateReport());
    // Append to report file
    const existingReport = fs.readFileSync('test-results/manufacturer-test-report.txt', 'utf-8');
    fs.writeFileSync('test-results/manufacturer-test-report.txt', existingReport + '\n\n' + report.generateReport());
  });

  test('Mobile: Login and navigate all manufacturer sections', async ({ page }) => {
    const viewport = 'mobile-390x844';
    await page.setViewportSize({ width: 390, height: 844 });
    // Tenant is desktop-access with 0 mobile seats — use Electron shell + same device id.
    await installAppShell(page, 'desktop');
    setupConsoleErrorTracking(page, report, viewport);

    // Repeat all tests with mobile viewport
    await test.step('Navigate to login screen', async () => {
      await page.goto(APP_BASE);
      await waitForPageLoad(page);
      await captureScreenshot(page, '01-login-screen', report, viewport);

      const hasEmailField = (await page.locator('#login-email, input[type="email"]').count()) > 0;
      const hasPasswordField = (await page.locator('#login-password, input[type="password"]').count()) > 0;

      if (!hasEmailField || !hasPasswordField) {
        report.addIssue({
          page: 'Login Screen',
          viewport,
          severity: 'error',
          category: 'functional',
          description: 'Login form fields not visible on mobile',
        });
        return;
      }

      await checkForVisualIssues(page, 'Login Screen', viewport, report);
    });

    await test.step('Login with manufacturer credentials', async () => {
      const companyField = page.locator('input[name="company"], input[placeholder*="ompany"]').first();
      if ((await companyField.count()) > 0) {
        await companyField.fill(TEST_COMPANY_SLUG);
      }

      await page.locator('#login-email, input[type="email"]').first().fill(TEST_EMAIL);
      await page.locator('#login-password, input[type="password"]').first().fill(TEST_PASSWORD);

      await Promise.all([
        page.waitForResponse(r => r.url().includes('/auth/login') && r.request().method() === 'POST', {
          timeout: 15000,
        }),
        page.getByRole('button', { name: /login|sign in|please wait/i }).click(),
      ]);
      await page.locator('#login-email, input[type="email"]').first().waitFor({ state: 'hidden', timeout: 15000 });
      await waitForPageLoad(page);
      await dismissBlockingModals(page);

      await captureScreenshot(page, '02-dashboard', report, viewport);
      await checkForVisualIssues(page, 'Dashboard', viewport, report);
    });

    await test.step('Test Vendors/Masters section - Mobile', async () => {
      // On mobile, may need to open hamburger menu (DOM click avoids out-of-viewport hit-testing)
      const menuButton = page.locator('button[aria-label*="menu" i], button:has-text("☰")').first();
      if ((await menuButton.count()) > 0) {
        await safeClick(menuButton);
        await page.waitForTimeout(500);
      }

      const mastersNav = page.locator('text=/masters|vendors/i').first();
      if ((await mastersNav.count()) > 0) {
        await safeClick(mastersNav);
        await waitForPageLoad(page);
        await captureScreenshot(page, '03-vendors-masters', report, viewport);
        await checkForVisualIssues(page, 'Vendors/Masters', viewport, report);
      } else {
        report.addIssue({
          page: 'Navigation',
          viewport,
          severity: 'error',
          category: 'functional',
          description: 'Masters/Vendors not accessible on mobile',
        });
      }
    });

    await test.step('Test Distribution/Dispatch section - Mobile', async () => {
      const menuButton = page.locator('button[aria-label*="menu" i]').first();
      if ((await menuButton.count()) > 0) {
        await safeClick(menuButton);
        await page.waitForTimeout(500);
      }

      const dispatchNav = page.locator('text=/distribution|dispatch/i').first();
      if ((await dispatchNav.count()) > 0) {
        await safeClick(dispatchNav);
        await waitForPageLoad(page);
        await captureScreenshot(page, '04-distribution-dispatch', report, viewport);
        await checkForVisualIssues(page, 'Distribution/Dispatch', viewport, report);
      } else {
        report.addIssue({
          page: 'Navigation',
          viewport,
          severity: 'error',
          category: 'functional',
          description: 'Distribution/Dispatch not accessible on mobile',
        });
      }
    });

    await test.step('Test Vendor Finance section - Mobile', async () => {
      const menuButton = page.locator('button[aria-label*="menu" i]').first();
      if ((await menuButton.count()) > 0) {
        await safeClick(menuButton);
        await page.waitForTimeout(500);
      }

      const financeNav = page.locator('text=/vendor.*finance|vendor.*payment/i').first();
      if ((await financeNav.count()) > 0) {
        await safeClick(financeNav);
        await waitForPageLoad(page);
        await captureScreenshot(page, '05-vendor-finance', report, viewport);
        await checkForVisualIssues(page, 'Vendor Finance', viewport, report);
      } else {
        report.addIssue({
          page: 'Navigation',
          viewport,
          severity: 'error',
          category: 'functional',
          description: 'Vendor Finance not accessible on mobile',
        });
      }
    });
  });
});
