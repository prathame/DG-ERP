/**
 * Seed a service-type tenant with lawyer/legal sample data (clients, fees, invoices, payments).
 *
 * Usage:
 *   DATABASE_URL=... npx tsx scripts/seed-lawyer-service-sample.ts --slug=your-slug
 *   DATABASE_URL=... npx tsx scripts/seed-lawyer-service-sample.ts --tenant=T123
 *
 * Idempotent: skips if client "Mehta Industries Pvt Ltd" already exists.
 */
import 'dotenv/config';
import pg from 'pg';
import crypto from 'crypto';

const { Pool } = pg;

const MARKER_CLIENT = 'Mehta Industries Pvt Ltd';

const CLIENTS = [
  {
    name: MARKER_CLIENT,
    contact: 'Anil Mehta',
    phone: '9810011223',
    email: 'anil@mehtaindustries.in',
    address: '14 Nariman Point Mumbai MH 400021',
    gstin: '27AABCM1234A1Z5',
  },
  {
    name: 'Sharma Family Trust',
    contact: 'Priya Sharma',
    phone: '9822022334',
    email: 'priya@sharmatrust.org',
    address: '7 Civil Lines Nagpur MH 440001',
    gstin: null as string | null,
  },
  {
    name: 'Greenfield Developers',
    contact: 'Rahul Desai',
    phone: '9876543210',
    email: 'rahul@greenfield.dev',
    address: '22 SG Highway Ahmedabad GJ 380054',
    gstin: '24AADCG5678B1Z2',
  },
  {
    name: 'Apex Retail LLP',
    contact: 'Neha Kapoor',
    phone: '9988776655',
    email: 'neha@apexretail.in',
    address: '5 Connaught Place New Delhi DL 110001',
    gstin: '07AAEFA9012C1Z8',
  },
  {
    name: 'Kapoor & Sons',
    contact: 'Vikram Kapoor',
    phone: '9123456789',
    email: 'vikram.kapoor@gmail.com',
    address: '18 Residency Road Pune MH 411001',
    gstin: null as string | null,
  },
];

const SERVICES: { name: string; price: number }[] = [
  { name: 'Legal consultation (per hour)', price: 2500 },
  { name: 'Case filing / vakalatnama', price: 5000 },
  { name: 'Court appearance (per hearing)', price: 7500 },
  { name: 'Legal notice drafting', price: 3500 },
  { name: 'Contract / agreement drafting', price: 15000 },
  { name: 'Due diligence review', price: 25000 },
  { name: 'Monthly retainership', price: 40000 },
  { name: 'Arbitration representation', price: 50000 },
  { name: 'Trademark filing assistance', price: 12000 },
  { name: 'Property title opinion', price: 8000 },
];

