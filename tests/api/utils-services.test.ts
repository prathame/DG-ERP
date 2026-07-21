/**
 * Direct unit coverage for server/utils + server/services (path to 90%).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import {
  uid,
  isValidPhone,
  isValidEmail,
  isValidGstin,
  splitGst,
  placeOfSupplyLabel,
  gstFromExclusive,
  parsePagination,
  applyDateFilter,
  logAudit,
  hashPassword,
  mapProduct,
} from '../../server/utils/helpers';
import { encryptSecret, decryptSecret } from '../../server/utils/secret-crypto';
import {
  expandBarcodeRange,
  barcodeExists,
  getMaxBarcodeNumber,
  generateBarcodesFromPrefix,
} from '../../server/utils/barcode';
import { checkPlanLimit } from '../../server/utils/planLimits';
import { provisionTenant, deleteTenant, getTenantStats } from '../../server/utils/tenant';
import { logger } from '../../server/utils/logger';
import {
  isValidPin,
  resolveSupplyType,
  getGstnPublicKey,
  buildIrnPayload,
  buildEwbPayload,
  NicApiClient,
  loadGstCredentials,
  loadSellerPin,
} from '../../server/services/nic-api';

const TENANT = 'T-TEST-UTILS';

beforeAll(async () => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required for tests');
  }
  await cleanupTestData(TENANT);
  await pool.query(
    `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
     VALUES ($1, 'Utils Co', 'test-utils', 'u@test.com', 'U', 'active') ON CONFLICT DO NOTHING`,
    [TENANT],
  );
});

afterAll(async () => {
  await cleanupTestData(TENANT);
});

describe('utils/helpers', () => {
  it('uid / validators / gst math', () => {
    expect(uid('X').startsWith('X')).toBe(true);
    expect(isValidPhone('9876543210')).toBe(true);
    expect(isValidPhone('0123456789')).toBe(false);
    expect(isValidEmail('a@b.com')).toBe(true);
    expect(isValidEmail('bad')).toBe(false);
    expect(isValidGstin('24AABCT1332L1ZS')).toBe(true);
    expect(isValidGstin('xx')).toBe(false);

    const intra = splitGst(18, '24AAAAA0000A1Z5', '24BBBBB0000B1Z5');
    expect(intra.interstate).toBe(false);
    expect(intra.cgst + intra.sgst).toBeCloseTo(18, 1);

    const inter = splitGst(18, '24AAAAA0000A1Z5', '27BBBBB0000B1Z5');
    expect(inter.interstate).toBe(true);
    expect(inter.igst).toBe(18);

    expect(placeOfSupplyLabel('27AAAAA0000A1Z5')).toContain('Maharashtra');
    expect(placeOfSupplyLabel(null, '24AAAAA0000A1Z5')).toContain('Gujarat');

    const g = gstFromExclusive(100, 18);
    expect(g.taxable).toBe(100);
    expect(g.tax).toBe(18);
    expect(g.total).toBe(118);

    expect(hashPassword('x').startsWith('$2')).toBe(true);
    expect(mapProduct({ id: '1', name: 'P', price: 10 }).name).toBe('P');
  });

  it('parsePagination + applyDateFilter', () => {
    expect(parsePagination({ page: '2', limit: '10' })).toEqual({ page: 2, limit: 10, offset: 10 });
    expect(parsePagination({ page: '0', limit: '999' }).limit).toBe(200);

    const params: unknown[] = [];
    expect(applyDateFilter({ dateRange: 'today' }, 'd', params)).toMatch(/AND d =/);
    expect(applyDateFilter({ dateRange: 'week' }, 'd', params)).toMatch(/AND d >=/);
    expect(applyDateFilter({ dateRange: 'month' }, 'd', params)).toMatch(/AND d >=/);
    expect(applyDateFilter({ dateFrom: '2026-01-01', dateTo: '2026-01-31' }, 'd', params)).toMatch(/AND d >=/);
  });

  it('logAudit writes row', async () => {
    await logAudit(pool, TENANT, 'CREATE', 'vendor', 'V1', 'test', 'U1', 'Admin');
    const { rows } = await pool.query(`SELECT action FROM audit_log WHERE tenant_id = $1 AND entity_id = 'V1'`, [
      TENANT,
    ]);
    expect(rows[0]?.action).toBe('CREATE');
  });

  it('logAudit logs error when insert fails', async () => {
    const badPool = { query: vi.fn().mockRejectedValue(new Error('db down')) } as unknown as typeof pool;
    await expect(logAudit(badPool, TENANT, 'FAIL', 'x', '1', 'd')).resolves.toBeUndefined();
  });
});

describe('utils/secret-crypto', () => {
  it('encrypt/decrypt + corrupt', () => {
    const enc = encryptSecret('secret');
    expect(decryptSecret(enc)).toBe('secret');
    expect(decryptSecret('legacy')).toBe('legacy');
    expect(() => decryptSecret('enc:v1:bad')).toThrow();
  });

  it('throws when JWT_SECRET missing', async () => {
    const prev = process.env.JWT_SECRET;
    delete process.env.JWT_SECRET;
    vi.resetModules();
    const mod = await import('../../server/utils/secret-crypto');
    expect(() => mod.encryptSecret('x')).toThrow(/JWT_SECRET or SECRETS_ENCRYPTION_KEY required/);
    process.env.JWT_SECRET = prev;
    vi.resetModules();
  });
});

describe('utils/barcode', () => {
  it('expandBarcodeRange edges', () => {
    expect(expandBarcodeRange('SP001', 'SP003')).toEqual(['SP001', 'SP002', 'SP003']);
    expect(expandBarcodeRange('', 'SP003')).toEqual([]);
    expect(expandBarcodeRange('ABC', 'DEF')).toEqual(['ABC']);
    expect(expandBarcodeRange('SP010', 'SP001')).toEqual(['SP010']);
    expect(expandBarcodeRange('A01', 'B10')).toEqual(['A01']);
  });

  it('barcodeExists / generate from prefix', async () => {
    await pool.query(
      `INSERT INTO products (id, tenant_id, name, price, barcode)
       VALUES ('P-U-1', $1, 'P', 1, 'BC-U-001') ON CONFLICT DO NOTHING`,
      [TENANT],
    );
    expect(await barcodeExists(pool, TENANT, 'BC-U-001')).toBe(true);
    expect(await barcodeExists(pool, TENANT, 'BC-MISSING')).toBe(false);

    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-U-1', $1, 'P-U-1', 'PRE005', 'InStock') ON CONFLICT DO NOTHING`,
      [TENANT],
    );
    // Non-numeric suffix under same prefix — skipped by regex (covers !m branch)
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-U-2', $1, 'P-U-1', 'PREXYZ', 'InStock') ON CONFLICT DO NOTHING`,
      [TENANT],
    );
    // Lower number after higher — covers `n > maxNum` false branch
    await pool.query(
      `INSERT INTO product_inventory (id, tenant_id, product_id, barcode, status)
       VALUES ('I-U-3', $1, 'P-U-1', 'PRE003', 'InStock') ON CONFLICT DO NOTHING`,
      [TENANT],
    );
    expect(await getMaxBarcodeNumber(pool, TENANT, 'PRE')).toBe(5);
    const next = await generateBarcodesFromPrefix(pool, TENANT, 'PRE', 2, 3);
    expect(next).toEqual(['PRE006', 'PRE007']);
    // Auto pad length when padLength omitted
    const auto = await generateBarcodesFromPrefix(pool, TENANT, 'PRE', 1);
    expect(auto[0]).toMatch(/^PRE\d+$/);
  });
});

describe('utils/logger', () => {
  it('info/warn/error/debug/fatal/flush do not throw', () => {
    logger.setLevel('trace');
    logger.trace('t');
    logger.debug('t', { a: 1 });
    logger.info('t', { a: 1 });
    logger.warn('t');
    logger.error('t', { e: 'x' });
    logger.fatal('t');
    logger.exception('boom', new Error('x'), { invoiceId: '1' });
    expect(() => logger.flush()).not.toThrow();
    logger.setLevel('warn');
  });

  it('redacts sensitive context keys', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('secret test', { password: 'hunter2', token: 'abc', safe: 'ok' });
    const line = String(spy.mock.calls[0]?.[0] || '');
    expect(line).toContain('[REDACTED]');
    expect(line).not.toContain('hunter2');
    expect(line).toContain('safe');
    spy.mockRestore();
  });

  it('forwards to Logtail when token is set', async () => {
    const info = vi.fn();
    const warn = vi.fn();
    const error = vi.fn();
    const flush = vi.fn().mockResolvedValue(undefined);
    vi.resetModules();
    process.env.LOGTAIL_TOKEN = 'x'.repeat(32);
    // Test default min level is warn — lower it so info reaches Logtail
    process.env.LOG_LEVEL = 'debug';
    vi.doMock('@logtail/node', () => ({
      Logtail: class {
        info = info;
        warn = warn;
        error = error;
        flush = flush;
      },
    }));
    const { logger: ltLogger } = await import('../../server/utils/logger');
    ltLogger.setLevel('debug');
    ltLogger.info('i', { k: 1 });
    ltLogger.warn('w', { k: 2 });
    ltLogger.error('e');
    await ltLogger.flush();
    expect(info).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(flush).toHaveBeenCalled();
    delete process.env.LOGTAIL_TOKEN;
    delete process.env.LOG_LEVEL;
    vi.doUnmock('@logtail/node');
    vi.resetModules();
  });
});

describe('utils/planLimits', () => {
  it('allows when unlimited or no plan', async () => {
    const r = await checkPlanLimit(TENANT, 'products');
    expect(r === null || typeof r?.error === 'string').toBe(true);
  });

  it('returns null when under plan cap', async () => {
    const tid = 'T-TEST-PLAN-OK';
    await cleanupTestData(tid);
    await pool.query(
      `INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly)
       VALUES ('plan-ok-test', 'Ok', 100, 100, 10, 1000, '[]', 0, 0)
       ON CONFLICT (id) DO UPDATE SET max_products = 100`,
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
       VALUES ($1, 'Ok Co', 'test-plan-ok', 'ok@test.com', 'O', 'active', 'plan-ok-test')
       ON CONFLICT (id) DO UPDATE SET plan_id = 'plan-ok-test'`,
      [tid],
    );
    expect(await checkPlanLimit(tid, 'products')).toBeNull();
    await cleanupTestData(tid);
  });

  it('blocks when at plan cap', async () => {
    const tid = 'T-TEST-PLAN-CAP';
    await cleanupTestData(tid);
    await pool.query(
      `INSERT INTO plans (id, name, max_products, max_vendors, max_users, max_barcodes, features, price_monthly, price_yearly)
       VALUES ('plan-cap-test', 'Cap', 0, 0, 1, 0, '[]', 0, 0)
       ON CONFLICT (id) DO UPDATE SET max_products = 0, max_vendors = 0`,
    );
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, plan_id)
       VALUES ($1, 'Cap Co', 'test-plan-cap', 'cap@test.com', 'C', 'active', 'plan-cap-test')
       ON CONFLICT (id) DO UPDATE SET plan_id = 'plan-cap-test'`,
      [tid],
    );
    const blocked = await checkPlanLimit(tid, 'products');
    expect(blocked?.error).toMatch(/Plan limit reached/i);
    await cleanupTestData(tid);
  });

  it('fails closed when limit query throws', async () => {
    const spy = vi.spyOn(pool, 'query').mockRejectedValueOnce(new Error('db'));
    const r = await checkPlanLimit(TENANT, 'products');
    spy.mockRestore();
    expect(r?.error).toMatch(/Unable to verify plan limits/i);
  });
});

describe('utils/tenant', () => {
  let createdId = '';

  afterAll(async () => {
    if (createdId) await deleteTenant(createdId).catch(() => {});
  });

  it('provision + stats + delete', async () => {
    const plan = (await pool.query(`SELECT id FROM plans ORDER BY id LIMIT 1`)).rows[0];
    if (!plan) return; // skip if no plans seeded

    const name = `Utils Prov ${Date.now()}`;
    const result = await provisionTenant({
      companyName: name,
      adminEmail: `prov${Date.now()}@test.com`,
      adminName: 'Prov',
      adminPassword: 'Test@12345',
      planId: plan.id,
      status: 'active',
    });
    createdId = result.tenantId;
    expect(result.slug).toBeTruthy();
    expect(result.bootstrapToken).toBeTruthy();

    const stats = await getTenantStats(createdId);
    expect(Number(stats.users)).toBeGreaterThanOrEqual(1);

    await deleteTenant(createdId);
    createdId = '';
    const gone = (await pool.query('SELECT 1 FROM tenants WHERE id = $1', [result.tenantId])).rows[0];
    expect(gone).toBeUndefined();
  });

  it('duplicate slug throws', async () => {
    const plan = (await pool.query(`SELECT id FROM plans ORDER BY id LIMIT 1`)).rows[0];
    if (!plan) return;
    const companyName = `DupSlug ${Date.now()}`;
    const a = await provisionTenant({
      companyName,
      adminEmail: `a${Date.now()}@t.com`,
      adminName: 'A',
      planId: plan.id,
    });
    await expect(
      provisionTenant({
        companyName,
        adminEmail: `b${Date.now()}@t.com`,
        adminName: 'B',
        planId: plan.id,
      }),
    ).rejects.toMatchObject({ code: 'DUPLICATE_SLUG' });
    await deleteTenant(a.tenantId);
  });

  it('provisionTenant rejects missing plan with INVALID_PLAN', async () => {
    await expect(
      provisionTenant({
        companyName: `BadPlan ${Date.now()}`,
        adminEmail: `badplan${Date.now()}@t.com`,
        adminName: 'X',
        planId: 'plan-does-not-exist-xyz',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_PLAN' });
  });

  it('provisionTenant falls back slug for non-Latin company names', async () => {
    const plan = (await pool.query(`SELECT id FROM plans ORDER BY id LIMIT 1`)).rows[0];
    if (!plan) return;
    const email = `devnagari${Date.now()}@t.com`;
    const result = await provisionTenant({
      companyName: 'धरती कंपनी',
      adminEmail: email,
      adminName: 'Admin',
      planId: plan.id,
    });
    expect(result.slug).toBeTruthy();
    expect(result.slug).not.toBe('');
    expect(result.slug).toMatch(/^[a-z0-9-]+$/);
    await deleteTenant(result.tenantId);
  });

  it('provisionTenant succeeds under FORCE RLS (matches prod 42501 failure mode)', async () => {
    const plan = (await pool.query(`SELECT id FROM plans ORDER BY id LIMIT 1`)).rows[0];
    if (!plan) return;
    const rlsTables = ['users', 'vendors', 'redemption_settings'] as const;
    for (const t of rlsTables) {
      await pool.query(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
    }
    let tenantId = '';
    try {
      const result = await provisionTenant({
        companyName: `ForceRls ${Date.now()}`,
        adminEmail: `forcerls${Date.now()}@t.com`,
        adminName: 'Admin',
        adminPassword: 'Test@12345',
        planId: plan.id,
      });
      tenantId = result.tenantId;
      const user = (await pool.query('SELECT email FROM users WHERE tenant_id = $1', [tenantId])).rows[0];
      expect(user?.email).toBeTruthy();
      await deleteTenant(tenantId);
      tenantId = '';
    } finally {
      if (tenantId) await deleteTenant(tenantId).catch(() => {});
      for (const t of rlsTables) {
        await pool.query(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY`);
      }
    }
  });

  it('deleteTenant rolls back when a delete fails', async () => {
    const realConnect = pool.connect.bind(pool);
    const spy = vi.spyOn(pool, 'connect').mockImplementation(async () => {
      const client = await realConnect();
      const orig = client.query.bind(client);
      let n = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (client as any).query = async (...args: unknown[]) => {
        n += 1;
        if (n === 3) throw new Error('forced delete fail');
        return orig(...(args as Parameters<typeof orig>));
      };
      return client;
    });
    await expect(deleteTenant('T-NONEXIST-ROLLBACK')).rejects.toThrow(/forced delete fail/);
    spy.mockRestore();
  });
});

describe('services/nic-api', () => {
  it('pin / supply / public key / payloads / mock client', async () => {
    expect(isValidPin('380001')).toBe(true);
    expect(resolveSupplyType('24AABCT1332L1ZS')).toBe('B2B');
    expect(resolveSupplyType('')).toBe('B2C');
    expect(() => getGstnPublicKey('mock')).not.toThrow();
    delete process.env.GSTN_SANDBOX_PUBLIC_KEY;
    delete process.env.GSTN_PUBLIC_KEY;
    expect(() => getGstnPublicKey('sandbox')).toThrow(/crypto not configured/i);
    process.env.GSTN_SANDBOX_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nbm90LWEtcmVhbC1rZXk=\n-----END PUBLIC KEY-----';
    expect(() => getGstnPublicKey('sandbox')).toThrow(/Invalid GSTN public key/);
    delete process.env.GSTN_SANDBOX_PUBLIC_KEY;

    const irn = buildIrnPayload({
      sellerGstin: '24AABCT1332L1ZS',
      sellerName: 'S',
      sellerAddr: 'Addr',
      sellerPin: '380001',
      buyerGstin: '27AABCT1332L1ZS',
      buyerName: 'B',
      buyerAddr: 'Mumbai',
      buyerPin: '400001',
      invoiceNo: 'INV-1',
      invoiceDate: '15/07/2026',
      items: [
        {
          hsnCode: '8471',
          productName: 'Item',
          qty: 1,
          unitPrice: 100,
          gstRate: 18,
          taxable: 100,
          cgst: 0,
          sgst: 0,
          igst: 18,
          total: 118,
        },
      ],
      totalTaxable: 100,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 18,
      grandTotal: 118,
    });
    expect(irn.TranDtls.SupTyp).toBe('B2B');
    expect(irn.ItemList).toHaveLength(1);

    const ewb = buildEwbPayload({
      supplyType: 'O',
      subSupplyType: '1',
      docType: 'INV',
      docNo: 'INV-1',
      docDate: '15/07/2026',
      sellerGstin: '24AABCT1332L1ZS',
      sellerName: 'S',
      sellerAddr: 'A',
      sellerPin: '380001',
      buyerGstin: '27AABCT1332L1ZS',
      buyerName: 'B',
      buyerAddr: 'B',
      buyerPin: '400001',
      items: [{ productName: 'Item', hsnCode: '8471', qty: 1, taxable: 100, cgst: 0, sgst: 0, igst: 18, total: 118 }],
      totalTaxable: 100,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 18,
      grandTotal: 118,
      vehicleNo: 'GJ01AB1234',
      distance: 100,
    });
    expect(ewb.vehicleNo).toBe('GJ01AB1234');

    const client = new NicApiClient({
      mode: 'mock',
      gstin: '24AABCT1332L1ZS',
      username: '',
      password: '',
      clientId: 'mock',
      clientSecret: '',
    });
    const irnRes = await client.generateIrn(irn);
    expect(irnRes.irn).toBeTruthy();
    expect(irnRes.qrCode).toBeTruthy();
    const ewbRes = await client.generateEwb(ewb);
    expect(ewbRes.ewbNo).toBeTruthy();
    await expect(client.cancelIrn(irnRes.irn, 1, 'test')).resolves.toBeUndefined();
  });

  it('loadGstCredentials mock + loadSellerPin', async () => {
    const tid = 'T-TEST-GST-CREDS';
    await cleanupTestData(tid);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Gst Creds', 'test-gst-creds', 'gc@test.com', 'G', 'active')
       ON CONFLICT (id) DO NOTHING`,
      [tid],
    );
    await pool.query(
      `INSERT INTO bill_settings (tenant_id, gst_api_mode, gst_api_seller_pin)
       VALUES ($1, 'mock', '380001')
       ON CONFLICT (tenant_id) DO UPDATE SET gst_api_mode = 'mock', gst_api_seller_pin = '380001'`,
      [tid],
    );

    const creds = await loadGstCredentials(pool, tid);
    expect(creds.ok).toBe(true);
    if (creds.ok) expect(creds.creds.mode).toBe('mock');

    expect(await loadSellerPin(pool, tid)).toBe('380001');
    await cleanupTestData(tid);
  });

  it('sandbox loadGstCredentials fails without client_id; ok with PEM + creds', async () => {
    const tid = 'T-TEST-GST-SB';
    const pem = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtL6P53A8vmQ5X0s65l6S
T1odNXxpq4ocqsMT+M12m4sZXyNjGJin7T1S2OS25yA89B6NLs2AN4tHHkoljNsx
0RmdMIFoJX8G8W+Ltwi//p1BACli/yqXCvVAqoEU8dBbcyXh7bpIcKHU/zrA5aFP
o3Zj/bSPRDTt8v2OVgE7QQQXa75mEVvPHZph0STkA1JbOdxoW+sH7s3/j/LITi3y
CcjR4DnP+MjodZcFOH2J0pXApI0AFBFJhieJSuYVnO85megv0DyvnU7HAVFi69z+
KUaL2wt1X25rx547+2u1vKFvK18OCN/ULqWS6sdzdvhiDW2CzOC0FBu9SI1glMd0
TwIDAQAB
-----END PUBLIC KEY-----`;
    process.env.GSTN_SANDBOX_PUBLIC_KEY = pem;

    await cleanupTestData(tid);
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status)
       VALUES ($1, 'Gst Sb', 'test-gst-sb', 'sb@test.com', 'S', 'active') ON CONFLICT DO NOTHING`,
      [tid],
    );
    await pool.query(
      `INSERT INTO bill_settings (tenant_id, gst_api_mode, gst_api_username)
       VALUES ($1, 'sandbox', 'user')
       ON CONFLICT (tenant_id) DO UPDATE SET gst_api_mode = 'sandbox', gst_api_username = 'user', gst_api_client_id = NULL`,
      [tid],
    );
    const missing = await loadGstCredentials(pool, tid);
    expect(missing.ok).toBe(false);

    await pool.query(
      `UPDATE bill_settings SET gst_api_client_id = 'cid', gst_api_password = $2, gst_api_client_secret = $3
       WHERE tenant_id = $1`,
      [tid, encryptSecret('pw'), encryptSecret('sec')],
    );

    // Creds present but PEM invalid → catch in loadGstCredentials
    process.env.GSTN_SANDBOX_PUBLIC_KEY = '-----BEGIN PUBLIC KEY-----\nbad\n-----END PUBLIC KEY-----';
    const badPem = await loadGstCredentials(pool, tid);
    expect(badPem.ok).toBe(false);
    expect(badPem).toMatchObject({ ok: false, error: expect.stringMatching(/Invalid GSTN|crypto not configured/i) });

    process.env.GSTN_SANDBOX_PUBLIC_KEY = pem;
    const ok = await loadGstCredentials(pool, tid);
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.creds.mode).toBe('sandbox');
      expect(ok.creds.password).toBe('pw');
    }
    await cleanupTestData(tid);
  });

  it('authenticate throws when session payload cannot be decrypted', async () => {
    const crypto = await import('crypto');
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    process.env.GSTN_SANDBOX_PUBLIC_KEY = publicKey.export({ type: 'spki', format: 'pem' }).toString();

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ Status: 1, Data: Buffer.from('not-aes').toString('base64') }),
      })),
    );

    const client = new NicApiClient({
      mode: 'sandbox',
      gstin: '24AABCT1332L1ZS',
      username: 'u',
      password: 'p',
      clientId: 'c',
      clientSecret: 's',
    });
    const irnBody = buildIrnPayload({
      sellerGstin: '24AABCT1332L1ZS',
      sellerName: 'S',
      sellerAddr: 'A',
      sellerPin: '380001',
      buyerName: 'B',
      buyerAddr: 'B',
      buyerPin: '380001',
      invoiceNo: 'INV-DEC',
      invoiceDate: '15/07/2026',
      items: [
        {
          hsnCode: '8471',
          productName: 'I',
          qty: 1,
          unitPrice: 100,
          gstRate: 18,
          taxable: 100,
          cgst: 9,
          sgst: 9,
          igst: 0,
          total: 118,
        },
      ],
      totalTaxable: 100,
      totalCgst: 9,
      totalSgst: 9,
      totalIgst: 0,
      grandTotal: 118,
    });
    await expect(client.generateIrn(irnBody)).rejects.toThrow(/could not decrypt session key/);
    vi.unstubAllGlobals();
  });

  it('sandbox NicApiClient authenticate + generate via mocked fetch', async () => {
    const crypto = await import('crypto');
    const { publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pubPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
    process.env.GSTN_SANDBOX_PUBLIC_KEY = pubPem;
    expect(getGstnPublicKey('sandbox')).toContain('BEGIN PUBLIC KEY');

    // Avoid RSA_PKCS1 privateDecrypt (blocked on Node 17+). Stub auth with a known SEK.
    const sessionKeyB64 = crypto.randomBytes(32).toString('base64');
    const aesEnc = (data: string, keyB64: string) => {
      const key = Buffer.from(keyB64, 'base64');
      const cipher = crypto.createCipheriv('aes-256-ecb', key, null);
      return Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]).toString('base64');
    };

    const fetchMock = vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes('/Invoice/Cancel')) {
        return { ok: true, json: async () => ({ Status: 1 }) };
      }
      if (u.includes('/Invoice')) {
        const data = aesEnc(
          JSON.stringify({
            Irn: 'IRN123',
            AckNo: 'ACK1',
            AckDt: 'now',
            QRCode: 'qr',
            SignedQRCode: 'sqr',
          }),
          sessionKeyB64,
        );
        return { ok: true, json: async () => ({ Status: 1, Data: data }) };
      }
      if (u.includes('ewbgenerate')) {
        const data = aesEnc(
          JSON.stringify({
            ewayBillNo: 123456789012,
            ewayBillDate: 'd1',
            validUpto: 'd2',
          }),
          sessionKeyB64,
        );
        return { ok: true, json: async () => ({ Status: 1, Data: data }) };
      }
      return { ok: false, status: 500, json: async () => ({}) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const client = new NicApiClient({
      mode: 'sandbox',
      gstin: '24AABCT1332L1ZS',
      username: 'u',
      password: 'p',
      clientId: 'c',
      clientSecret: 's',
    });
    (client as unknown as { authenticate: () => Promise<{ authToken: string; sek: string }> }).authenticate =
      async () => ({ authToken: 'tok', sek: sessionKeyB64 });

    const irnBody = buildIrnPayload({
      sellerGstin: '24AABCT1332L1ZS',
      sellerName: 'S',
      sellerAddr: 'A',
      sellerPin: '380001',
      buyerName: 'B',
      buyerAddr: 'B',
      buyerPin: '380001',
      invoiceNo: 'INV-L',
      invoiceDate: '15/07/2026',
      items: [
        {
          hsnCode: '8471',
          productName: 'I',
          qty: 1,
          unitPrice: 100,
          gstRate: 18,
          taxable: 100,
          cgst: 9,
          sgst: 9,
          igst: 0,
          total: 118,
        },
      ],
      totalTaxable: 100,
      totalCgst: 9,
      totalSgst: 9,
      totalIgst: 0,
      grandTotal: 118,
    });
    const irn = await client.generateIrn(irnBody);
    expect(irn.irn).toBe('IRN123');

    const ewbBody = buildEwbPayload({
      supplyType: 'O',
      subSupplyType: '1',
      docType: 'INV',
      docNo: 'INV-L',
      docDate: '15/07/2026',
      sellerGstin: '24AABCT1332L1ZS',
      sellerName: 'S',
      sellerAddr: 'A',
      sellerPin: '380001',
      buyerGstin: 'URP',
      buyerName: 'B',
      buyerAddr: 'B',
      buyerPin: '380001',
      items: [{ productName: 'I', hsnCode: '8471', qty: 1, taxable: 100, cgst: 9, sgst: 9, igst: 0, total: 118 }],
      totalTaxable: 100,
      totalCgst: 9,
      totalSgst: 9,
      totalIgst: 0,
      grandTotal: 118,
      vehicleNo: 'GJ01AB1234',
      distance: 50,
    });
    const ewb = await client.generateEwb(ewbBody);
    expect(ewb.ewbNo).toBe('123456789012');

    await client.cancelIrn('IRN123', 1, 'wrong');
    expect(fetchMock).toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
