import { describe, it, expect } from 'vitest';
import {
  databaseHostname,
  formatDbConnectError,
  isManagedPostgresHost,
  resolvePoolSsl,
} from '../../server/utils/databaseUrl';

describe('databaseUrl helpers', () => {
  it('parses Neon hostnames as managed', () => {
    const url = 'postgresql://u:p@ep-cool-name-123.us-east-2.aws.neon.tech/neondb?sslmode=require';
    expect(databaseHostname(url)).toBe('ep-cool-name-123.us-east-2.aws.neon.tech');
    expect(isManagedPostgresHost(url)).toBe(true);
  });

  it('treats Render internal dpg hosts as managed', () => {
    expect(isManagedPostgresHost('postgresql://u:p@dpg-d8ufi9e7r5hc73fe69ug-a/db')).toBe(true);
  });

  it('does not treat arbitrary hosts as managed', () => {
    expect(isManagedPostgresHost('postgresql://u:Strong@db.example.com/app')).toBe(false);
  });

  it('enables TLS for Neon with rejectUnauthorized false by default', () => {
    const d = resolvePoolSsl(
      { NODE_ENV: 'production', DATABASE_SSL: 'true' } as NodeJS.ProcessEnv,
      'postgresql://u:p@ep-x.us-east-2.aws.neon.tech/neondb?sslmode=require',
    );
    expect(d.useSsl).toBe(true);
    expect(d.managedHost).toBe(true);
    expect(d.rejectUnauthorized).toBe(false);
  });

  it('keeps strict TLS for custom hosts unless opted out', () => {
    const d = resolvePoolSsl(
      { NODE_ENV: 'production', DATABASE_SSL: 'true' } as NodeJS.ProcessEnv,
      'postgresql://u:StrongPass99@db.example.com/app',
    );
    expect(d.useSsl).toBe(true);
    expect(d.rejectUnauthorized).toBe(true);
  });

  it('formats ENOTFOUND with Neon guidance', () => {
    const msg = formatDbConnectError(new Error('getaddrinfo ENOTFOUND dpg-dead'), 'postgresql://u:p@dpg-dead/db');
    expect(msg).toMatch(/Neon/i);
    expect(msg).toMatch(/dpg-dead/);
  });
});
