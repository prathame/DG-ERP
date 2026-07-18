import { describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/** Lightweight mirror of local router party-key + finance shape rules (no IndexedDB). */
function parseLocalPartyKey(raw: string): {
  partyType: 'vendor' | 'customer' | null;
  partyId: string | null;
  clientName: string | null;
  partyKey: string;
} {
  const key = (() => {
    try {
      return decodeURIComponent(raw || '').trim();
    } catch {
      return (raw || '').trim();
    }
  })();
  if (key.startsWith('vendor:') || key.startsWith('customer:')) {
    const i = key.indexOf(':');
    const partyType = key.slice(0, i) as 'vendor' | 'customer';
    const partyId = key.slice(i + 1).trim();
    if (!partyId) return { partyType: null, partyId: null, clientName: '', partyKey: 'name:' };
    return { partyType, partyId, clientName: null, partyKey: `${partyType}:${partyId}` };
  }
  const name = key.startsWith('name:') ? key.slice(5) : key;
  return { partyType: null, partyId: null, clientName: name, partyKey: `name:${name}` };
}

describe('service-mobile invoice-finance party keys', () => {
  it('parses vendor:ID without splitting UUID-like ids on colon only once', () => {
    const p = parseLocalPartyKey(encodeURIComponent('vendor:V-abc:extra'));
    expect(p.partyType).toBe('vendor');
    expect(p.partyId).toBe('V-abc:extra');
    expect(p.partyKey).toBe('vendor:V-abc:extra');
  });

  it('parses name: and legacy plain names', () => {
    expect(parseLocalPartyKey('name:Walk-in').clientName).toBe('Walk-in');
    expect(parseLocalPartyKey('Walk-in').partyKey).toBe('name:Walk-in');
  });
});

describe('service-mobile invoice-finance SQL shapes', () => {
  async function setupDb() {
    const schemaPath = resolve(__dirname, '../../src/platforms/service-mobile/local/schema.ts');
    const schema = readFileSync(schemaPath, 'utf8');
    const m = schema.match(/export const SERVICE_MOBILE_SCHEMA_SQL = `([\s\S]*?)`;/);
    const mig = schema.match(/export const SERVICE_MOBILE_MIGRATIONS_SQL = `([\s\S]*?)`;/);
    if (!m) throw new Error('schema SQL missing');
    const db = await PGlite.create();
    await db.exec(m[1]!);
    if (mig) {
      for (const s of mig[1]!
        .split(';')
        .map(x => x.trim())
        .filter(Boolean)) {
        try {
          await db.exec(`${s};`);
        } catch {
          /* ignore migration noise in unit test */
        }
      }
    }
    await db.query(`INSERT INTO tenants (id, company_name, slug, business_type) VALUES ('t1','T','t','service')`);
    return db;
  }

  it('summary groups by party key with camelCase-ready columns', async () => {
    const db = await setupDb();
    await db.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, party_type, party_id, status, grand_total, total, invoice_date, items)
       VALUES ('inv1','t1','INV-1','Acme','vendor','v1','sent',118,118,'2026-07-01','[]')`,
    );
    await db.query(
      `INSERT INTO invoice_payments (id, tenant_id, invoice_id, amount, payment_date, payment_method, method)
       VALUES ('p1','t1','inv1',50,'2026-07-02','Cash','Cash')`,
    );

    const { rows } = await db.query(
      `SELECT
         CASE
           WHEN si.party_type IS NOT NULL AND si.party_id IS NOT NULL THEN si.party_type || ':' || si.party_id
           ELSE 'name:' || COALESCE(si.customer_name, si.client_name, 'Unknown')
         END AS party_key,
         MAX(COALESCE(si.customer_name, si.client_name, 'Unknown')) AS customer_name,
         COUNT(si.id)::int AS invoice_count,
         COALESCE(SUM(COALESCE(si.grand_total, si.total, 0)), 0) AS total_invoiced,
         COALESCE(SUM(ip.paid), 0) AS total_paid
       FROM standalone_invoices si
       LEFT JOIN (
         SELECT invoice_id, SUM(amount) AS paid FROM invoice_payments WHERE tenant_id=$1 GROUP BY invoice_id
       ) ip ON si.id = ip.invoice_id
       WHERE si.tenant_id=$1 AND COALESCE(si.status,'') != 'cancelled'
       GROUP BY 1`,
      ['t1'],
    );

    const mapped = rows.map(r => ({
      partyKey: r.party_key,
      clientName: r.customer_name,
      invoiceCount: Number(r.invoice_count),
      totalInvoiced: Number(r.total_invoiced),
      totalPaid: Number(r.total_paid),
      balance: Number(r.total_invoiced) - Number(r.total_paid),
    }));

    expect(mapped).toHaveLength(1);
    expect(mapped[0]).toMatchObject({
      partyKey: 'vendor:v1',
      clientName: 'Acme',
      invoiceCount: 1,
      totalInvoiced: 118,
      totalPaid: 50,
      balance: 68,
    });
    await db.close();
  });

  it('backfills ledger for status=paid invoices with no payments', async () => {
    const db = await setupDb();
    await db.query(
      `INSERT INTO standalone_invoices
         (id, tenant_id, invoice_number, customer_name, party_type, party_id, status, grand_total, total, invoice_date, items)
       VALUES ('inv2','t1','INV-2','Beta','vendor','v2','paid',200,200,'2026-07-01','[]')`,
    );

    const { rows: before } = await db.query(
      `SELECT COALESCE(SUM(amount),0) AS t FROM invoice_payments WHERE invoice_id='inv2' AND tenant_id='t1'`,
    );
    expect(Number((before[0] as { t: number }).t)).toBe(0);

    // Same reconcile logic as local router
    const { rows: unpaid } = await db.query(
      `SELECT si.id, COALESCE(si.grand_total, si.total, 0) AS grand_total,
              COALESCE((SELECT SUM(ip.amount) FROM invoice_payments ip WHERE ip.invoice_id=si.id AND ip.tenant_id=$1),0) AS paid
       FROM standalone_invoices si WHERE si.tenant_id=$1 AND si.status='paid'`,
      ['t1'],
    );
    for (const r of unpaid as { id: string; grand_total: number; paid: number }[]) {
      const remaining = Number(r.grand_total) - Number(r.paid);
      if (remaining > 0.001) {
        await db.query(
          `INSERT INTO invoice_payments
             (id, tenant_id, invoice_id, amount, payment_date, method, payment_method, notes)
           VALUES ($1,'t1',$2,$3,'2026-07-18','Cash','Cash','Marked paid (ledger sync)')`,
          [`IP-${r.id}`, r.id, remaining],
        );
      }
    }

    const { rows: after } = await db.query(
      `SELECT COALESCE(SUM(amount),0) AS t FROM invoice_payments WHERE invoice_id='inv2' AND tenant_id='t1'`,
    );
    expect(Number((after[0] as { t: number }).t)).toBe(200);
    await db.close();
  });
});
