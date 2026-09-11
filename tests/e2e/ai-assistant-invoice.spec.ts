/**
 * Focused AI assistant UI: preview, confirm, cancel.
 * Network is mocked so Gemini is not required.
 */
import { test, expect } from '@playwright/test';

const QA = {
  slug: 'qa-srjewel',
  email: 'raj.mehta@srjewel.qa',
  password: 'QaTest@2026!',
};

const preview = {
  kind: 'invoice_only',
  stockNote: 'Invoice only — this does not dispatch stock or run Distribution.',
  customerName: 'Patel Agro',
  items: [
    {
      description: 'Cotton Seed',
      qty: 20,
      unit: 'Bag',
      rate: 100,
      gstPercent: 5,
      taxable: 2000,
      tax: 100,
      total: 2100,
      stock: 50,
      stockWarning: null,
    },
  ],
  subtotal: 2000,
  taxTotal: 100,
  grandTotal: 2100,
};

test.describe('AI assistant invoice confirmation', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/api/ai/assistant', async route => {
      const body = JSON.parse(route.request().postData() || '{}') as { message?: string };
      const msg = String(body.message || '').toLowerCase();
      if (msg.includes('baki') || msg.includes('balance')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            text: 'Patel Agro ka total outstanding ₹42,850 hai.',
            toolsUsed: ['search_customer', 'get_customer_balance'],
          }),
        });
      }
      if (msg.includes('stock')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ text: 'Cotton Seed ka stock 50 Bag hai.', toolsUsed: ['get_stock'] }),
        });
      }
      if (msg.includes('invoice bana do') && !msg.includes('cotton') && !msg.includes('20')) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ text: 'Kaunse items aur quantity add karni hai?', action: null }),
        });
      }
      if (msg.includes('patel') && (msg.includes('agency') || msg.includes('which'))) {
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            text: 'I found 2 customers matching Patel. Which one?',
          }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: 'I found Patel Agro and prepared the invoice.',
          pendingAction: {
            id: 'AIA-E2E',
            type: 'create_invoice',
            preview,
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
          toolsUsed: ['search_customer', 'search_product', 'get_stock', 'prepare_invoice'],
        }),
      });
    });
    await page.route('**/api/ai/actions/AIA-E2E/confirm', async route => {
      const n = Number(await page.evaluate(() => (window as unknown as { __aiConfirms?: number }).__aiConfirms || 0));
      await page.evaluate(v => {
        (window as unknown as { __aiConfirms?: number }).__aiConfirms = v;
      }, n + 1);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          text: 'Invoice INV/2026-27/0001 create ho gaya. Total ₹2,100.',
          invoice: { id: 'INV-E2E', invoiceNumber: 'INV/2026-27/0001', grandTotal: 2100 },
          created: n === 0,
        }),
      });
    });
    await page.route('**/api/ai/actions/AIA-E2E/cancel', route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ text: 'Cancelled. Invoice create nahi hua.', cancelled: true }),
      }),
    );

    await page.goto(`/${QA.slug}`, { waitUntil: 'domcontentloaded' });
    await page.locator('#login-email').fill(QA.email);
    await page.locator('#login-password').fill(QA.password);
    await page.locator('form button[type="submit"]').click();
    await expect(page.getByLabel('Open Dhandho AI')).toBeVisible({ timeout: 20_000 });
  });

  async function openChat(page: import('@playwright/test').Page) {
    await page.getByLabel('Open Dhandho AI').click();
    await expect(page.getByPlaceholder(/ask anything/i)).toBeVisible();
  }

  test('Ask balance', async ({ page }) => {
    await openChat(page);
    await page.getByPlaceholder(/ask anything/i).fill('Patel Agro ka kitna payment baki hai?');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/outstanding ₹42,850/i)).toBeVisible();
  });

  test('Ask stock', async ({ page }) => {
    await openChat(page);
    await page.getByPlaceholder(/ask anything/i).fill('Cotton seed ka stock kitna hai?');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/stock 50/i)).toBeVisible();
  });

  test('Create invoice through AI shows preview', async ({ page }) => {
    await openChat(page);
    await page.getByPlaceholder(/ask anything/i).fill('Patel Agro ko 20 bag cotton seed ka invoice bana do');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-ai-invoice-preview]')).toBeVisible();
    await expect(page.getByText('Confirm & Create')).toBeVisible();
    await expect(page.getByText(/Invoice only/i)).toBeVisible();
  });

  test('Missing invoice information', async ({ page }) => {
    await openChat(page);
    await page.getByPlaceholder(/ask anything/i).fill('Patel Agro ko invoice bana do');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/items aur quantity/i)).toBeVisible();
    await expect(page.locator('[data-ai-invoice-preview]')).toHaveCount(0);
  });

  test('Ambiguous customer', async ({ page }) => {
    await openChat(page);
    await page.getByPlaceholder(/ask anything/i).fill('Which Patel Agency invoice');
    await page.keyboard.press('Enter');
    await expect(page.getByText(/2 customers matching Patel/i)).toBeVisible();
  });

  test('Cancel invoice', async ({ page }) => {
    await openChat(page);
    await page.getByPlaceholder(/ask anything/i).fill('Patel Agro ko 20 bag cotton seed ka invoice bana do');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByText(/cancelled/i)).toBeVisible();
    await expect(page.getByText('Confirm & Create')).toHaveCount(0);
  });

  test('Confirm invoice', async ({ page }) => {
    await openChat(page);
    await page.getByPlaceholder(/ask anything/i).fill('Patel Agro ko 20 bag cotton seed ka invoice bana do');
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Confirm & Create' }).click();
    await expect(page.getByText(/INV\/2026-27\/0001/)).toBeVisible();
  });

  test('Double confirmation only sends once from the UI', async ({ page }) => {
    await openChat(page);
    await page.getByPlaceholder(/ask anything/i).fill('Patel Agro ko 20 bag cotton seed ka invoice bana do');
    await page.keyboard.press('Enter');
    const confirm = page.getByRole('button', { name: 'Confirm & Create' });
    await expect(confirm).toBeVisible();
    await Promise.all([confirm.click(), confirm.click({ trial: false }).catch(() => undefined)]);
    await expect(page.getByText(/INV\/2026-27\/0001/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Confirm & Create' })).toHaveCount(0);
    const n = await page.evaluate(() => (window as unknown as { __aiConfirms?: number }).__aiConfirms || 0);
    expect(n).toBe(1);
  });
});

test.describe('Unauthorized AI action', () => {
  test('vendor cannot open assistant API', async ({ request }) => {
    const r = await request.post('http://localhost:3001/api/ai/assistant', {
      data: { message: 'hello' },
    });
    expect([401, 403]).toContain(r.status());
  });
});
