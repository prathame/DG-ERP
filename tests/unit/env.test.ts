import { describe, it, expect, vi, afterEach } from 'vitest';

describe('assertCriticalEnv', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it('exits when DATABASE_URL missing', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { assertCriticalEnv } = await import('../../server/utils/env');
    assertCriticalEnv({ NODE_ENV: 'development', JWT_SECRET: 'x'.repeat(32) } as NodeJS.ProcessEnv);
    expect(exit).toHaveBeenCalledWith(1);
    expect(err.mock.calls.some(c => String(c[0]).includes('DATABASE_URL'))).toBe(true);
  });

  it('exits in production when ALLOWED_ORIGINS missing', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { assertCriticalEnv } = await import('../../server/utils/env');
    assertCriticalEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:StrongPass99@db.example.com/app',
      JWT_SECRET: 'x'.repeat(32),
      SUPER_ADMIN_EMAIL: 'a@b.com',
      SUPER_ADMIN_PASSWORD: 'longpassword1',
    } as NodeJS.ProcessEnv);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('exits in production on weak DB password', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { assertCriticalEnv } = await import('../../server/utils/env');
    assertCriticalEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:postgres@db.example.com/app',
      JWT_SECRET: 'x'.repeat(32),
      ALLOWED_ORIGINS: 'https://dhandho.app',
      SUPER_ADMIN_EMAIL: 'a@b.com',
      SUPER_ADMIN_PASSWORD: 'longpassword1',
    } as NodeJS.ProcessEnv);
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('passes a valid production config', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { assertCriticalEnv } = await import('../../server/utils/env');
    assertCriticalEnv({
      NODE_ENV: 'production',
      DATABASE_URL: 'postgresql://u:StrongPass99@db.example.com/app',
      JWT_SECRET: 'x'.repeat(32),
      ALLOWED_ORIGINS: 'https://dhandho.app',
      SUPER_ADMIN_EMAIL: 'a@b.com',
      SUPER_ADMIN_PASSWORD: 'longpassword1',
    } as NodeJS.ProcessEnv);
    expect(exit).not.toHaveBeenCalled();
  });

  it('allows rejectUnauthorized=false on Render managed Postgres', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const { assertCriticalEnv } = await import('../../server/utils/env');
    assertCriticalEnv({
      NODE_ENV: 'production',
      RENDER: 'true',
      DATABASE_URL: 'postgresql://u:StrongPass99@dpg-xxx.render.com/app',
      JWT_SECRET: 'x'.repeat(32),
      ALLOWED_ORIGINS: 'https://dhandho.app',
      SUPER_ADMIN_EMAIL: 'a@b.com',
      SUPER_ADMIN_PASSWORD: 'longpassword1',
      DATABASE_SSL_REJECT_UNAUTHORIZED: 'false',
    } as NodeJS.ProcessEnv);
    expect(exit).not.toHaveBeenCalled();
  });
});