function uid(prefix: string): string {
  return `${prefix}${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function line(description: string, qty: number, rate: number, gstPercent = 18) {
  const taxable = Math.round(qty * rate * 100) / 100;
  const tax = Math.round(((taxable * gstPercent) / 100) * 100) / 100;
  return {
    description,
    hsnSac: '9982',
    qty,
    rate,
    gstPercent,
    discountPercent: 0,
    taxable,
    tax,
    total: taxable + tax,
  };
}

function parseArgs(argv: string[]) {
  let slug: string | undefined;
  let tenantId: string | undefined;
  for (const a of argv) {
    if (a.startsWith('--slug=')) slug = a.slice('--slug='.length).trim();
    if (a.startsWith('--tenant=')) tenantId = a.slice('--tenant='.length).trim();
  }
  return { slug, tenantId };
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const { slug, tenantId: argTenant } = parseArgs(process.argv.slice(2));
  if (!slug && !argTenant) {
    console.error('Pass --slug=company-slug or --tenant=T…');
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  const needsSsl =
    /sslmode=(require|verify-full|verify-ca)/i.test(url || '') || /\.neon\.tech|\.render\.com/i.test(url || '');
  const pool = new Pool({
    connectionString: url,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });
  const client = await pool.connect();
  try {
    const tenant = (
      await client.query(
        `SELECT id, company_name, business_type, slug FROM tenants WHERE ${
          argTenant ? 'id = $1' : 'LOWER(slug) = LOWER($1)'
        }`,
        [argTenant || slug],
      )
    ).rows[0] as { id: string; company_name: string; business_type: string; slug: string } | undefined;

    if (!tenant) {
      console.error('Tenant not found');
      process.exit(1);
    }
    if (tenant.business_type !== 'service') {
      console.error(`Tenant "${tenant.company_name}" is business_type=${tenant.business_type}; need service`);
      process.exit(1);
    }

    const existing = (
      await client.query(`SELECT id FROM vendors WHERE tenant_id=$1 AND LOWER(name)=LOWER($2)`, [
        tenant.id,
        MARKER_CLIENT,
      ])
    ).rows[0];
    if (existing) {
      console.log(`Sample already present on ${tenant.slug} (${tenant.id}) — nothing to do.`);
      return;
    }

    await client.query('BEGIN');
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenant.id]);

    const vendorIds = new Map<string, string>();
    for (const c of CLIENTS) {
      const id = uid('V');
      await client.query(
        `INSERT INTO vendors (id, tenant_id, name, contact_person, phone, email, address, gst_number)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [id, tenant.id, c.name, c.contact, c.phone, c.email, c.address, c.gstin],
      );
      vendorIds.set(c.name, id);
    }

    const productIds = new Map<string, string>();
    for (const s of SERVICES) {
      const id = uid('P');
      await client.query(
        `INSERT INTO products
           (id, tenant_id, name, price, stock, warranty_months, warranty_applicable, hsn_code, gst_rate, price_includes_gst, status)
         VALUES ($1,$2,$3,$4,0,0,false,'9982',18,false,'Active')`,
        [id, tenant.id, s.name, s.price],
      );
      productIds.set(s.name, id);
      await client.query(
        `INSERT INTO price_lists (id, tenant_id, name, product_id, vendor_id, min_qty, max_qty, price)
         VALUES ($1,$2,'Catalog rate',$3,NULL,1,NULL,$4)`,
        [uid('PL'), tenant.id, id, s.price],
      );
    }

    type InvSpec = {
      number: string;
      client: string;
      date: string;
      status: string;
      items: ReturnType<typeof line>[];
      pay?: number;
    };

    const invoices: InvSpec[] = [
      {
        number: 'LAW-SAMPLE-001',
        client: MARKER_CLIENT,
        date: '2026-07-05',
        status: 'sent',
        items: [line('Monthly retainership', 1, 40000), line('Legal consultation (per hour)', 4, 2500)],
        pay: 50000, // partial
      },
      {
        number: 'LAW-SAMPLE-002',
        client: 'Greenfield Developers',
        date: '2026-07-12',
        status: 'sent',
        items: [line('Due diligence review', 1, 25000), line('Property title opinion', 1, 8000)],
        pay: 38940, // full (33000 + 18%)
      },
      {
        number: 'LAW-SAMPLE-003',
        client: 'Apex Retail LLP',
        date: '2026-07-18',
        status: 'sent',
        items: [line('Legal notice drafting', 1, 3500), line('Court appearance (per hearing)', 2, 7500)],
        // unpaid — outstanding
      },
      {
        number: 'LAW-SAMPLE-004',
        client: 'Kapoor & Sons',
        date: '2026-07-22',
        status: 'sent',
        items: [line('Contract / agreement drafting', 1, 15000)],
        pay: 17700, // full
      },
    ];

    for (const inv of invoices) {
      const partyId = vendorIds.get(inv.client)!;
      const party = CLIENTS.find(c => c.name === inv.client)!;
      const subtotal = inv.items.reduce((s, it) => s + it.taxable, 0);
      const taxTotal = inv.items.reduce((s, it) => s + it.tax, 0);
      const grand = subtotal + taxTotal;
      const half = Math.round((taxTotal / 2) * 100) / 100;
      const invId = uid('INV');
      const itemsWithPid = inv.items.map(it => ({
        ...it,
        productId: productIds.get(it.description),
      }));
      await client.query(
        `INSERT INTO standalone_invoices
           (id, tenant_id, invoice_number, customer_name, customer_gstin, customer_address, customer_phone,
            party_type, party_id, items, subtotal, tax_total, grand_total, notes, status, invoice_date,
            tax_cgst, tax_sgst, tax_igst, is_interstate, gst_enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'vendor',$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,0,false,true)`,
        [
          invId,
          tenant.id,
          inv.number,
          party.name,
          party.gstin,
          party.address,
          party.phone,
          partyId,
          JSON.stringify(itemsWithPid),
          subtotal,
          taxTotal,
          grand,
          'Lawyer sample seed',
          inv.status,
          inv.date,
          half,
          taxTotal - half,
        ],
      );
      if (inv.pay && inv.pay > 0) {
        await client.query(
          `INSERT INTO invoice_payments
             (id, tenant_id, invoice_id, amount, payment_date, payment_method, notes, idempotency_key)
           VALUES ($1,$2,$3,$4,$5,'Bank Transfer','Lawyer sample payment',$6)`,
          [uid('IP'), tenant.id, invId, inv.pay, inv.date, `lawyer-sample-${inv.number}`],
        );
      }
    }

    await client.query('COMMIT');
    console.log(
      `Seeded lawyer sample on "${tenant.company_name}" (${tenant.slug} / ${tenant.id}): ` +
        `${CLIENTS.length} clients, ${SERVICES.length} fees, ${invoices.length} invoices.`,
    );
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* ignore */
    }
    console.error(err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
