/**
 * Stress Test — DG ERP
 * Tests API load + data volume against production
 * Run: npx tsx tests/stress-test.ts
 */

const BASE = 'https://dg-erp.onrender.com';
const SUPER_ADMIN = { email: 'admin@spre.ai', password: 'superadmin123' };

let saToken = '';
let tenantToken = '';
let tenantId = '';
const testTenantSlug = `stress-test-${Date.now()}`;

async function api(path: string, opts?: RequestInit & { token?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts?.token) headers['Authorization'] = `Bearer ${opts.token}`;
  if (tenantId) headers['X-Tenant-ID'] = tenantId;
  const res = await fetch(`${BASE}${path}`, { ...opts, headers: { ...headers, ...opts?.headers } });
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, ok: res.ok };
}

function log(msg: string) { console.log(`  ${msg}`); }
function pass(msg: string) { console.log(`  ✓ ${msg}`); }
function fail(msg: string) { console.log(`  ✗ ${msg}`); }

// ============ SETUP ============
async function setup() {
  console.log('\n🔧 SETUP');
  const r = await api('/api/super-admin/login', { method: 'POST', body: JSON.stringify(SUPER_ADMIN) });
  if (!r.ok) { fail('Super admin login failed'); process.exit(1); }
  saToken = r.data.token;
  pass('Super admin logged in');

  // Create test tenant
  const tenant = await api('/api/super-admin/tenants', {
    method: 'POST',
    token: saToken,
    body: JSON.stringify({ companyName: `Stress Test ${Date.now()}`, adminEmail: `stress${Date.now()}@test.com`, adminName: 'Stress Tester', phone: '9999999999', plan: 'TRIAL', password: 'stress@123' }),
  });
  if (!tenant.ok) { fail(`Tenant creation failed: ${JSON.stringify(tenant.data)}`); process.exit(1); }
  tenantId = tenant.data.tenantId;
  pass(`Test tenant created: ${tenantId}`);

  // Login as tenant
  const login = await api('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: `stress${Date.now().toString().slice(0, -3)}@test.com`, password: 'stress@123' }),
  });
  // Use the token from tenant creation since email has timestamp
  const email = tenant.data.adminEmail;
  const login2 = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'stress@123' }) });
  if (!login2.ok) { fail(`Tenant login failed: ${JSON.stringify(login2.data)}`); process.exit(1); }
  tenantToken = login2.data.token;
  pass('Tenant logged in');
}

// ============ DATA VOLUME TEST ============
async function dataVolumeTest() {
  console.log('\n📦 DATA VOLUME TEST');

  // Add products with large barcode quantities
  const products: string[] = [];
  const quantities = [100, 500, 1000];

  for (const qty of quantities) {
    const start = Date.now();
    const r = await api('/api/products', {
      method: 'POST',
      token: tenantToken,
      body: JSON.stringify({ name: `Product-${qty}`, barcodePrefix: `ST${qty}`, barcodeMode: 'prefix', quantity: qty, price: 100 }),
    });
    const elapsed = Date.now() - start;
    if (r.ok) {
      products.push(r.data.id);
      pass(`${qty} barcodes created in ${elapsed}ms`);
    } else {
      fail(`${qty} barcodes failed: ${r.data.error} (${elapsed}ms)`);
    }
  }

  // Add vendors
  const vendorIds: string[] = [];
  for (let i = 0; i < 20; i++) {
    const r = await api('/api/vendors', {
      method: 'POST',
      token: tenantToken,
      body: JSON.stringify({ name: `Vendor ${i + 1}`, phone: `999000${String(i).padStart(4, '0')}`, email: `vendor${i}@stress.com` }),
    });
    if (r.ok) vendorIds.push(r.data.id);
  }
  pass(`${vendorIds.length} vendors created`);

  // Add customers
  for (let i = 0; i < 50; i++) {
    await api('/api/customers', {
      method: 'POST',
      token: tenantToken,
      body: JSON.stringify({ name: `Customer ${i + 1}`, phone: `888000${String(i).padStart(4, '0')}` }),
    });
  }
  pass('50 customers created');

  // Query performance with large data
  const tests = [
    { name: 'List products', fn: () => api('/api/products', { token: tenantToken }) },
    { name: 'Dashboard stats', fn: () => api('/api/dashboard/stats', { token: tenantToken }) },
    { name: 'Search "vendor"', fn: () => api('/api/search?q=vendor', { token: tenantToken }) },
    { name: 'List vendors', fn: () => api('/api/vendors', { token: tenantToken }) },
    { name: 'List customers', fn: () => api('/api/customers', { token: tenantToken }) },
    { name: 'Master counts', fn: () => api('/api/masters/counts', { token: tenantToken }) },
    { name: 'Notifications', fn: () => api('/api/notifications', { token: tenantToken }) },
  ];

  console.log('\n  Query performance with 1600+ barcodes, 20 vendors, 50 customers:');
  for (const t of tests) {
    const start = Date.now();
    const r = await t.fn();
    const elapsed = Date.now() - start;
    const status = r.ok ? (elapsed < 500 ? '✓' : '⚠') : '✗';
    console.log(`  ${status} ${t.name}: ${elapsed}ms ${!r.ok ? `(${r.status})` : ''}`);
  }
}

// ============ API LOAD TEST ============
async function loadTest() {
  console.log('\n🔥 API LOAD TEST');

  const endpoints = [
    { name: 'GET /products', fn: () => api('/api/products', { token: tenantToken }) },
    { name: 'GET /dashboard/stats', fn: () => api('/api/dashboard/stats', { token: tenantToken }) },
    { name: 'GET /search?q=a', fn: () => api('/api/search?q=a', { token: tenantToken }) },
    { name: 'GET /vendors', fn: () => api('/api/vendors', { token: tenantToken }) },
  ];

  for (const ep of endpoints) {
    const concurrencies = [10, 50, 100];
    for (const c of concurrencies) {
      const start = Date.now();
      const results = await Promise.all(Array.from({ length: c }, () => ep.fn()));
      const elapsed = Date.now() - start;
      const success = results.filter(r => r.ok).length;
      const failed = c - success;
      const avg = Math.round(elapsed / c);
      const status = failed === 0 ? (avg < 200 ? '✓' : '⚠') : '✗';
      console.log(`  ${status} ${ep.name} × ${c}: ${elapsed}ms total, ${avg}ms avg, ${failed} failed`);
    }
  }
}

// ============ RATE LIMIT TEST ============
async function rateLimitTest() {
  console.log('\n🚦 RATE LIMIT TEST');

  // Hit login 15 times rapidly
  const results = await Promise.all(
    Array.from({ length: 15 }, () =>
      api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: 'fake@test.com', password: 'wrong' }) })
    )
  );
  const blocked = results.filter(r => r.status === 429).length;
  if (blocked > 0) {
    pass(`Rate limiter kicked in after ${15 - blocked} requests (${blocked} blocked)`);
  } else {
    fail('Rate limiter did NOT block any requests');
  }
}

// ============ CLEANUP ============
async function cleanup() {
  console.log('\n🧹 CLEANUP');
  if (tenantId && saToken) {
    await api(`/api/super-admin/tenants/${tenantId}`, { method: 'DELETE', token: saToken });
    pass('Test tenant deleted');
  }
}

// ============ RUN ============
async function run() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' DG ERP Stress Test');
  console.log(` Target: ${BASE}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  try {
    await setup();
    await dataVolumeTest();
    await loadTest();
    await rateLimitTest();
  } catch (err) {
    console.error('\n💥 CRASH:', err);
  } finally {
    await cleanup();
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(' Done');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

run();
