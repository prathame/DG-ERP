import request from 'supertest';
import { createApp } from '../server/app';
import type { Express } from 'express';

let app: Express | null = null;

/** Lazily build the Express app once per process for supertest. */
export function getApp(): Express {
  if (!app) app = createApp() as Express;
  return app;
}

export function api() {
  return request(getApp());
}

export function authHeaders(token: string, tenantId?: string) {
  const h: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (tenantId) h['x-tenant-id'] = tenantId;
  return h;
}
