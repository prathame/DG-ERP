/**
 * Local IMS-lite actions for GSTR-2B reconcile.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { pool, cleanupTestData } from '../helpers';
import {
  extractGstr2bRtnprd,
  isGstr2bImsAction,
  listGstr2bImsActions,
  loadGstr2bImsActionMap,
  mergeImsActionsIntoRows,
  upsertGstr2bImsAction,
} from '../../server/services/gstr2bIms';
import type { Gstr2bReconRow } from '../../server/services/gstr2bReconcile';

const TENANT = 'T-TEST-GSTR2B-IMS';

describe('gstr2bIms', () => {
  beforeAll(async () => {
    await pool.query(
      `INSERT INTO tenants (id, company_name, slug, admin_email, admin_name, status, business_type)
       VALUES ($1,'GSTR2B IMS',$2,'g2bims@test.com','G2B','active','service')
       ON CONFLICT (id) DO NOTHING`,
      [TENANT, `g2bims-${TENANT.toLowerCase()}`],
    );
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gstr2b_ims_actions (
        tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        rtnprd TEXT NOT NULL,
        ctin TEXT NOT NULL,
        invoice_number TEXT NOT NULL,
        ctin_norm TEXT NOT NULL,
        inum_norm TEXT NOT NULL,
        action TEXT NOT NULL CHECK (action IN ('accept','hold','reject')),
        note TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (tenant_id, rtnprd, ctin_norm, inum_norm)
      )
    `);
  });

  afterAll(async () => {
    await cleanupTestData(TENANT);
    await pool.query(`DELETE FROM tenants WHERE id = $1`, [TENANT]);
  });

  it('extracts rtnprd from portal JSON fields', () => {
    expect(extractGstr2bRtnprd({ rtnprd: '06-2025' })).toBe('062025');
    expect(extractGstr2bRtnprd({ fp: '072025' })).toBe('072025');
    expect(extractGstr2bRtnprd({})).toBe('');
  });

  it('validates action values', () => {
    expect(isGstr2bImsAction('accept')).toBe(true);
    expect(isGstr2bImsAction('hold')).toBe(true);
    expect(isGstr2bImsAction('reject')).toBe(true);
    expect(isGstr2bImsAction('approve')).toBe(false);
  });

  it('upserts Accept, lists by period, and clears on null action', async () => {
    await pool.query(`DELETE FROM gstr2b_ims_actions WHERE tenant_id = $1`, [TENANT]);

    const saved = await upsertGstr2bImsAction(pool, TENANT, {
      rtnprd: '062025',
      ctin: '24-AAAAA-0000-A1Z5',
      invoiceNumber: 'PU/99',
      action: 'accept',
      note: 'ok',
    });
    expect(saved.deleted).toBe(false);
    expect(saved.row?.action).toBe('accept');
    expect(saved.row?.invoiceNumber).toBe('PU/99');

    const listed = await listGstr2bImsActions(pool, TENANT, '062025');
    expect(listed).toHaveLength(1);
    expect(listed[0]?.action).toBe('accept');

    const map = await loadGstr2bImsActionMap(pool, TENANT, '062025');
    expect(map.get('24AAAAA0000A1Z5::PU99')).toBe('accept');

    const cleared = await upsertGstr2bImsAction(pool, TENANT, {
      rtnprd: '062025',
      ctin: '24AAAAA0000A1Z5',
      invoiceNumber: 'PU/99',
      action: null,
    });
    expect(cleared.deleted).toBe(true);
    expect(await listGstr2bImsActions(pool, TENANT, '062025')).toHaveLength(0);
  });

  it('rejects missing period or invoice key', async () => {
    await expect(
      upsertGstr2bImsAction(pool, TENANT, {
        rtnprd: '',
        ctin: '24AAAAA0000A1Z5',
        invoiceNumber: 'X',
        action: 'hold',
      }),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      upsertGstr2bImsAction(pool, TENANT, {
        rtnprd: '062025',
        ctin: '',
        invoiceNumber: 'X',
        action: 'hold',
      }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('merges actions into reconcile rows without changing match fields', () => {
    const rows: Gstr2bReconRow[] = [
      {
        status: 'twob_only',
        supplier: 'ACME',
        ctin: '24AAAAA0000A1Z5',
        invoiceNumber: 'INV-1',
        date: '01-06-2025',
        twoBVal: 100,
        bookVal: 0,
        diff: 100,
        itcAvailable: true,
        source: null,
      },
      {
        status: 'matched',
        supplier: 'ACME',
        ctin: '24AAAAA0000A1Z5',
        invoiceNumber: 'INV-2',
        date: '02-06-2025',
        twoBVal: 50,
        bookVal: 50,
        diff: 0,
        itcAvailable: true,
        source: 'ops',
      },
    ];
    const map = new Map([['24AAAAA0000A1Z5::INV1', 'hold' as const]]);
    const merged = mergeImsActionsIntoRows(rows, map);
    expect(merged[0]?.imsAction).toBe('hold');
    expect(merged[0]?.status).toBe('twob_only');
    expect(merged[0]?.twoBVal).toBe(100);
    expect(merged[1]?.imsAction).toBeNull();
  });
});
