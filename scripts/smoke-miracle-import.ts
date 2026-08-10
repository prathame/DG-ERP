import { pool, initSchema } from '../server/pg-db';
import { uid } from '../server/utils/helpers';
import { importMiracleCompany, locateCompanyDir } from '../server/services/miracleImport';

async function main() {
  const root = process.argv[2] || '/tmp/miracle-cmp0001';
  await initSchema();
  const existing = await pool.query('SELECT id FROM tenants LIMIT 1');
  let tenantId = existing.rows[0]?.id as string | undefined;
  if (!tenantId) {
    tenantId = 'T-miracle-smoke';
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, plan_id, status, business_type, admin_email, admin_name)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [tenantId, 'Mahadev Engineering', 'mahadev-eng', 'TRIAL', 'active', 'accounting', 'mahadev@test.local', 'Admin'],
    );
  } else {
    await pool.query('UPDATE tenants SET business_type=$1 WHERE id=$2', ['accounting', tenantId]);
  }
  console.log('tenant', tenantId);

  for (const sql of [
    'DELETE FROM book_voucher_items WHERE tenant_id=$1',
    'DELETE FROM book_voucher_entries WHERE tenant_id=$1',
    'DELETE FROM book_vouchers WHERE tenant_id=$1',
    'DELETE FROM book_products WHERE tenant_id=$1',
    'DELETE FROM book_ledger_details WHERE tenant_id=$1',
    'DELETE FROM book_ledgers WHERE tenant_id=$1',
    'DELETE FROM book_account_groups WHERE tenant_id=$1',
    'DELETE FROM book_import_jobs WHERE tenant_id=$1',
  ]) {
    await pool.query(sql, [tenantId]);
  }

  const jobId = uid('BJ');
  await pool.query(`INSERT INTO book_import_jobs (id, tenant_id, source, status) VALUES ($1,$2,$3,$4)`, [
    jobId,
    tenantId,
    'miracle',
    'pending',
  ]);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const summary = await importMiracleCompany(client, tenantId, locateCompanyDir(root), jobId);
    await client.query('COMMIT');
    console.log(JSON.stringify(summary, null, 2));
    const counts = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM book_ledgers WHERE tenant_id=$1) as ledgers,
        (SELECT COUNT(*)::int FROM book_products WHERE tenant_id=$1) as products,
        (SELECT COUNT(*)::int FROM book_vouchers WHERE tenant_id=$1) as vouchers,
        (SELECT COUNT(*)::int FROM book_voucher_entries WHERE tenant_id=$1) as entries,
        (SELECT COUNT(*)::int FROM book_voucher_items WHERE tenant_id=$1) as items`,
      [tenantId],
    );
    console.log('DB counts', counts.rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
