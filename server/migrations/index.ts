/**
 * Migration registry — all schema changes after v2.2.0 go here.
 *
 * Naming convention: NNNN_short_description (zero-padded, chronological).
 * Each migration runs exactly once and is recorded in schema_migrations.
 * initSchema() covers everything up to and including the entries below,
 * so only add migrations for changes not yet in initSchema.
 *
 * Example:
 *   { id: '0001_products_add_sku', up: `ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT` },
 */
import type { Migration } from './runner';

export const migrations: Migration[] = [
  /**
   * 0001 — standalone_invoices tenant safety (Phase 2 pre-tenant fix)
   *
   * Problems found:
   *   1. standalone_invoices.tenant_id is nullable — any insert without a tenant
   *      creates a floating invoice no tenant owns.
   *   2. invoice_payments FK references standalone_invoices(id) only — no tenant_id
   *      in the constraint, so a payment could be linked to another tenant's invoice.
   *
   * Fix:
   *   1. Enforce NOT NULL on standalone_invoices.tenant_id.
   *   2. Add UNIQUE(id, tenant_id) so a composite FK can reference it.
   *   3. Drop the old single-column FK and replace with a composite FK that
   *      enforces invoice_payments.tenant_id == standalone_invoices.tenant_id.
   */
  {
    id: '0001_standalone_invoices_tenant_safety',
    up: `
      -- Step 1: backfill any NULLs (should be zero rows in practice)
      -- Skip rows that can't be resolved; they'll fail the NOT NULL constraint below
      -- if any exist (indicating data corruption).

      -- Step 2: enforce NOT NULL
      ALTER TABLE standalone_invoices ALTER COLUMN tenant_id SET NOT NULL;

      -- Step 3: composite unique index (idempotent)
      CREATE UNIQUE INDEX IF NOT EXISTS uq_standalone_invoices_id_tenant
        ON standalone_invoices(id, tenant_id);

      -- Step 4: drop the old single-column FK (ignore if already removed)
      DO $$ BEGIN
        ALTER TABLE invoice_payments DROP CONSTRAINT IF EXISTS invoice_payments_invoice_fk;
      EXCEPTION WHEN undefined_object THEN NULL;
      END $$;

      -- Step 5: add composite FK — enforces cross-tenant payment safety at DB level
      DO $$ BEGIN
        ALTER TABLE invoice_payments
          ADD CONSTRAINT invoice_payments_invoice_tenant_fk
          FOREIGN KEY (invoice_id, tenant_id)
          REFERENCES standalone_invoices(id, tenant_id)
          ON DELETE RESTRICT;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `,
  },

  /**
   * 0002 — book_voucher_entries/items orphan protection (Phase 2 pre-tenant fix)
   *
   * book_voucher_entries and book_voucher_items have no FK to book_vouchers.
   * A partial delete or direct DB manipulation could leave orphaned entries.
   * Adding ON DELETE CASCADE ensures entries/items are always cleaned up
   * when a voucher is deleted.
   */
  {
    id: '0002_book_voucher_entries_fk',
    up: `
      -- book_voucher_entries → book_vouchers cascade
      DO $$ BEGIN
        ALTER TABLE book_voucher_entries
          ADD CONSTRAINT bve_voucher_fk
          FOREIGN KEY (voucher_id) REFERENCES book_vouchers(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;

      -- book_voucher_items → book_vouchers cascade
      DO $$ BEGIN
        ALTER TABLE book_voucher_items
          ADD CONSTRAINT bvi_voucher_fk
          FOREIGN KEY (voucher_id) REFERENCES book_vouchers(id) ON DELETE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `,
  },

  /**
   * 0003 — Performance indexes for notification digest queries (Phase 2)
   *
   * buildDigests() runs 6 sequential pool.query() calls per /api/notifications
   * request. Without compound indexes, each fires a full tenant partition scan.
   */
  {
    id: '0003_notification_digest_indexes',
    up: `
      CREATE INDEX IF NOT EXISTS idx_pl_tenant_valid_to
        ON price_lists(tenant_id, valid_to) WHERE is_active = true;

      CREATE INDEX IF NOT EXISTS idx_quotations_tenant_valid_until
        ON quotations(tenant_id, status, valid_until);

      CREATE INDEX IF NOT EXISTS idx_warranties_tenant_status_expiry
        ON warranties(tenant_id, status, expiry_date);

      CREATE INDEX IF NOT EXISTS idx_vendor_payments_date
        ON vendor_payments(tenant_id, payment_date);
    `,
  },
];
