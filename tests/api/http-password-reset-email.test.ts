import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { api } from '../http';
import { pool, cleanupTestData } from '../helpers';
import { encryptSecret } from '../../server/utils/secret-crypto';

const sendMail = vi.hoisted(() => vi.fn().mockResolvedValue({ messageId: 'reset-test' }));
vi.mock('nodemailer', () => ({
  default: { createTransport: vi.fn(() => ({ sendMail })) },
}));

const T = 'T-RESET-EMAIL';
const U = 'U-RESET-EMAIL';

beforeAll(async () => {
  await cleanupTestData(T);
  const bcrypt = await import('bcrypt');
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
     VALUES ($1, 'Reset Email Corp', 'reset-email-corp', 'reset@example.com', 'Admin', 'active', 'TRIAL')`,
    [T],
  );
  await pool.query(
    `INSERT INTO users (id, tenant_id, email, password_hash, name, role)
     VALUES ($1, $2, 'reset@example.com', $3, 'Reset User', 'Admin')`,
    [U, T, await bcrypt.hash('OldPassword123!', 10)],
  );
  await pool.query(
    `INSERT INTO email_settings (tenant_id, smtp_user, smtp_password, from_email, from_name)
     VALUES ($1, 'smtp@example.com', $2, 'noreply@example.com', 'Reset Email Corp')`,
    [T, encryptSecret('smtp-password')],
  );
});

afterAll(async () => cleanupTestData(T));

describe('POST /api/auth/forgot-password email delivery', () => {
  it('emails the reset link without returning the token', async () => {
    const response = await api()
      .post('/api/auth/forgot-password')
      .send({ email: 'reset@example.com', slug: 'reset-email-corp' });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true, message: 'If this email exists, a reset link has been generated' });
    expect(sendMail).toHaveBeenCalledOnce();
    const mail = sendMail.mock.calls[0][0] as { to: string; text: string };
    expect(mail.to).toBe('reset@example.com');
    expect(mail.text).toMatch(/reset-email-corp\/reset-password\?token=[a-f0-9]{64}/);
    expect(JSON.stringify(response.body)).not.toMatch(/[a-f0-9]{64}/);

    const token = (await pool.query('SELECT expires_at FROM password_reset_tokens WHERE tenant_id = $1', [T])).rows[0];
    expect(new Date(token.expires_at).getTime()).toBeGreaterThan(Date.now() + 29 * 60 * 1000);
  });
});
