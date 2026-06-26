import { describe, it, expect } from 'vitest';
import { pool } from '../helpers';

describe('Plans', () => {
  it('should have 4 plans seeded', async () => {
    const { rows } = await pool.query('SELECT id, name FROM plans ORDER BY price_monthly');
    expect(rows.length).toBeGreaterThanOrEqual(4);
    const names = rows.map((r: Record<string, unknown>) => r.name);
    expect(names).toContain('Trial');
    expect(names).toContain('Basic');
    expect(names).toContain('Standard');
    expect(names).toContain('Professional');
  });

  it('Trial should be free', async () => {
    const { rows } = await pool.query(
      'SELECT price_monthly FROM plans WHERE id = $1',
      ['TRIAL']
    );
    expect(Number(rows[0].price_monthly)).toBe(0);
  });

  it('Basic should be 499/month', async () => {
    const { rows } = await pool.query(
      'SELECT price_monthly FROM plans WHERE id = $1',
      ['BASIC']
    );
    expect(Number(rows[0].price_monthly)).toBe(499);
  });

  it('Standard should be 999/month', async () => {
    const { rows } = await pool.query(
      'SELECT price_monthly FROM plans WHERE id = $1',
      ['STANDARD']
    );
    expect(Number(rows[0].price_monthly)).toBe(999);
  });

  it('Professional should be 1999/month', async () => {
    const { rows } = await pool.query(
      'SELECT price_monthly FROM plans WHERE id = $1',
      ['PROFESSIONAL']
    );
    expect(Number(rows[0].price_monthly)).toBe(1999);
  });

  it('Professional should have all features enabled', async () => {
    const { rows } = await pool.query(
      'SELECT features FROM plans WHERE id = $1',
      ['PROFESSIONAL']
    );
    const features = rows[0].features;
    expect(features.warranty).toBe(true);
    expect(features.barcodeSystem).toBe(true);
    expect(features.chatbot).toBe(true);
    expect(features.vendorPortal).toBe(true);
    expect(features.rewards).toBe(true);
    expect(features.finance).toBe(true);
  });

  it('Basic should have barcode disabled', async () => {
    const { rows } = await pool.query(
      'SELECT features FROM plans WHERE id = $1',
      ['BASIC']
    );
    expect(rows[0].features.barcodeSystem).toBe(false);
  });

  it('Standard should have barcode enabled but warranty disabled', async () => {
    const { rows } = await pool.query(
      'SELECT features FROM plans WHERE id = $1',
      ['STANDARD']
    );
    expect(rows[0].features.barcodeSystem).toBe(true);
    expect(rows[0].features.warranty).toBe(false);
  });

  it('Trial should have unlimited products', async () => {
    const { rows } = await pool.query(
      'SELECT max_products FROM plans WHERE id = $1',
      ['TRIAL']
    );
    expect(rows[0].max_products).toBe(-1); // -1 means unlimited
  });

  it('Basic should limit products to 50', async () => {
    const { rows } = await pool.query(
      'SELECT max_products FROM plans WHERE id = $1',
      ['BASIC']
    );
    expect(rows[0].max_products).toBe(50);
  });

  it('Basic should limit vendors to 5', async () => {
    const { rows } = await pool.query(
      'SELECT max_vendors FROM plans WHERE id = $1',
      ['BASIC']
    );
    expect(rows[0].max_vendors).toBe(5);
  });

  it('Standard should limit users to 10', async () => {
    const { rows } = await pool.query(
      'SELECT max_users FROM plans WHERE id = $1',
      ['STANDARD']
    );
    expect(rows[0].max_users).toBe(10);
  });

  it('all plans should be active', async () => {
    const { rows } = await pool.query('SELECT id, is_active FROM plans');
    for (const row of rows) {
      expect(row.is_active).toBe(true);
    }
  });

  it('yearly price should be less than 12x monthly', async () => {
    const { rows } = await pool.query(
      'SELECT price_monthly, price_yearly FROM plans WHERE id = $1',
      ['BASIC']
    );
    const monthly = Number(rows[0].price_monthly);
    const yearly = Number(rows[0].price_yearly);
    expect(yearly).toBeLessThan(monthly * 12);
  });
});
